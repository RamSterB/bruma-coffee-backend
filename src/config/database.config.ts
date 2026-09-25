import { ConfigService } from '@nestjs/config'
import { TypeOrmModuleAsyncOptions, TypeOrmModuleOptions } from '@nestjs/typeorm'

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
    synchronize: config.get('DB_SYNCHRONIZE', 'true') === 'true',
  }),
}