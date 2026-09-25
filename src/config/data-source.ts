import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { CoffeeVariantTypeOrmEntity } from '../infrastructure/persistence/coffee-variant.typeorm.entity'
import { CoffeeTypeOrmEntity } from '../infrastructure/persistence/coffee.typeorm.entity'
import { MIGRATIONS_GLOB } from './migrations'

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'bruma_coffee',
  entities: [CoffeeTypeOrmEntity, CoffeeVariantTypeOrmEntity],
  migrations: [MIGRATIONS_GLOB],
  migrationsTableName: 'schema_migrations',
  synchronize: false,
})
