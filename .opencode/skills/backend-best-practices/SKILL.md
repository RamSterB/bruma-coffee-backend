---
name: backend-best-practices
description: Use when writing or reviewing any backend/NestJS code in this repo. Enforces hexagonal architecture (Ports & Adapters), Railway Oriented Programming (ROP), typeORM, Nest 12, TypeScript strict, Swagger and pnpm 10.28.0.
---

# Backend Best Practices (Bruma Coffee API)

## Stack (no negociable)

- **NestJS 12** + **TypeScript** (strict) + **typeORM** (entidades + repositorios/mappers, sin dependencia del ORM en el núcleo).
- **pnpm 10.28.0** (corepack, ver README — NO usar `latest`).
- Pruebas: **Jest** (ver skill `test-driven-development`). Documentación: **Swagger** (ver skill `swagger-openapi`).

## Arquitectura hexagonal (obligatoria)

La app se organiza en **módulos** que implementan **Ports & Adapters**:

```
src/
  modules/
    coffee/
      domain/          # entidades, value objects, reglas puras (sin deps)
        coffee.entity.ts
        coffee.ports.ts          # interfaces (ports): CoffeeRepository, EventPublisher
      application/     # casos de uso / servicios (orquestan ports, sin Nest/ORM)
        services/
          create-coffee.use-case.ts
        dtos/          # request/response (validation)
      infrastructure/  # adapters (prims: Nest, typeORM repos, HTTP)
        repositories/typeorm-coffee.repository.ts   # implementa CoffeeRepository
        controllers/coffee.controller.ts
        mappers/coffee.mapper.ts
    shared/
      exceptions/
      value-objects/
```

### Reglas de capas

- **El dominio NO importa Nest ni typeORM.** Entidades de dominio ≠ entidades de typeORM; usa mappers en `infrastructure`.
- **Casos de uso** (application) dependen de **ports** (interfaces), nunca de adapters concretos.
- **Controllers/adapters son capas delgadas**: validan entrada (DTO + `class-validator`), llaman al caso de uso, traducen errores a HTTP.
- Inyección: Nest DI en `infrastructure`/`application`; registra ports con `{ provide: 'COFFEE_REPOSITORY', useClass: TypeOrmCoffeeRepository }` y consume vía `@Inject('COFFEE_REPOSITORY')`.

## Railway Oriented Programming (ROP)

Flujos de resultado encadenados con tipo **`Result<T, E>`** (monad). Nada de throw para esperar flujos ni de `try/catch` por dominio.

```ts
type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

const ok = <T, E>(value: T): Result<T, E> => ({ ok: true, value });
const err = <T, E>(error: E): Result<T, E> => ({ ok: false, error });

function andThen<T, U, E>(r: Result<T, E>, fn: (v: T) => Result<U, E>): Result<U, E> {
  return r.ok ? fn(r.value) : r;   // corta el "riell" si ya falló
}

function map<T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}
```

### Convenciones

- `saveCoffee(input)` devuelve `Result<Coffee, AppError>`; los errores "esperables" (duplicado, no encontrado, validación) son **valores**, no excepciones.
- Dos raíles: **Success rail** = flujo feliz; **Failure rail** = errores capturados. `andThen`/`map` encadenan sin ifs anidados.
- Guarda contra la tentación: si el caso de uso "no-puede-fallar", `Result<void, never>` es aceptable; pero casi siempre hay al menos un error esperable.
- En el **controller**, despacha según el resultado:

```ts
const res = await useCase.execute(dto);
if (!res.ok) throw new HttpException(res.error, res.error.status ?? 500);
return res.value;
```

## typeORM

- Entidades en `infrastructure/repositories` con decoradores (`@Entity`, `@Column`).
- **Mappers** convierten entidad de dominio ↔ entidad ORM. El dominio nunca ve `@Column()`.
- Relaciones vía `relations`/`QueryBuilder` explícito; evita lazy loading por defecto (N+1).
- Transacciones con `dataSource.transaction()` cuando un caso de uso toca >1 entidad.

## Errores

- Jerarquía `AppError` con `status` (HTTP) y categoría. Errores de validación (DTO) → `BadRequest`; no encontrado → `NotFound`; duplicado → `Conflict`.
- Todos los errores no esperados caen al **failure rail** y terminan en un filtro global que responde JSON con `statusCode`, `message`, `timestamp`.

## TypeScript

- `strict: true`. `interface` para contratos (ports), `type` para uniones/Result.
- Prohibido `any`. `unknown` + narrowing para datos externos y deserialización.
- Generics (como en `Result<T,E>`) con naming corto y consistente: `T`, `U`, `E`.

## Comprobación final

- [ ] El dominio no importa de `@nestjs/*` ni `typeorm`.
- [ ] Cada caso de uso devuelve `Result<...>` y sigue el failure/rail.
- [ ] Cada port (`*Ports.ts`) tiene al menos un adapter en `infrastructure` registrado en DI.
- [ ] Endpoints documentados con `@ApiTags/@ApiOperation` (ver skill swagger).
- [ ] `pnpm lint` y `pnpm test` en verde antes de cerrar.
