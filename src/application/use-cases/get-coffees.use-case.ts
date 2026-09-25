import { Injectable } from '@nestjs/common'
import { assertEnum, DomainError } from '../../domain/enums/assert-enum'
import { CoffeeProcess } from '../../domain/enums/coffee-process.enum'
import { CoffeeRegion } from '../../domain/enums/coffee-region.enum'
import { RoastLevel } from '../../domain/enums/roast-level.enum'
// CoffeeRepositoryPort es un valor: Nest lo usa como token de inyección de dependencias.
import { CoffeeFilters, CoffeeRepositoryPort } from '../../domain/ports/coffee.repository'

export const MAX_PAGE_SIZE = 100

@Injectable()
export class GetCoffeesUseCase {
  constructor(private readonly coffeeRepository: CoffeeRepositoryPort) {}

  async execute(filters: CoffeeFilters) {
    return this.coffeeRepository.findAll(this.validate(filters))
  }

  private validate(filters: CoffeeFilters): CoffeeFilters {
    if (!Number.isInteger(filters.page) || filters.page < 1) {
      throw new DomainError(
        `La página debe ser un entero mayor que cero, se recibió ${filters.page}`,
      )
    }

    if (!Number.isInteger(filters.limit) || filters.limit < 1 || filters.limit > MAX_PAGE_SIZE) {
      throw new DomainError(
        `El límite debe ser un entero entre 1 y ${MAX_PAGE_SIZE}, se recibió ${filters.limit}`,
      )
    }

    if (filters.region !== undefined) {
      assertEnum(CoffeeRegion, filters.region)
    }

    if (filters.process !== undefined) {
      assertEnum(CoffeeProcess, filters.process)
    }

    if (filters.roastLevel !== undefined) {
      assertEnum(RoastLevel, filters.roastLevel)
    }

    const search = filters.search?.trim()

    return {
      region: filters.region,
      process: filters.process,
      roastLevel: filters.roastLevel,
      search: search === '' ? undefined : search,
      page: filters.page,
      limit: filters.limit,
    }
  }
}
