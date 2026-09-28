import { CoffeeNotFoundError } from '../../domain/errors/coffee-not-found.error'
import { buildCoffee, buildPage, FakeCoffeeRepository } from '../../testing/coffee.fixtures'
import { GetCoffeeByIdUseCase } from './get-coffee-by-id.use-case'

describe('GetCoffeeByIdUseCase', () => {
  it('devuelve el café cuando existe', async () => {
    const coffee = buildCoffee('1')
    const repository = new FakeCoffeeRepository(buildPage([], 0), coffee)

    await expect(new GetCoffeeByIdUseCase(repository).execute('1')).resolves.toBe(coffee)
  })

  it('lanza CoffeeNotFoundError si no existe', async () => {
    const repository = new FakeCoffeeRepository(buildPage([], 0), null)

    await expect(new GetCoffeeByIdUseCase(repository).execute('99')).rejects.toBeInstanceOf(
      CoffeeNotFoundError,
    )
  })

  it('devuelve el café dueño cuando le pasan el id de una variante', async () => {
    // **El resultado del pago solo tiene el id de la variante**, porque el pedido guarda
    // el nombre del café como copia del momento y no su id: el café puede desaparecer
    // del catálogo y el pedido tiene que seguir en pie. Así que el enlace de "ver el café"
    // llega aquí con un id de variante, y si esta búsqueda no lo resuelve, el botón
    // lleva a una página que no encuentra nada.
    const coffee = buildCoffee('1')
    const repository = new FakeCoffeeRepository(buildPage([], 0), coffee)
    repository.cafeDeLaVariante = { 'variante-1': '1' }

    await expect(new GetCoffeeByIdUseCase(repository).execute('variante-1')).resolves.toBe(coffee)
  })

  it('lanza CoffeeNotFoundError si el id no es ni de café ni de variante', async () => {
    const repository = new FakeCoffeeRepository(buildPage([], 0), null)
    repository.cafeDeLaVariante = {}

    await expect(new GetCoffeeByIdUseCase(repository).execute('99')).rejects.toBeInstanceOf(
      CoffeeNotFoundError,
    )
  })

  it('rechaza un id vacío', async () => {
    const repository = new FakeCoffeeRepository()

    await expect(new GetCoffeeByIdUseCase(repository).execute('  ')).rejects.toThrow(/id/i)
  })
})
