import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Coffee } from '../../domain/entities/coffee.entity'
import { CoffeeRepositoryPort } from '../../domain/ports/coffee.repository'
import { CoffeeTypeOrmEntity } from './coffee.typeorm.entity'

@Injectable()
export class CoffeeTypeOrmRepository implements CoffeeRepositoryPort {
  constructor(
    @InjectRepository(CoffeeTypeOrmEntity)
    private readonly ormRepository: Repository<CoffeeTypeOrmEntity>,
  ) {}

  async create(coffee: Coffee): Promise<Coffee> {
    const entity = CoffeeTypeOrmEntity.fromDomain(coffee)
    const saved = await this.ormRepository.save(entity)
    return CoffeeTypeOrmEntity.toDomain(saved)
  }

  async findAll(): Promise<Coffee[]> {
    const entities = await this.ormRepository.find({ order: { id: 'ASC' } })
    return entities.map((entity) => CoffeeTypeOrmEntity.toDomain(entity))
  }
}