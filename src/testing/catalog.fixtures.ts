import type { DataSource } from 'typeorm'
import { CoffeeTypeOrmEntity } from '../infrastructure/persistence/coffee.typeorm.entity'
import { CoffeeVariantTypeOrmEntity } from '../infrastructure/persistence/coffee-variant.typeorm.entity'
import { CoffeeProcess } from '../domain/enums/coffee-process.enum'
import { CoffeeRegion } from '../domain/enums/coffee-region.enum'
import { RoastLevel } from '../domain/enums/roast-level.enum'

export interface SeedVariant {
  weightGrams: number
  price: number
  stock: number
  isActive?: boolean
}

export interface SeedCoffee {
  name: string
  description?: string
  region: CoffeeRegion
  process: CoffeeProcess
  roastLevel: RoastLevel
  tastingNotes?: string[]
  isActive?: boolean
  variants?: SeedVariant[]
  createdAt?: Date
}

/**
 * Inserta filas directamente en la tabla, saltándose el dominio a propósito:
 * para comprobar los CHECK y los valores de borde que la entidad de dominio
 * rechazaría (stock cero, variantes inactivas, enums inválidos).
 */
export const seedCoffee = async (
  dataSource: DataSource,
  coffee: SeedCoffee,
): Promise<CoffeeTypeOrmEntity> => {
  const coffees = dataSource.getRepository(CoffeeTypeOrmEntity)

  const saved = await coffees.save(
    coffees.create({
      name: coffee.name,
      description: coffee.description ?? 'Descripción de prueba.',
      region: coffee.region,
      process: coffee.process,
      roastLevel: coffee.roastLevel,
      tastingNotes: coffee.tastingNotes ?? [],
      isActive: coffee.isActive ?? true,
    }),
  )

  if (coffee.variants !== undefined) {
    const variants = dataSource.getRepository(CoffeeVariantTypeOrmEntity)

    await variants.save(
      coffee.variants.map((variant) =>
        variants.create({
          coffeeId: saved.id,
          weightGrams: variant.weightGrams,
          price: variant.price.toString(),
          stock: variant.stock,
          isActive: variant.isActive ?? true,
        }),
      ),
    )
  }

  // CreateDateColumn la sobrescribe TypeORM al insertar, así que la fecha solo
  // se puede fijar después, con un UPDATE explícito.
  if (coffee.createdAt !== undefined) {
    await dataSource.query('UPDATE coffees SET created_at = $1 WHERE id = $2', [
      coffee.createdAt,
      saved.id,
    ])
  }

  return coffees.findOneOrFail({ where: { id: saved.id } })
}

export const withStock = (overrides: Partial<SeedVariant> = {}): SeedVariant => ({
  weightGrams: 250,
  price: 40000,
  stock: 10,
  ...overrides,
})

export const aVisibleCoffee = (overrides: Partial<SeedCoffee> = {}): SeedCoffee => ({
  name: 'Café visible',
  region: CoffeeRegion.HUILA,
  process: CoffeeProcess.WASHED,
  roastLevel: RoastLevel.LIGHT,
  variants: [withStock()],
  ...overrides,
})
