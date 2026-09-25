import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CoffeeRepositoryPort } from '../../domain/ports/coffee.repository'
import { CoffeeTypeOrmEntity } from './coffee.typeorm.entity'
import { CoffeeTypeOrmRepository } from './coffee.typeorm.repository'

@Module({
  imports: [TypeOrmModule.forFeature([CoffeeTypeOrmEntity])],
  providers: [
    {
      provide: CoffeeRepositoryPort,
      useClass: CoffeeTypeOrmRepository,
    },
  ],
  exports: [CoffeeRepositoryPort],
})
export class PersistenceModule {}