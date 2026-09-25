import { Injectable } from '@nestjs/common'
import { Coffee } from '../../domain/entities/coffee.entity'
import { CoffeeRepositoryPort } from '../../domain/ports/coffee.repository'

@Injectable()
export class GetCoffeesUseCase {
  constructor(private readonly coffeeRepository: CoffeeRepositoryPort) {}

  async execute(): Promise<Coffee[]> {
    return this.coffeeRepository.findAll()
  }
}