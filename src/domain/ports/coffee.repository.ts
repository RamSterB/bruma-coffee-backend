import type { Coffee } from '../entities/coffee.entity'
import type { CoffeeProcess } from '../enums/coffee-process.enum'
import type { CoffeeRegion } from '../enums/coffee-region.enum'
import type { RoastLevel } from '../enums/roast-level.enum'

export interface CoffeeFilters {
  region?: CoffeeRegion
  process?: CoffeeProcess
  roastLevel?: RoastLevel
  search?: string
  page: number
  limit: number
}

export interface PaginatedCoffees {
  items: Coffee[]
  total: number
  page: number
  limit: number
  totalPages: number
}

/**
 * El repositorio es responsable de excluir los cafés sin variantes con stock:
 * el filtro va en SQL para que `items` y `total` cuenten siempre lo mismo.
 */
export abstract class CoffeeRepositoryPort {
  abstract findAll(filters: CoffeeFilters): Promise<PaginatedCoffees>
  abstract findById(id: string): Promise<Coffee | null>
}
