---
name: test-driven-development
description: Use when writing ANY new feature, bugfix, or refactor in this backend. Enforces Red-Green-Refactor with Jest + supertest (e2e) + unit tests aislados. Write the failing test first, watch it fail, then implement.
---

# Test-Driven Development (Jest, backend NestJS)

**Regla de hierro — NO hay código de producción sin un test que falle primero.**

## Ciclo RED → GREEN → REFACTOR

1. **RED** — escribe un test mínimo que falle por la razón correcta.
2. **Verifica RED** — ejecuta `pnpm test <ruta>` (o `pnpm test:e2e` para e2e). Debe **fallar** (no pasar, no die).
3. **GREEN** — mínimo código para pasar.
4. **Verifica GREEN** — el mismo test debe **pasar**.
5. **REFACTOR** — limpia duplicación. Los tests siguen verdes.

## Stack

- **Jest** (unit) en `*.spec.ts` junto al código; **supertest + `Test.createTestingModule`** en `test/*.e2e-spec.ts`.
- Probar **ports/adapters por separado**: domina dados de dominio/mappers; infraestructura con repos fake implementando el port.
- Nest DI en tests: `Test.createTestingModule({ providers: [{ provide: 'COFFEE_REPOSITORY', useClass: FakeCoffeeRepository }] })`.

```ts
describe('CreateCoffeeUseCase', () => {
  let useCase: CreateCoffeeUseCase;
  const repo: CoffeeRepository = new FakeCoffeeRepository();

  beforeEach(() => { useCase = new CreateCoffeeUseCase(repo); });

  it('returns ok when coffee is created', async () => {
    const res = await useCase.execute({ name: 'Catuai' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.name).toBe('Catuai');
  });
});
```

- e2e apunta al **endpoint HTTP real** (supertest) levantando el AppModule; respeta Swagger (status codes).

## Buenos tests (y malos)

| Bien | Mal |
|---|---|
| Un solo comportamiento por `it` | `it('test1')` con nombre vago |
| Nombre describe conducta esperada | Prueba la implementación |
| Usa fakes/in-memory de ports | Mock de TODO internamente |
| Valida `Result` ok/err y sus payloads | `try/catch` dentro del test para "probar errores" |
| e2e valida status + body + Swagger doc | e2e solo comprueba "status 200" |

## Requisitos

- `pnpm test` y `pnpm test:e2e` pasan sin warnings antes de cerrar una tarea.
- Si un test pasa al escribirlo: borra y vuelve a RED (probablemente no prueba nada).
- Para errores esperables (negocio) usa el **failure rail de ROP** (ver `backend-best-practices`), no `try/catch` de infra.
- Corre la suite completa al terminar, no solo el archivo modificado.

## Anti-patterns de tests backend

1. Test que depende de la base de datos de dev → usa fakes/in-memory o e2e con `bootstrap` de test DB aislada.
2. `it` que mezcla setup de dependencias con aserciones → separa.
3. Mockear `typeorm` por completo ganando nada → prueba el adapter con repos fake y el dominio con mappers.
4. No usar `describe` para anidar sin necesidad; 2 niveles máximo.
