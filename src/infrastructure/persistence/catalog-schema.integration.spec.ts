import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { resetTestDatabase, truncateCatalog } from '../../testing/test-database'
import { buildSearchIndex } from '../../domain/search/search-text'
import { CoffeeProcess } from '../../domain/enums/coffee-process.enum'
import { CoffeeRegion } from '../../domain/enums/coffee-region.enum'
import { RoastLevel } from '../../domain/enums/roast-level.enum'
import { CoffeeTypeOrmEntity } from './coffee.typeorm.entity'
import { CoffeeVariantTypeOrmEntity } from './coffee-variant.typeorm.entity'

/**
 * Las restricciones del esquema viven en la migración, no en el código, así que
 * solo se pueden comprobar ejecutándolas. Si una
 * migración se regenera o se edita a mano, esto es lo que se entera.
 */
describe('restricciones del esquema del catálogo', () => {
  let dataSource: DataSource

  const insertCoffee = async (
    values: Partial<CoffeeTypeOrmEntity> = {},
  ): Promise<CoffeeTypeOrmEntity> => {
    const coffees = dataSource.getRepository(CoffeeTypeOrmEntity)

    return coffees.save(
      coffees.create({
        name: 'Café',
        description: 'Descripción.',
        region: CoffeeRegion.HUILA,
        process: CoffeeProcess.WASHED,
        roastLevel: RoastLevel.LIGHT,
        tastingNotes: [],
        isActive: true,
        ...values,
      }),
    )
  }

  const insertVariant = async (
    coffeeId: string,
    values: Partial<CoffeeVariantTypeOrmEntity> = {},
  ): Promise<CoffeeVariantTypeOrmEntity> => {
    const variants = dataSource.getRepository(CoffeeVariantTypeOrmEntity)

    return variants.save(
      variants.create({
        coffeeId,
        weightGrams: 250,
        price: '40000',
        stock: 5,
        isActive: true,
        ...values,
      }),
    )
  }

  beforeAll(async () => {
    dataSource = await resetTestDatabase()
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

  describe('índice de búsqueda', () => {
    it('lo rellena la entidad al escribir, sin acentos ni mayúsculas', async () => {
      const coffee = await insertCoffee({
        name: 'Catuaí del Tolima',
        description: 'Notas a panelón y a fruta madura.',
        tastingNotes: ['Jazmín', 'Cítricos'],
      })

      const [{ search_index: index }] = await dataSource.query(
        'SELECT search_index FROM coffees WHERE id = $1',
        [coffee.id],
      )

      expect(index).toBe('catuai del tolima notas a panelon y a fruta madura. jazmin citricos')
    })

    it('coincide con la normalización de la aplicación en todas las filas', async () => {
      const coffee = await insertCoffee({
        name: 'Caturra de Nariño',
        description: 'Cultivada a 1.950 msnm, en ø y Ångström.',
        tastingNotes: ['Manzana verde', 'Frutos rojos'],
      })
      await insertVariant(coffee.id)

      const rows = await dataSource.query('SELECT name, description, tasting_notes FROM coffees')

      for (const row of rows) {
        const [{ index }] = await dataSource.query(
          'SELECT search_index AS index FROM coffees WHERE name = $1',
          [row.name],
        )
        const enAplicacion = buildSearchIndex({
          name: row.name,
          description: row.description,
          tastingNotes: row.tasting_notes,
        })

        expect({ name: row.name, index }).toEqual({ name: row.name, index: enAplicacion })
      }
    })

    it('se recalcula al guardar la entidad con otro nombre', async () => {
      const repositorio = dataSource.getRepository(CoffeeTypeOrmEntity)
      const coffee = await insertCoffee({ name: 'Nombre viejo' })
      const leerIndice = async (): Promise<string> => {
        const [{ index }] = await dataSource.query(
          'SELECT search_index AS index FROM coffees WHERE id = $1',
          [coffee.id],
        )

        return index
      }
      const antes = await leerIndice()

      coffee.name = 'Nombre nuevo con ñ'
      await repositorio.save(coffee)

      const despues = await leerIndice()

      expect(antes).toContain('nombre viejo')
      expect(despues).toContain('nombre nuevo con n')
      expect(despues).not.toContain('nombre viejo')
    })
  })

  describe('tabla coffees', () => {
    it('rechaza un nombre en blanco', async () => {
      await expect(insertCoffee({ name: '   ' })).rejects.toThrow(/chk_coffees_name_not_blank/)
    })

    it('rechaza una descripción en blanco', async () => {
      await expect(insertCoffee({ description: '  ' })).rejects.toThrow(
        /chk_coffees_description_not_blank/,
      )
    })

    it('rechaza una región fuera del enum', async () => {
      await expect(insertCoffee({ region: 'atlantis' as CoffeeRegion })).rejects.toThrow(
        /chk_coffees_region/,
      )
    })

    it('rechaza un proceso fuera del enum', async () => {
      await expect(insertCoffee({ process: 'fermentado' as CoffeeProcess })).rejects.toThrow(
        /chk_coffees_process/,
      )
    })

    it('rechaza un nivel de tueste fuera del enum', async () => {
      await expect(insertCoffee({ roastLevel: 'torrido' as RoastLevel })).rejects.toThrow(
        /chk_coffees_roast_level/,
      )
    })
  })

  describe('tabla coffee_variants', () => {
    it('rechaza un peso cero o negativo', async () => {
      const coffee = await insertCoffee()

      await expect(insertVariant(coffee.id, { weightGrams: 0 })).rejects.toThrow(
        /chk_variants_weight_positive/,
      )
    })

    it('rechaza un precio negativo', async () => {
      const coffee = await insertCoffee()

      await expect(insertVariant(coffee.id, { price: '-1' })).rejects.toThrow(
        /chk_variants_price_non_negative/,
      )
    })

    it('acepta precio cero', async () => {
      const coffee = await insertCoffee()

      await expect(insertVariant(coffee.id, { price: '0' })).resolves.toBeDefined()
    })

    it('rechaza stock negativo', async () => {
      const coffee = await insertCoffee()

      await expect(insertVariant(coffee.id, { stock: -3 })).rejects.toThrow(
        /chk_variants_stock_non_negative/,
      )
    })

    it('acepta stock cero para marcar un café como agotado', async () => {
      const coffee = await insertCoffee()

      await expect(insertVariant(coffee.id, { stock: 0 })).resolves.toBeDefined()
    })

    it('rechaza dos variantes del mismo café con el mismo peso', async () => {
      const coffee = await insertCoffee()
      await insertVariant(coffee.id, { weightGrams: 250 })

      await expect(insertVariant(coffee.id, { weightGrams: 250 })).rejects.toThrow(
        /uq_variants_coffee_weight/,
      )
    })

    it('permite el mismo peso en cafés distintos', async () => {
      const primero = await insertCoffee({ name: 'Primero' })
      const segundo = await insertCoffee({ name: 'Segundo' })
      await insertVariant(primero.id, { weightGrams: 250 })

      await expect(insertVariant(segundo.id, { weightGrams: 250 })).resolves.toBeDefined()
    })

    it('borra las variantes cuando se borra el café', async () => {
      const coffee = await insertCoffee()
      await insertVariant(coffee.id)

      await dataSource.getRepository(CoffeeTypeOrmEntity).delete(coffee.id)

      const variants = await dataSource.getRepository(CoffeeVariantTypeOrmEntity).count()

      expect(variants).toBe(0)
    })
  })
})
