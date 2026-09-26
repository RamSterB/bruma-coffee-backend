import { DomainError } from '../../domain/enums/assert-enum'
import { buildCoffeeVariant, FakeCoffeeRepository } from '../../testing/coffee.fixtures'
import { GetVariantsByIdsUseCase } from './get-variants-by-ids.use-case'

const linea = (id: string, coffeeName: string) => ({
  variant: buildCoffeeVariant(id, { stock: 10, isActive: true }),
  coffeeName,
})

describe('GetVariantsByIdsUseCase', () => {
  it('devuelve cada variante pedida con el nombre de su café', async () => {
    const repository = new FakeCoffeeRepository()
    repository.variantsByIds = [linea('1', 'Nariño'), linea('2', 'Huila')]

    const resultado = await new GetVariantsByIdsUseCase(repository).execute(['1', '2'])

    expect(resultado).toEqual([
      {
        variantId: '1',
        coffeeId: 'coffee-1',
        coffeeName: 'Nariño',
        weightGrams: 250,
        price: 42000,
        stock: 10,
        isActive: true,
      },
      {
        variantId: '2',
        coffeeId: 'coffee-1',
        coffeeName: 'Huila',
        weightGrams: 250,
        price: 42000,
        stock: 10,
        isActive: true,
      },
    ])
  })

  it('pide una sola vez cada id aunque venga repetido', async () => {
    const repository = new FakeCoffeeRepository()
    repository.variantsByIds = [linea('1', 'Nariño')]

    await new GetVariantsByIdsUseCase(repository).execute(['1', '1', '1'])

    expect(repository.lastVariantIds).toEqual(['1'])
  })

  it('no consulta el repositorio si no hay ids', async () => {
    const repository = new FakeCoffeeRepository()

    await expect(new GetVariantsByIdsUseCase(repository).execute([])).resolves.toEqual([])
    expect(repository.lastVariantIds).toBeNull()
  })

  it('descarta las variantes inactivas', async () => {
    const repository = new FakeCoffeeRepository()
    repository.variantsByIds = [linea('1', 'Nariño')].filter((lineaActual) => {
      return lineaActual.variant.isActive
    })

    const resultado = await new GetVariantsByIdsUseCase(repository).execute(['1', '2'])

    expect(resultado.map((lineaActual) => lineaActual.variantId)).toEqual(['1'])
  })

  it('omite los ids que no existen en vez de fallar', async () => {
    const repository = new FakeCoffeeRepository()
    repository.variantsByIds = [linea('1', 'Nariño')]

    const resultado = await new GetVariantsByIdsUseCase(repository).execute(['1', '99'])

    expect(resultado.map((lineaActual) => lineaActual.variantId)).toEqual(['1'])
  })

  it('rechaza más ids de los que permite una consulta', async () => {
    const repository = new FakeCoffeeRepository()
    const demasiados = Array.from({ length: 51 }, (_, indice) => `id-${indice}`)

    await expect(
      new GetVariantsByIdsUseCase(repository).execute(demasiados),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('rechaza un id en blanco', async () => {
    const repository = new FakeCoffeeRepository()

    await expect(
      new GetVariantsByIdsUseCase(repository).execute(['1', '  ']),
    ).rejects.toBeInstanceOf(DomainError)
  })
})
