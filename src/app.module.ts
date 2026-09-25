import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { GetCoffeeByIdUseCase } from './application/use-cases/get-coffee-by-id.use-case'
import { GetCoffeesUseCase } from './application/use-cases/get-coffees.use-case'
import { databaseConfig } from './config/database.config'
import { PersistenceModule } from './infrastructure/persistence/persistence.module'
import { CoffeeController } from './interfaces/http/coffee.controller'
import { DomainExceptionFilter } from './interfaces/http/filters/domain-exception.filter'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync(databaseConfig),
    PersistenceModule,
  ],
  controllers: [CoffeeController],
  providers: [
    GetCoffeesUseCase,
    GetCoffeeByIdUseCase,
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
