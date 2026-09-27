import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CoffeeRepositoryPort } from '../../domain/ports/coffee.repository'
import { CoffeeVariantTypeOrmEntity } from './coffee-variant.typeorm.entity'
import { CoffeeTypeOrmEntity } from './coffee.typeorm.entity'
import { CustomerTypeOrmEntity } from './customer.typeorm.entity'
import { RefreshTokenTypeOrmEntity } from './refresh-token.typeorm.entity'
import { UserTypeOrmEntity } from './user.typeorm.entity'
import { CoffeeTypeOrmRepository } from './coffee.typeorm.repository'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CoffeeTypeOrmEntity,
      CoffeeVariantTypeOrmEntity,
      CustomerTypeOrmEntity,
      UserTypeOrmEntity,
      RefreshTokenTypeOrmEntity,
    ]),
  ],
  providers: [
    {
      provide: CoffeeRepositoryPort,
      useClass: CoffeeTypeOrmRepository,
    },
  ],
  exports: [CoffeeRepositoryPort],
})
export class PersistenceModule {}
