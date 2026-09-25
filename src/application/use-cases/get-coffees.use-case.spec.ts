import { CoffeeProcess } from '../../domain/enums/coffee-process.enum'
import { CoffeeRegion } from '../../domain/enums/coffee-region.enum'
import { RoastLevel } from '../../domain/enums/roast-level.enum'
import { buildCoffee, buildPage, FakeCoffeeRepository } from '../../testing/coffee.fixtures'
import { GetCoffeesUseCase } from './get-coffees.use-case'

describe('GetCoffeesUseCase', () => {
  it('devuelve la página que trae el repositorio', async () => {
    const coffee = buildCoffee('1')
    const repository = new FakeCoffeeRepository(buildPage([coffee], 1))

    const result = await new GetCoffeesUseCase(repository).execute({
      page: 1,
      limit: 12,
    })

    expect(result.items).toEqual([coffee])
    expect(result.total).toBe(1)
  })

  it('reenvía los filtros al repositorio sin alterarlos', async () => {
    const repository = new FakeCoffeeRepository()

    await new GetCoffeesUseCase(repository).execute({
      region: CoffeeRegion.NARIÑO,
      process: CoffeeProcess.NATURAL,
      roastLevel: RoastLevel.LIGHT,
      search: 'geisha',
      page: 2,
      limit: 6,
    })

    expect(repository.lastFilters).toEqual({
      region: CoffeeRegion.NARIÑO,
      process: CoffeeProcess.NATURAL,
      roastLevel: RoastLevel.LIGHT,
      search: 'geisha',
      page: 2,
      limit: 6,
    })
  })

  it('normaliza el texto de búsqueda quitando espacios', async () => {
    const repository = new FakeCoffeeRepository()

    await new GetCoffeesUseCase(repository).execute({
      page: 1,
      limit: 12,
      search: '  geisha  ',
    })

    expect(repository.lastFilters?.search).toBe('geisha')
  })

  it('deja la búsqueda en undefined si viene solo con espacios', async () => {
    const repository = new FakeCoffeeRepository()

    await new GetCoffeesUseCase(repository).execute({
      page: 1,
      limit: 12,
      search: '   ',
    })

    expect(repository.lastFilters?.search).toBeUndefined()
  })

  it('rechaza una región que no existe en el catálogo cerrado', async () => {
    const repository = new FakeCoffeeRepository()

    await expect(
      new GetCoffeesUseCase(repository).execute({
        page: 1,
        limit: 12,
        region: 'magdalena' as CoffeeRegion,
      }),
    ).rejects.toThrow(/magdalena/)
  })

  it('rechaza un proceso inválido', async () => {
    const repository = new FakeCoffeeRepository()

    await expect(
      new GetCoffeesUseCase(repository).execute({
        page: 1,
        limit: 12,
        process: 'karma' as CoffeeProcess,
      }),
    ).rejects.toThrow(/karma/)
  })

  it('rechaza un tueste inválido', async () => {
    const repository = new FakeCoffeeRepository()

    await expect(
      new GetCoffeesUseCase(repository).execute({
        page: 1,
        limit: 12,
        roastLevel: 'x' as RoastLevel,
      }),
    ).rejects.toThrow(/x/)
  })

  it('rechaza una página cero o negativa', async () => {
    const repository = new FakeCoffeeRepository()

    await expect(new GetCoffeesUseCase(repository).execute({ page: 0, limit: 12 })).rejects.toThrow(
      /página/i,
    )
    await expect(
      new GetCoffeesUseCase(repository).execute({ page: -1, limit: 12 }),
    ).rejects.toThrow(/página/i)
  })

  it('rechaza un límite de cero', async () => {
    const repository = new FakeCoffeeRepository()

    await expect(new GetCoffeesUseCase(repository).execute({ page: 1, limit: 0 })).rejects.toThrow(
      /límite/i,
    )
  })

  it('rechaza un límite excesivo', async () => {
    const repository = new FakeCoffeeRepository()

    await expect(
      new GetCoffeesUseCase(repository).execute({ page: 1, limit: 101 }),
    ).rejects.toThrow(/límite/i)
  })
})
