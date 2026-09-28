import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { CoffeeTypeOrmRepository } from './coffee.typeorm.repository'
import { CoffeeTypeOrmEntity } from './coffee.typeorm.entity'
import { CoffeeVariantTypeOrmEntity } from './coffee-variant.typeorm.entity'
import {
  aVisibleCoffee,
  seedCoffee,
  withStock,
  type SeedCoffee,
} from '../../testing/catalog.fixtures'
import { resetTestDatabase, truncateCatalog } from '../../testing/test-database'
import type { CoffeeFilters } from '../../domain/ports/coffee.repository'
import { CoffeeProcess } from '../../domain/enums/coffee-process.enum'
import { CoffeeRegion } from '../../domain/enums/coffee-region.enum'
import { RoastLevel } from '../../domain/enums/roast-level.enum'

const noFilters = (overrides: Partial<CoffeeFilters> = {}): CoffeeFilters => ({
  page: 1,
  limit: 12,
  ...overrides,
})

const UNKNOWN_ID = '11111111-1111-4111-8111-111111111111'

describe('CoffeeTypeOrmRepository contra PostgreSQL', () => {
  let dataSource: DataSource
  let repository: CoffeeTypeOrmRepository

  beforeAll(async () => {
    dataSource = await resetTestDatabase()
    repository = new CoffeeTypeOrmRepository(
      dataSource.getRepository(CoffeeTypeOrmEntity),
      dataSource.getRepository(CoffeeVariantTypeOrmEntity),
    )
  })

  afterAll(async () => {
    // Si beforeAll falló, dataSource no existe y destruirlo taparía el error real.
    if (dataSource?.isInitialized) {
      await dataSource.destroy()
    }
  })

  beforeEach(async () => {
    await truncateCatalog(dataSource)
  })

  const seedMany = async (coffees: SeedCoffee[]): Promise<void> => {
    for (const coffee of coffees) {
      await seedCoffee(dataSource, coffee)
    }
  }

  describe('visibilidad', () => {
    it('solo muestra cafés activos con alguna variante activa y con stock', async () => {
      await seedMany([
        aVisibleCoffee({ name: 'Visible' }),
        aVisibleCoffee({ name: 'Inactivo', isActive: false }),
        aVisibleCoffee({ name: 'Sin stock', variants: [withStock({ stock: 0 })] }),
        aVisibleCoffee({ name: 'Variante inactiva', variants: [withStock({ isActive: false })] }),
        aVisibleCoffee({
          name: 'Mezcla',
          variants: [withStock({ stock: 0 }), withStock({ weightGrams: 500 })],
        }),
      ])

      const { items } = await repository.findAll(noFilters())

      expect(items.map((coffee) => coffee.name).sort()).toEqual(['Mezcla', 'Visible'])
    })

    it('cuenta en el total los mismos cafés que devuelve en items', async () => {
      await seedMany([
        aVisibleCoffee({ name: 'A' }),
        aVisibleCoffee({ name: 'B' }),
        aVisibleCoffee({ name: 'Agotado', variants: [withStock({ stock: 0 })] }),
      ])

      const page = await repository.findAll(noFilters())

      expect(page.total).toBe(2)
      expect(page.items).toHaveLength(2)
    })

    it('incluye en el detalle las variantes agotadas de un café visible', async () => {
      const coffee = await seedCoffee(
        dataSource,
        aVisibleCoffee({
          name: 'Con agotado',
          variants: [withStock(), withStock({ weightGrams: 500, stock: 0 })],
        }),
      )

      const found = await repository.findById(coffee.id)

      expect(found?.variants).toHaveLength(2)
      expect(found?.variants.map((variant) => variant.stock).sort()).toEqual([0, 10])
    })
  })

  describe('filtros', () => {
    beforeEach(async () => {
      await seedMany([
        aVisibleCoffee({
          name: 'Lavado huila',
          region: CoffeeRegion.HUILA,
          process: CoffeeProcess.WASHED,
          roastLevel: RoastLevel.LIGHT,
        }),
        aVisibleCoffee({
          name: 'Natural nariño',
          region: CoffeeRegion.NARIÑO,
          process: CoffeeProcess.NATURAL,
          roastLevel: RoastLevel.MEDIUM,
          tastingNotes: ['frutos rojos', 'cacao'],
          description: 'Lote de altura con notas cítricas.',
        }),
        aVisibleCoffee({
          name: 'Honey quindio',
          region: CoffeeRegion.QUINDIO,
          process: CoffeeProcess.HONEY,
          roastLevel: RoastLevel.DARK,
        }),
      ])
    })

    it('filtra por región', async () => {
      const { items, total } = await repository.findAll(noFilters({ region: CoffeeRegion.NARIÑO }))

      expect(total).toBe(1)
      expect(items[0]?.name).toBe('Natural nariño')
    })

    it('filtra por proceso', async () => {
      const { items } = await repository.findAll(noFilters({ process: CoffeeProcess.HONEY }))

      expect(items.map((coffee) => coffee.name)).toEqual(['Honey quindio'])
    })

    it('filtra por nivel de tueste', async () => {
      const { items } = await repository.findAll(noFilters({ roastLevel: RoastLevel.MEDIUM }))

      expect(items.map((coffee) => coffee.name)).toEqual(['Natural nariño'])
    })

    it('combina varios filtros', async () => {
      const { total } = await repository.findAll(
        noFilters({
          region: CoffeeRegion.NARIÑO,
          process: CoffeeProcess.NATURAL,
          roastLevel: RoastLevel.MEDIUM,
        }),
      )

      expect(total).toBe(1)
    })

    it('devuelve vacío si los filtros no coinciden a la vez', async () => {
      const { items, total } = await repository.findAll(
        noFilters({ region: CoffeeRegion.HUILA, process: CoffeeProcess.HONEY }),
      )

      expect(total).toBe(0)
      expect(items).toEqual([])
    })

    it('busca en el nombre sin distinguir mayúsculas', async () => {
      const { items } = await repository.findAll(noFilters({ search: 'LAVADO' }))

      expect(items.map((coffee) => coffee.name)).toEqual(['Lavado huila'])
    })

    it('busca en la descripción', async () => {
      const { items } = await repository.findAll(noFilters({ search: 'cítricas' }))

      expect(items.map((coffee) => coffee.name)).toEqual(['Natural nariño'])
    })

    it('busca dentro de las notas de cata', async () => {
      const { items } = await repository.findAll(noFilters({ search: 'cacao' }))

      expect(items.map((coffee) => coffee.name)).toEqual(['Natural nariño'])
    })

    it.each([
      ['narino', 'sin tilde'],
      ['nariño', 'con tilde'],
      ['NaRiNo', 'con mayúsculas y sin tilde'],
    ])('encuentra "Natural nariño" buscando %j (%s)', async (search) => {
      const { items } = await repository.findAll(noFilters({ search }))

      expect(items.map((coffee) => coffee.name)).toEqual(['Natural nariño'])
    })

    it.each([
      ['citrica', 'descripción sin tilde'],
      ['CÍTRICAS', 'descripción en mayúsculas y con tilde'],
      ['CITRICAS', 'descripción en mayúsculas y sin tilde'],
    ])('encuentra por la descripción buscando %j (%s)', async (search) => {
      const { items } = await repository.findAll(noFilters({ search }))

      expect(items.map((coffee) => coffee.name)).toEqual(['Natural nariño'])
    })

    it('encuentra por las notas de cata ignorando acentos y mayúsculas', async () => {
      const { items } = await repository.findAll(noFilters({ search: 'FRUTOS' }))

      expect(items.map((coffee) => coffee.name)).toEqual(['Natural nariño'])
    })

    it('trata el % del usuario como un carácter literal y no como comodín', async () => {
      const { items } = await repository.findAll(noFilters({ search: 'lote%' }))

      expect(items).toEqual([])
    })

    it('trata el _ del usuario como un carácter literal y no como comodín', async () => {
      const { items } = await repository.findAll(noFilters({ search: 'lot_' }))

      expect(items).toEqual([])
    })

    it('busca coincidencias parciales', async () => {
      const { items } = await repository.findAll(noFilters({ search: 'ariñ' }))

      expect(items.map((coffee) => coffee.name)).toEqual(['Natural nariño'])
    })
  })

  describe('paginación y orden', () => {
    beforeEach(async () => {
      const base = Date.parse('2026-01-01T00:00:00.000Z')

      for (let index = 0; index < 5; index += 1) {
        await seedCoffee(
          dataSource,
          aVisibleCoffee({
            name: `Lote ${index}`,
            createdAt: new Date(base + index * 1000),
          }),
        )
      }
    })

    it('ordena por fecha descendente', async () => {
      const { items } = await repository.findAll(noFilters())

      expect(items.map((coffee) => coffee.name)).toEqual([
        'Lote 4',
        'Lote 3',
        'Lote 2',
        'Lote 1',
        'Lote 0',
      ])
    })

    it('a igualdad de fecha ordena por nombre ascendente', async () => {
      await truncateCatalog(dataSource)
      const sameDate = new Date('2026-03-01T00:00:00.000Z')

      await seedMany(
        ['Charlie', 'Alpha', 'Bravo'].map((name) => aVisibleCoffee({ name, createdAt: sameDate })),
      )

      const { items } = await repository.findAll(noFilters())

      expect(items.map((coffee) => coffee.name)).toEqual(['Alpha', 'Bravo', 'Charlie'])
    })

    it('devuelve la página pedida y conserva el total completo', async () => {
      const first = await repository.findAll(noFilters({ page: 1, limit: 2 }))
      const last = await repository.findAll(noFilters({ page: 3, limit: 2 }))

      expect(first.items.map((coffee) => coffee.name)).toEqual(['Lote 4', 'Lote 3'])
      expect(first.total).toBe(5)
      expect(first.totalPages).toBe(3)

      expect(last.items.map((coffee) => coffee.name)).toEqual(['Lote 0'])
      expect(last.total).toBe(5)
    })

    it('devuelve página vacía más allá del rango', async () => {
      const page = await repository.findAll(noFilters({ page: 9, limit: 2 }))

      expect(page.items).toEqual([])
      expect(page.total).toBe(5)
    })

    it('redondea totalPages hacia arriba', async () => {
      const page = await repository.findAll(noFilters({ limit: 3 }))

      expect(page.totalPages).toBe(2)
    })
  })

  describe('findById', () => {
    it('devuelve el café mapeado al dominio con el precio como número', async () => {
      const coffee = await seedCoffee(
        dataSource,
        aVisibleCoffee({ name: 'Detalle', variants: [withStock({ price: 52350.5 })] }),
      )

      const found = await repository.findById(coffee.id)

      expect(found).not.toBeNull()
      expect(found?.id).toBe(coffee.id)
      expect(found?.variants[0]?.price).toBe(52350.5)
      expect(typeof found?.variants[0]?.price).toBe('number')
      expect(found?.createdAt).toBeInstanceOf(Date)
    })

    it('devuelve null si el id no existe', async () => {
      expect(await repository.findById(UNKNOWN_ID)).toBeNull()
    })

    it('devuelve null si el café está inactivo aunque tenga stock', async () => {
      const coffee = await seedCoffee(
        dataSource,
        aVisibleCoffee({ name: 'Oculto', isActive: false }),
      )

      expect(await repository.findById(coffee.id)).toBeNull()
    })
  })

  /** Siembra un café y devuelve también una de sus variantes, que es lo que se busca. */
  const cafeYVariantDe = async (coffeeName: string, overrides = {}) => {
    const coffee = await seedCoffee(dataSource, aVisibleCoffee({ name: coffeeName, ...overrides }))
    const variant = await dataSource
      .getRepository(CoffeeVariantTypeOrmEntity)
      .findOneOrFail({ where: { coffeeId: coffee.id } })

    return { coffee, variant }
  }

  describe('findCoffeeIdByVariantId', () => {
    it('devuelve el café dueño de la variante', async () => {
      const { coffee, variant } = await cafeYVariantDe('Dueño')

      expect(await repository.findCoffeeIdByVariantId(variant.id)).toBe(coffee.id)
    })

    it('devuelve null si la variante no existe', async () => {
      expect(await repository.findCoffeeIdByVariantId(UNKNOWN_ID)).toBeNull()
    })

    it('devuelve null si el café está inactivo, porque no se puede comprar', async () => {
      const { variant } = await cafeYVariantDe('Oculto', { isActive: false })

      expect(await repository.findCoffeeIdByVariantId(variant.id)).toBeNull()
    })
  })

  describe('findVariantsByIds', () => {
    const variantIdOf = async (coffeeName: string, overrides = {}): Promise<string> => {
      const { variant } = await cafeYVariantDe(coffeeName, overrides)

      return variant.id
    }

    it('devuelve la variante con el nombre de su café', async () => {
      const id = await variantIdOf('Nariño')

      const [linea] = await repository.findVariantsByIds([id])

      expect(linea.coffeeName).toBe('Nariño')
      expect(linea.variant.id).toBe(id)
      expect(linea.variant.stock).toBe(10)
      expect(linea.variant.coffeeId).not.toBeNull()
    })

    it('resuelve varias variantes de distintos cafés de una vez', async () => {
      const primero = await variantIdOf('Nariño')
      const segundo = await variantIdOf('Huila')

      const lineas = await repository.findVariantsByIds([primero, segundo])

      expect(lineas.map((linea) => linea.coffeeName).sort()).toEqual(['Huila', 'Nariño'])
    })

    it('omite la variante si su café está inactivo', async () => {
      const id = await variantIdOf('Oculto', { isActive: false })

      expect(await repository.findVariantsByIds([id])).toEqual([])
    })

    it('omite la variante si la variante está inactiva', async () => {
      const id = await variantIdOf('Inactiva', {
        variants: [{ ...withStock(), isActive: false }],
      })

      expect(await repository.findVariantsByIds([id])).toEqual([])
    })

    it('no falla con ids que no existen', async () => {
      const id = await variantIdOf('Existe')

      const lineas = await repository.findVariantsByIds([id, UNKNOWN_ID])

      expect(lineas).toHaveLength(1)
    })

    it('no consulta nada si no hay ids', async () => {
      expect(await repository.findVariantsByIds([])).toEqual([])
    })
  })
})
