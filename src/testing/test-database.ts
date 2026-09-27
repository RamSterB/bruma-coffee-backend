import { DataSource } from 'typeorm'
import { CoffeeTypeOrmEntity } from '../infrastructure/persistence/coffee.typeorm.entity'
import { CoffeeVariantTypeOrmEntity } from '../infrastructure/persistence/coffee-variant.typeorm.entity'
import { CustomerTypeOrmEntity } from '../infrastructure/persistence/customer.typeorm.entity'
import { RefreshTokenTypeOrmEntity } from '../infrastructure/persistence/refresh-token.typeorm.entity'
import { UserTypeOrmEntity } from '../infrastructure/persistence/user.typeorm.entity'
import { CreateAccountTables1759000000000 } from '../migrations/1759000000000-CreateAccountTables'
import { SeedAccounts1759000001000 } from '../migrations/1759000001000-SeedAccounts'
import { CreateCatalogTables1758800000000 } from '../migrations/1758800000000-CreateCatalogTables'
import { AddCoffeeSearchIndex1758900002000 } from '../migrations/1758900002000-AddCoffeeSearchIndex'

/**
 * Infraestructura para los tests de integración contra PostgreSQL real.
 *
 * Mockear el QueryBuilder daría una cobertura falsa: los errores que más
 * duelen en esta capa (el EXISTS de stock, el unnest de las notas de cata,
 * los CHECK del esquema) solo aparecen cuando PostgreSQL ejecuta el SQL.
 */

const TEST_DATABASE_SUFFIX = '_test'

const readEnv = (name: string, fallback: string): string => {
  const value = process.env[name]

  return value === undefined || value === '' ? fallback : value
}

const port = Number(readEnv('DB_PORT', '5432'))

/**
 * Los tests nunca deben tocar la base de desarrollo. El nombre se deriva de
 * DB_NAME añadiendo el sufijo, y se aborta si no lo lleva: soltar el esquema
 * público de la base equivocada no tiene vuelta atrás.
 */
export const TEST_DATABASE = readEnv(
  'DB_NAME_TEST',
  `${readEnv('DB_NAME', 'bruma_coffee')}${TEST_DATABASE_SUFFIX}`,
)

const credentials = {
  host: readEnv('DB_HOST', 'localhost'),
  port,
  username: readEnv('DB_USER', 'postgres'),
  password: readEnv('DB_PASSWORD', 'postgres'),
}

const assertTestDatabase = (database: string): void => {
  if (!database.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(
      `La base de tests debe terminar en "${TEST_DATABASE_SUFFIX}" para poder vaciarla con seguridad. ` +
        `Se recibió "${database}". Define DB_NAME_TEST con un nombre de ese tipo.`,
    )
  }
}

const baseOptions = {
  type: 'postgres' as const,
  ...credentials,
}

export const testDataSourceOptions = (database: string = TEST_DATABASE) => ({
  ...baseOptions,
  database,
  entities: [
    CoffeeTypeOrmEntity,
    CoffeeVariantTypeOrmEntity,
    CustomerTypeOrmEntity,
    UserTypeOrmEntity,
    RefreshTokenTypeOrmEntity,
  ],
  // El esquema lo crean las mismas migraciones que en producción, pero
  // importadas una a una: el glob de MIGRATIONS_GLOB depende de __dirname,
  // que no existe bajo ESM, y además el test debe saber qué esquema construye.
  synchronize: false,
  migrations: [
    CreateCatalogTables1758800000000,
    AddCoffeeSearchIndex1758900002000,
    CreateAccountTables1759000000000,
    SeedAccounts1759000001000,
  ],
  migrationsTableName: 'schema_migrations',
  logging: false,
})

/** Crea la base de tests si no existe. */
const ensureDatabaseExists = async (): Promise<void> => {
  const admin = new DataSource({ ...baseOptions, database: 'postgres' })
  await admin.initialize()

  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      TEST_DATABASE,
    ])

    if (existing.length === 0) {
      // El nombre viene de la configuración, no de la entrada del usuario, y ya
      // se validó el sufijo _test; aun así se entrecomilla por si contiene comillas.
      await admin.query(`CREATE DATABASE "${TEST_DATABASE.replace(/"/g, '""')}"`)
    }
  } finally {
    await admin.destroy()
  }
}

/** Deja el esquema como lo encuentra las migraciones: vacío y al día. */
export const resetTestDatabase = async (): Promise<DataSource> => {
  assertTestDatabase(TEST_DATABASE)
  await ensureDatabaseExists()

  const dataSource = new DataSource(testDataSourceOptions())
  await dataSource.initialize()

  try {
    await dataSource.query('DROP SCHEMA IF EXISTS public CASCADE')
    await dataSource.query('CREATE SCHEMA public')
    await dataSource.runMigrations()
  } catch (error) {
    await dataSource.destroy()
    throw error
  }

  return dataSource
}

/** Vacía las tablas sin reiniciar la secuencia de migraciones. */
export const truncateCatalog = async (dataSource: DataSource): Promise<void> => {
  await dataSource.query('TRUNCATE coffee_variants, coffees RESTART IDENTITY CASCADE')
}
