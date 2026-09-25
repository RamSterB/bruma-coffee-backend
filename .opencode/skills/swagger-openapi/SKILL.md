---
name: swagger-openapi
description: Use when implementing or modifying any NestJS controller/endpoint in this repo. Enforces Swagger/OpenAPI documentation with @nestjs/swagger: tags, operations (summary/description), DTOs with class-validator, responses, and consistent config.
---

# Swagger / OpenAPI (Bruma Coffee API)

## Config global

- App habilitada con `SwaggerModule` en `src/main.ts` (o bootstrap), ruta `/api/docs` (no exponer credenciales; en prod proteger con auth si es público se decide en PR).
- Título/info coherentes con el dominio (Bruma Coffee API) y versión desde `package.json`.

```ts
const config = new DocumentBuilder()
  .setTitle('Bruma Coffee API')
  .setDescription('API de Bruma Coffee')
  .setVersion(appVersion)
  .addTag('coffee')
  .build();
const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api/docs', app, document);
```

## Documentar cada endpoint

Decoradores mínimos obligatorios en cada controller/método:

```ts
@ApiTags('coffee')
@ApiOperation({ summary: 'Lista cafés', description: 'Devuelve cafés paginados filtrables' })
@ApiOkResponse({ type: CoffeeResponseDto, isArray: true })
@ApiNotFoundResponse({ description: 'No existe café con ese id' })
@Controller('coffee')
export class CoffeeController {
  @Get(':id')
  @ApiParam({ name: 'id', type: String, description: 'ID del café' })
  findOne() { ... }
}
```

### DTOs

- DTOs de request/response con **`class-validator`** (`@IsString`, `@IsOptional`, `@Min(0)`, `@IsEnum(...)`).
- DTOs de response con decoradores de tipo de `@nestjs/swagger` (`@ApiProperty`) o **plugin de Swagger** activado (recomendado si el repo ya lo usa).
- No exponer campos sensibles en DTOs de response (nunca `password`, never `id` interno si no toca).

### Conventiones de status

| Caso | Status |
|---|---|
| Creación exitosa | `201 Created` + `@ApiCreatedResponse` |
| Get/Update exitoso | `200` + `@ApiOkResponse` |
| Validación fallida | `400` + `@ApiBadRequestResponse` |
| No encontrado | `404` + `@ApiNotFoundResponse` |
| Conflicto (duplicado) | `409` + `@ApiConflictResponse` |

## Comprobación final

- [ ] Cada endpoint tiene `@ApiOperation({ summary })` (obligatorio).
- [ ] Request/response tipados con DTOs validados, no `any`.
- [ ] Los códigos de respuesta esperables están documentados.
- [ ] `pnpm lint` + `pnpm test` en verde.
