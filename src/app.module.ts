import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CreateCoffeeUseCase } from './application/use-cases/create-coffee.use-case'
import { GetCoffeesUseCase } from './application/use-cases/get-coffees.use-case'
import { databaseConfig } from './config/database.config'
import { PersistenceModule } from './infrastructure/persistence/persistence.module'
import { CoffeeController } from './interfaces/http/coffee.controller'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync(databaseConfig),
    PersistenceModule,
  ],
  controllers: [CoffeeController],
  providers: [CreateCoffeeUseCase, GetCoffeesUseCase],
})
export class AppModule {}