import { Injectable } from '@nestjs/common'
import { Coffee } from '../../domain/entities/coffee.entity'
import { CoffeeRepositoryPort } from '../../domain/ports/coffee.repository'

export interface CreateCoffeeInput {
  name: string
  region: string
  price: number
}

@Injectable()
export class CreateCoffeeUseCase {
  constructor(private readonly coffeeRepository: CoffeeRepositoryPort) {}

  async execute(input: CreateCoffeeInput): Promise<Coffee> {
    const coffee = Coffee.create(input.name, input.region, input.price)
    return this.coffeeRepository.create(coffee)
  }
}