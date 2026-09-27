import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { GetCoffeeByIdUseCase } from './application/use-cases/get-coffee-by-id.use-case'
import { GetCoffeesUseCase } from './application/use-cases/get-coffees.use-case'
import { GetVariantsByIdsUseCase } from './application/use-cases/get-variants-by-ids.use-case'
import { databaseConfig } from './config/database.config'
import { AuthModule } from './config/auth.module'
import { validateEnv } from './config/env.validation'
import { PersistenceModule } from './infrastructure/persistence/persistence.module'
import { CoffeeController } from './interfaces/http/coffee.controller'
import { VariantsController } from './interfaces/http/variants.controller'
import { DomainExceptionFilter } from './interfaces/http/filters/domain-exception.filter'
import { AppExceptionFilter } from './interfaces/http/filters/app-exception.filter'

@Module({
  imports: [
    // validate corre durante la carga de la configuracion, antes de que exista
    // ningun proveedor: si JWT_SECRET falta, el arranque muere aqui.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync(databaseConfig),
    PersistenceModule,
    AuthModule,
  ],
  controllers: [CoffeeController, VariantsController],
  providers: [
    GetCoffeesUseCase,
    GetCoffeeByIdUseCase,
    GetVariantsByIdsUseCase,
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_FILTER, useClass: AppExceptionFilter },
  ],
})
export class AppModule {}
