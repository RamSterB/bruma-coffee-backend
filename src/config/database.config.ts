import { ConfigService } from '@nestjs/config'
import { TypeOrmModuleAsyncOptions, TypeOrmModuleOptions } from '@nestjs/typeorm'
import { MIGRATIONS_GLOB } from './migrations'

export const databaseConfig: TypeOrmModuleAsyncOptions = {
  inject: [ConfigService],
  useFactory: (config: ConfigService): TypeOrmModuleOptions => ({
    type: 'postgres',
    host: config.get('DB_HOST', 'localhost'),
    port: config.get<number>('DB_PORT', 5432),
    username: config.get('DB_USER', 'postgres'),
    password: config.get('DB_PASSWORD', 'postgres'),
    database: config.get('DB_NAME', 'bruma_coffee'),
    autoLoadEntities: true,
    // El esquema solo cambia por migraciones versionadas: synchronize puede
    // borrar datos sin avisar, así que nunca se activa.
    synchronize: false,
    migrations: [MIGRATIONS_GLOB],
    migrationsTableName: 'schema_migrations',
    migrationsRun: config.get('DB_MIGRATIONS_RUN', 'true') === 'true',
  }),
}
