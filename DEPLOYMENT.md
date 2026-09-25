# Despliegue en AWS

Guía para publicar **Bruma Coffee** en AWS (prueba técnica). Cubre una arquitectura moderna,
económica y reproducible: backend en **ECS Fargate + ALB**, PostgreSQL en **RDS** y frontend
estático en **S3 + CloudFront**.

## Arquitectura objetivo

```
                 ┌────────────────────────┐        ┌─────────────────────┐
  Usuarios ────► │ CloudFront (HTTPS)     ├──/───► │ S3 (dist/ frontend) │
                 │  + ACM + Route 53      │        └─────────────────────┘
                 └───────────┬────────────┘
                             │ https://api.tudominio
                 ┌───────────▼────────────┐        ┌─────────────────────┐
                 │ ALB (balanceador)      ├──────► │ ECS Fargate:        │
                 │  health: /health       │        │  bruma-coffee-backend│
                 └───────────┬────────────┘        └──────────┬──────────┘
                             │ VPC (redes privadas)           │ 5432 (SG privado)
                                              ┌───────────────▼─────────┐
                                              │ RDS PostgreSQL          │
                                              │  (Secrets Manager)      │
                                              └─────────────────────────┘
```

## Consideraciones clave de este stack

1. **Runtime Node**: NestJS 12 es **ESM-only**. Contenedor de producción con **Node 22+**
   (idealmente `node:22-alpine` o `bookworm`) porque usa `require(esm)` de Node ≥ 22.
2. **Migraciones, no `synchronize`**: `DB_SYNCHRONIZE=true` solo en desarrollo. En AWS
   `DB_SYNCHRONIZE=false` (o no se define) y el esquema se aplica con `pnpm m:run`.
3. **Secretos**: nunca en la imagen, en el repo ni en `.env`. Se inyectan como environment
   del task de ECS desde **AWS Secrets Manager / SSM Parameter Store**, y en CI desde
   **GitHub Actions secrets**.
4. **CORS/Swagger**: `enableCors({ origin: true })` y Swagger público son de desarrollo.
   En producción restringir CORS al dominio del frontend y decidir si se expone `/api/docs`
   (por ejemplo, se desactiva si `NODE_ENV=production`).
5. **`VITE_API_URL` en build-time**: el proxy `/api` de Vite es solo de desarrollo. El build
   del frontend debe apuntar a `https://api.tudominio` cuando se compila en CI.

---

## 1. Base de datos (RDS PostgreSQL)

1. Crear instancia **RDS PostgreSQL 16** (ej. `db.t4g.micro` / `db.t3.micro`, free tier).
   - **Public access: No** (solo VPC / subred privada). Usa un **DB Subnet Group** de subredes privadas.
   - Security group que acepte `5432` únicamente **desde el SG del ECS** (o del Bastion).
2. Guardar credenciales (`DB_USER`, `DB_PASSWORD`) en **Secrets Manager** como secret plano o JSON.
3. Aplicar esquema (opcional manual en la primera vez, luego lo hace CI/CD):
   ```bash
   DATABASE_URL=postgres://USER:PASS@HOST:5432/bruma_coffee pnpm m:run
   ```

## 2. Backend (ECS Fargate + ECR + ALB)

### Dockerfile de producción (multi-stage)

```dockerfile
FROM node:22-bookworm AS build
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-lock.yaml ./pnpm-lock.yaml
EXPOSE 8000
CMD ["node", "dist/main.js"]
```

> **NOTA**: el `dist` se compila con `module: nodenext` y se ejecuta con `node` nativo (no
> `ts-node`). Al ser NestJS 12 ESM-only, la imagen runtime debe ser **Node ≥ 22**.
> Considera ejecutar `pnpm m:run` como paso del CI antes del deploy, o en un init container.

### ECR + ECS

1. Crear repositorio **ECR** y subir la imagen:
   ```bash
   aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
   docker build -t bruma-coffee-backend .
   docker tag bruma-coffee-backend:latest <account>.dkr.ecr.<region>.amazonaws.com/bruma-coffee-backend:latest
   docker push <account>.dkr.ecr.<region>.amazonaws.com/bruma-coffee-backend:latest
   ```
2. **Cluster ECS (Fargate)** → crear **Task Definition** (LINUX/ARM64, CPU 0.25 vCPU / 512MB):
   - Imagen: la del ECR.
   - **Port mappings**: `8000`.
   - **Environment variables**: `PORT=8000`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y
     `DB_PASSWORD` (las tres últimas desde Secrets Manager o SSM), `DB_SYNCHRONIZE=false`.
   - **Health check**: `GET /health` en el puerto 8000 (es el que espera el ALB).
   - **Logs**: driver `awslogs` → grupo/stream en CloudWatch.
   - Rol de ejecución (`executionRole`) con permisos para leer el secret y ECR.
3. **Application Load Balancer** en subredes públicas:
   - Listener **HTTPS 443** (cert de ACM) → Target Group **HTTP 8000** con health check `/health`.
   - Protocolo de health check: `HTTP`, path `/health`, intervalo 30s, unhealthy 5.

