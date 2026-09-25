import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, SelectQueryBuilder } from 'typeorm'
import type { Coffee } from '../../domain/entities/coffee.entity'
// CoffeeRepositoryPort se importa como valor porque Nest lo usa como token de DI.
import {
  CoffeeFilters,
  CoffeeRepositoryPort,
  PaginatedCoffees,
} from '../../domain/ports/coffee.repository'
import { CoffeeTypeOrmEntity } from './coffee.typeorm.entity'

@Injectable()
export class CoffeeTypeOrmRepository implements CoffeeRepositoryPort {
  constructor(
    @InjectRepository(CoffeeTypeOrmEntity)
    private readonly ormRepository: Repository<CoffeeTypeOrmEntity>,
  ) {}

  async findAll(filters: CoffeeFilters): Promise<PaginatedCoffees> {
    const query = this.ormRepository
      .createQueryBuilder('coffee')
      .leftJoinAndSelect('coffee.variants', 'variant')
      .where('coffee.is_active = true')
      .andWhere(
        `EXISTS (
           SELECT 1 FROM coffee_variants v
           WHERE v.coffee_id = coffee.id AND v.stock > 0 AND v.is_active = true
         )`,
      )

    this.applyFilters(query, filters)

    const [items, total] = await query
      .orderBy('coffee.created_at', 'DESC')
      .addOrderBy('coffee.name', 'ASC')
      .skip((filters.page - 1) * filters.limit)
      .take(filters.limit)
      .getManyAndCount()

    return {
      items: items.map((entity) => CoffeeTypeOrmEntity.toDomain(entity)),
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.ceil(total / filters.limit),
    }
  }

  async findById(id: string): Promise<Coffee | null> {
    const entity = await this.ormRepository.findOne({
      where: { id, isActive: true },
      relations: { variants: true },
    })

    return entity === null ? null : CoffeeTypeOrmEntity.toDomain(entity)
  }

  private applyFilters(
    query: SelectQueryBuilder<CoffeeTypeOrmEntity>,
    filters: CoffeeFilters,
  ): void {
    if (filters.region !== undefined) {
      query.andWhere('coffee.region = :region', { region: filters.region })
    }

    if (filters.process !== undefined) {
      query.andWhere('coffee.process = :process', { process: filters.process })
    }

    if (filters.roastLevel !== undefined) {
      query.andWhere('coffee.roast_level = :roastLevel', {
        roastLevel: filters.roastLevel,
      })
    }

    if (filters.search !== undefined) {
      query.andWhere(
        `(coffee.name ILIKE :search OR coffee.description ILIKE :search
          OR EXISTS (
            SELECT 1 FROM unnest(coffee.tasting_notes) AS note WHERE note ILIKE :search
          ))`,
        { search: `%${filters.search}%` },
      )
    }
  }
}
