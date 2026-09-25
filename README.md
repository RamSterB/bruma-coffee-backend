# Bruma Coffee Backend

API de **Bruma Coffee** construida con **NestJS**, **TypeORM** y **PostgreSQL**, documentada con
**Swagger** y organizada con **arquitectura hexagonal** (Ports & Adapters).

## Stack

| Capa | Tecnología |
|---|---|
| Framework | NestJS 12 (runtime **ESM-only**, requiere Node ≥ 22) |
| ORM | TypeORM 1.x + `pg` |
| Base de datos | PostgreSQL 16 |
| Validación | class-validator + class-transformer |
| Documentación | @nestjs/swagger (UI en `/api/docs`) |
| Gestor de paquetes | pnpm 10.28.0 (corepack, versión fija) |

> **Nota pnpm (importante):** la versión está **fijada a `10.28.0`** en los tres entornos
> (local, devcontainer y `"packageManager"` de `package.json`) porque el lockfile se genera con esa
> versión. No la subas a `latest`: pnpm 12 aplica una política supply-chain (`minimum-release-age`)
> que **hace fallar la instalación limpia del devcontainer** con
> `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` cuando hay paquetes recién publicados (p. ej.
> `vite@8.3.1` / `rolldown@1.2.11`). Si algún día quieres subirla, hazlo en los tres sitios a la
> vez y regenera los lockfiles.

## Requisitos

- **WSL2** con Docker Desktop y la extensión **Remote - Containers** de VS Code.
- Red Docker compartida `brumacoffeenet` y contenedor `postgres16` (setup en la
  [carpeta contenedor](../README.md)).
- La BD `bruma_coffee` se crea automáticamente en el `postCreateCommand` del devcontainer.

## Arquitectura hexagonal (Ports & Adapters)

```
src/
├── domain/            # Núcleo de dominio (sin dependencias de frameworks)
│   ├── entities/      #   entidades de dominio (ej. Coffee)
│   └── ports/         #   interfaces de repositorio (ej. CoffeeRepositoryPort)
├── application/       # Casos de uso; dependen SOLO de los puertos
│   └── use-cases/
├── infrastructure/    # Adaptadores del mundo exterior
│   └── persistence/   #   implementaciones TypeORM de los puertos
└── interfaces/        # Capa de presentación (REST)
    └── http/
        ├── controllers/
        └── dto/       #   DTOs con decoradores Swagger
```

**Regla de dependencia**: las dependencias apuntan hacia el dominio. Ni los casos de uso ni el
dominio conocen TypeORM; el adaptador en `infrastructure/` implementa el puerto y se inyecta con
DI de Nest (`{ provide: CoffeeRepositoryPort, useClass: CoffeeTypeOrmRepository }`).
El módulo de ejemplo `coffee` (CRUD) demuestra el patrón completo.

## Devcontainer

El repositorio incluye `.devcontainer/` (Node 22 + `postgresql-client` + pnpm/corepack).
Desde Windows: **File → Open Folder** sobre esta carpeta y luego **Reopen in Container**.

## Variables de entorno

Copia `cp .env.example .env` si vas a ejecutar fuera del contenedor. El devcontainer ya inyecta
las variables (`DB_HOST=postgres16`, etc.) vía `containerEnv`.

| Variable | Descripción | Default |
|---|---|---|
| `PORT` | Puerto HTTP de la API | `8000` |
| `DB_HOST` | Host de PostgreSQL (nombre del contenedor en la red docker) | `postgres16` |
| `DB_PORT` | Puerto de PostgreSQL | `5432` |
| `DB_USER` | Usuario de la BD | `postgres` |
| `DB_PASSWORD` | Password de la BD | `postgres` |
| `DB_NAME` | Nombre de la BD | `bruma_coffee` |
| `DB_SYNCHRONIZE` | Auto-sincroniza el esquema. **Solo true en dev** | `true` |

## Comandos

```bash
pnpm start:dev    # NestJS en modo watch (puerto 8000)
pnpm build        # nest build -> dist/
pnpm start:prod   # node dist/main
pnpm lint         # eslint
pnpm test         # jest (requiere --experimental-vm-modules)
pnpm test:cov     # cobertura
```

### Migraciones

En producción `DB_SYNCHRONIZE` debe ser `false` y el esquema se gestiona con migraciones:

```bash
pnpm m:gen -- ./migrations/mi-migracion   # genera una migración
pnpm m:run                                # aplica migraciones pendientes
pnpm m:revert                             # revierte la última
```

## Swagger

La documentación de la API está en **`http://localhost:8000/api/docs`** (prefijo global `/api`).
Los endpoints actuales: `GET/POST /api/coffee`.

## Acceso desde Windows

| Servicio | URL |
|---|---|
| API | `http://localhost:8000/api` |
| Swagger | `http://localhost:8000/api/docs` |
| PostgreSQL | `localhost:5432` (pgAdmin/DBeaver) |

## Despliegue en AWS

La guía completa (ECS Fargate + ECR + RDS, migraciones, secrets, CI/CD y despliegue del
frontend estático) está en [`DEPLOYMENT.md`](./DEPLOYMENT.md).