### Health endpoint

NestJS no trae `/health` por defecto. La forma más simple sin dependencias extra es agregar:

```ts
// src/interfaces/http/health.controller.ts
import { Controller, Get } from '@nestjs/common'

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: string } {
    return { status: 'ok' }
  }
}
```

y registrarlo en `AppModule`. Alternativa con librería oficial: `@nestjs/terminus`
(`HealthCheckService` + `TypeOrmHealthIndicator`).

## 3. Frontend (S3 + CloudFront)

1. Build en CI con la API apuntando al dominio de producción:
   ```bash
   VITE_API_URL=https://api.tudominio pnpm build
   ```
2. Crear **S3 bucket** (mismo nombre de dominio o uno dedicado) con:
   - **Public access bloqueado** (se sirve solo vía CloudFront).
   - **Bucket policy / OAC** para permitir solo CloudFront.
3. **CloudFront distribution**:
   - **Origin**: el bucket S3 (con **Origin Access Control**).
   - **Behavior**: `GET/HEAD`, cache `dist/`; `index.html` con TTL corto y sin cache (para SPA).
   - **Error 403/404 → `/index.html`** (fallback de SPA con React Router).
4. **Route 53** (dominio propio, opcional en la prueba técnica):
   - Record `frontend` → CloudFront.
   - Record `api` → ALB.
5. Certificados **ACM** (us-east-1 para CloudFront; en la región del ALB para HTTPS).

## 4. CI/CD (GitHub Actions, por repositorio)

Usar **OIDC** (integrar `aws-actions/configure-aws-credentials` con `role-to-assume`) para no
guardar keys de AWS en GitHub.

**Secrets necesarios** (configuración web/console): `AWS_ROLE_ARN`, `AWS_REGION`,
`ECR_REPOSITORY`, `ECS_CLUSTER`, `ECS_SERVICE`, `S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`,
`VITE_API_URL` (frontend) y el `ARN` del secret de la BD (backend).

### Backend (`bruma-coffee-backend/.github/workflows/deploy.yml`)

```yaml
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint && pnpm test && pnpm build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ secrets.AWS_REGION }}
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm m:run          # aplicar migraciones contra RDS
      - run: PGHOST=... PGUSER=... PGPASSWORD=... psql -c 'CREATE DATABASE bruma_coffee' || true
      - run: docker build -t ${{ secrets.ECR_REPOSITORY }}:latest .
      - run: |
          aws ecr get-login-password | docker login --username AWS --password-stdin ${{ secrets.ECR_REPOSITORY }}
          docker push ${{ secrets.ECR_REPOSITORY }}:latest
      - run: |
          aws ecs update-service --cluster ${{ secrets.ECS_CLUSTER }} \
            --service ${{ secrets.ECS_SERVICE }} --force-new-deployment
```

### Frontend (`bruma-coffee-frontend/.github/workflows/deploy.yml`)

```yaml
on:
  push:
    branches: [main]

jobs:
  build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint && pnpm build

  deploy:
    needs: build-test
    runs-on: ubuntu-latest
    permissions: { id-token: write, contents: read }
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ secrets.AWS_REGION }}
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - env: { VITE_API_URL: ${{ secrets.VITE_API_URL }} }
        run: pnpm build
      - run: |
          aws s3 sync dist/ s3://${{ secrets.S3_BUCKET }} --delete
          aws cloudfront create-invalidation --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} --paths "/*"
```

> Ajusta los comandos de migración según tus valores concretos; en producción conviene
> ejecutarlos desde GitHub Actions o un job separado, no como parte del código de la app.

## Checklist de seguridad

- [ ] Sin `.env` ni credenciales en el repositorio (solo `.env.example`).
- [ ] RDS en subred **privada**, SG restringido al SG del ECS.
- [ ] Secrets en **Secrets Manager / SSM**, referenciados por ARN en el task de ECS.
- [ ] Credenciales AWS en CI mediante **OIDC** (sin Access Keys).
- [ ] CORS restringido al dominio real del frontend.
- [ ] `DB_SYNCHRONIZE=false` en producción y esquema vía migraciones.
- [ ] HTTPS en CloudFront y ALB (ACM).
- [ ] Health check `/health` en el Target Group.
- [ ] Logs en CloudWatch con retención definida.

## Alternativas simplificadas

- **Elastic Beanstalk**: env de backend (Single Container, Node 22) + env de frontend (estático)
  si quieres menos piezas que ECS/RDS manual. Aun así usa RDS para la BD.
- **EC2 + systemd/pm2**: un `t3.small` con Node 22 para la API y el build estático servido por
  Nginx. Más manual, menor costo inicial.
- ECS **EC2 launch type** en vez de Fargate si necesitas reservar capacidad a menor precio.

> Recomendación para la prueba técnica: **Fargate + RDS + S3/CloudFront** con la guía anterior.
> Es el patrón más valorado y se ajusta al free tier durante el desarrollo.