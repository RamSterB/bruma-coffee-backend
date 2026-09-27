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
| `SEED_ADMIN_EMAIL` | Correo de la cuenta admin que crea la migración de arranque | `admin@bruma-coffee.test` |
| `SEED_ADMIN_PASSWORD` | Contraseña de esa cuenta admin | `BrumaCafe2026!` |
| `SEED_CUSTOMER_EMAIL` | Correo del cliente de ejemplo | `cliente@bruma-coffee.test` |
| `SEED_CUSTOMER_PASSWORD` | Contraseña del cliente de ejemplo | `BrumaCafe2026!` |
| `JWT_SECRET` | Secreto de firma del access token, mínimo 32 caracteres | *(obligatoria, sin default)* |
| `ACCESS_TOKEN_TTL_SECONDS` | Vida del access token, en segundos | `900` |
| `REFRESH_TOKEN_TTL_SECONDS` | Vida del refresh token y de su cookie, en segundos | `604800` |
| `LOGIN_MAX_ATTEMPTS` | Intentos de login por ventana, contados por correo y por IP | `5` |
| `LOGIN_WINDOW_MS` | Duración de esa ventana, en milisegundos | `60000` |
| `BCRYPT_ROUNDS` | Coste de bcrypt al cifrar contraseñas | `10` |

No hay variable `DB_SYNCHRONIZE`: el esquema se gestiona **solo** con migraciones y
`synchronize` está en `false` fijo en el código.

### El secreto de firma es obligatorio y la aplicación no arranca sin él

`JWT_SECRET` es la única variable sin default: en desarrollo se escribe uno en `.env`, y en
producción sale del almacén de secretos. No hay un valor de reserva en el código porque un
secreto de ejemplo que se queda puesto en un despliegue es un token falso que alguien puede
firmar por la aplicación.

Si la variable falta, está vacía, son espacios o mide menos de 32 caracteres, el arranque aborta
con un error que dice cuál de las dos cosas pasa. La razón es que una aplicación que arranca sin
poder firmar parece sana y no lo está: acepta tráfico y responde 401 a todos los logins, con
cuatro causas posibles y ninguna evidente. Es preferible no levantar el servicio.

### La contraseña del admin no está en el código

La migración de arranque crea un admin y un cliente, pero su contraseña sale de
`SEED_ADMIN_PASSWORD` y `SEED_CUSTOMER_PASSWORD`. Hay valores por defecto para desarrollo y
**en producción la migración aborta** si se detectan: una contraseña de admin escrita en el
código queda en el historial de git para siempre, y ahí no se puede cambiar. Las dos cuentas
nacen con `customers` propio y correo verificado, para que se pueda entrar sin tener que pasar
todavía por la verificación de correo.

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

El esquema se gestiona con migraciones de TypeORM, en todos los entornos. `synchronize: false`
está escrito en `src/config/data-source.ts` y no se puede activar por variable de entorno, a
propósito: `synchronize` puede borrar datos sin avisar.

```bash
pnpm m:gen -- ./migrations/mi-migracion   # genera una migración
pnpm m:run                                # aplica migraciones pendientes
pnpm m:revert                             # revierte la última
```

## Endpoints

La documentación interactiva está en **`http://localhost:8000/api/docs`** (prefijo global `/api`),
generada con decoradores de `@nestjs/swagger`. Cuando la API esté desplegada, la URL pública se
añade en este README.

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/coffee` | Lista paginada y filtrable del catálogo. Filtros: `region`, `process`, `roastLevel`, `page`, `limit` |
| `GET` | `/api/coffee/:id` | Detalle de un café con sus variantes de peso |
| `GET` | `/api/variants?variantIds=<uuid>,<uuid>` | Resuelve variantes por identificador para el carrito. Máximo 50 ids |

**No hay endpoints de escritura.** El catálogo se siembra con migraciones y no se expone creación
de productos por API: el contenido de la tienda es un dato, no algo que edite el cliente.

## Modelo de datos

El esquema se gestiona con migraciones de TypeORM. Hoy hay dos tablas, que son las que sostiene el
catálogo y el carrito:

```
┌──────────────────────────────┐        ┌───────────────────────────────────┐
│ coffees                      │ 1    n │ coffee_variants                   │
├──────────────────────────────┤────────│───────────────────────────────────┤
│ id             uuid PK       │        │ id             uuid PK             │
│ name           varchar(120)  │        │ coffee_id      uuid FK → coffees   │
│ description    text          │        │ weight_grams   int > 0            │
│ region         varchar(30)   │        │ price          numeric(12,2) ≥ 0  │
│ process        varchar(20)   │        │ stock          int ≥ 0            │
│ roast_level    varchar(20)   │        │ is_active      boolean             │
│ tasting_notes  text[]        │        │ created_at / updated_at           │
│ search_index   text          │        │ UNIQUE (coffee_id, weight_grams)  │
│ is_active      boolean       │        └───────────────────────────────────┘
│ created_at / updated_at      │          ON DELETE CASCADE desde coffees
└──────────────────────────────┘
```

Detalles que no se ven en el diagrama y sí importan:

- **Enums cerrados con `CHECK` en base de datos.** `region`, `process` y `roast_level` están
  validados en el dominio *y* con una restricción `CHECK` en la tabla, para que ningún INSERT que
  se cuele por la backdoor pueda meter un valor inventado.
- **`search_index`** se añadió en una migración aparte y se rellena en la aplicación con el
  nombre, la región, el proceso, el nivel de tueste y las notas de cata, todo sin acentos ni
  mayúsculas. Existe para que la búsqueda se pueda probar sin depender de `unaccent`, que depende
  de la configuración regional del servidor.
- **`price_from` no es una columna.** Es un método del dominio que devuelve el precio de la
  variante más barata, o `null` si el café no tiene variantes activas. Se calcula al leer, porque
  almacenarlo se desincronizaría en cuanto cambiara el precio de una variante.
- Índices en `region`, `roast_level`, `process`, `is_active`, `search_index`, `coffee_id` y `stock`,
  que son las columnas por las que se filtra.

Las tablas de órdenes, pagos, carritos y usuarios están **diseñadas pero todavía no migradas**: el
catálogo es lo único que está en la base de datos hoy.

## Cobertura

```bash
pnpm test:cov
```

| Capa | Cobertura |
|---|---|
| `application/use-cases` | 100 % |
| `domain` (entidades, enums, errores, búsqueda) | 100 % |
| `infrastructure/persistence` | 95 % stmts · 93 % branches |
| `interfaces/http` | Parcial: falta cubrir el controlador de catálogo |
| **Global** | **78 % stmts · 85 % branches · 79 % funcs · 78 % lines** |

El umbral que impone CI tiene dos partes: **69/81/70/69** (statements/branches/functions/lines) de
forma global, y **90/88/85/92** para `infrastructure/persistence`, que es la capa que más se toca.
Los dos están por debajo de lo que debería exigir un proyecto en producción, y subirlos es trabajo
abierto: el hueco real no es un número, es que `CoffeeController` todavía no tiene ni un test, y es
el único archivo de `src/` con 0 % de cobertura.

## Acceso desde Windows

| Servicio | URL |
|---|---|
| API | `http://localhost:8000/api` |
| Swagger | `http://localhost:8000/api/docs` |
| PostgreSQL | `localhost:5432` (pgAdmin/DBeaver) |

## Despliegue en AWS

La guía completa (ECS Fargate + ECR + RDS, migraciones, secrets, CI/CD y despliegue del
frontend estático) está en [`DEPLOYMENT.md`](./DEPLOYMENT.md).