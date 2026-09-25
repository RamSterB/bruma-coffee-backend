import { jest } from '@jest/globals'
import { Coffee } from '../../domain/entities/coffee.entity'
import { CoffeeRepositoryPort } from '../../domain/ports/coffee.repository'
import { GetCoffeesUseCase } from './get-coffees.use-case'

describe('GetCoffeesUseCase', () => {
  it('devuelve los cafés del repositorio', async () => {
    const expected = new Coffee(1, 'Geisha Huila', 'Huila, Colombia', 28.5, new Date())
    const repository: Pick<CoffeeRepositoryPort, 'create' | 'findAll'> = {
      create: jest.fn<(coffee: Coffee) => Promise<Coffee>>(),
      findAll: jest.fn<() => Promise<Coffee[]>>().mockResolvedValue([expected]),
    }

    const useCase = new GetCoffeesUseCase(repository as CoffeeRepositoryPort)

    await expect(useCase.execute()).resolves.toEqual([expected])
    expect(repository.findAll).toHaveBeenCalledTimes(1)
  })
})