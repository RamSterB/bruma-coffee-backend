import type { Coffee } from '../entities/coffee.entity'

export abstract class CoffeeRepositoryPort {
  abstract create(coffee: Coffee): Promise<Coffee>
  abstract findAll(): Promise<Coffee[]>
}