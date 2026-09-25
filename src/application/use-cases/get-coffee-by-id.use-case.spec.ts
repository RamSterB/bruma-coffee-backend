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

  it('rechaza un id vacío', async () => {
    const repository = new FakeCoffeeRepository()

    await expect(new GetCoffeeByIdUseCase(repository).execute('  ')).rejects.toThrow(/id/i)
  })
})
