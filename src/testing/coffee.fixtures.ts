import { Coffee } from '../domain/entities/coffee.entity'
import { CoffeeVariant } from '../domain/entities/coffee-variant.entity'
import { CoffeeProcess } from '../domain/enums/coffee-process.enum'
import { CoffeeRegion } from '../domain/enums/coffee-region.enum'
import { RoastLevel } from '../domain/enums/roast-level.enum'
import type {
  CoffeeFilters,
  CoffeeRepositoryPort,
  PaginatedCoffees,
} from '../domain/ports/coffee.repository'

export const buildCoffee = (id: string, name = `Café ${id}`): Coffee =>
  Coffee.reconstitute({
    id,
    name,
    description: 'Descripción del café',
    roastLevel: RoastLevel.MEDIUM,
    process: CoffeeProcess.WASHED,
    region: CoffeeRegion.HUILA,
    tastingNotes: ['cacao'],
    isActive: true,
    variants: [
      CoffeeVariant.reconstitute({
        id: `variant-${id}`,
        weightGrams: 250,
        price: 42000,
        stock: 10,
        isActive: true,
        coffeeId: id,
      }),
    ],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  })

export const buildPage = (
  items: Coffee[],
  total: number,
  page = 1,
  limit = 12,
): PaginatedCoffees => ({
  items,
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
})

export class FakeCoffeeRepository implements CoffeeRepositoryPort {
  public lastFilters: CoffeeFilters | null = null

  constructor(
    private readonly result: PaginatedCoffees = buildPage([], 0),
    private readonly byId: Coffee | null = null,
  ) {}

  async findAll(filters: CoffeeFilters): Promise<PaginatedCoffees> {
    this.lastFilters = filters
    return this.result
  }

  async findById(id: string): Promise<Coffee | null> {
    return this.byId?.id === id ? this.byId : null
  }
}
