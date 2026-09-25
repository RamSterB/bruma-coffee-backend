import { Injectable } from '@nestjs/common'
import { CoffeeNotFoundError } from '../../domain/errors/coffee-not-found.error'
import { DomainError } from '../../domain/enums/assert-enum'
// CoffeeRepositoryPort es un valor: Nest lo usa como token de inyección de dependencias.
import { CoffeeRepositoryPort } from '../../domain/ports/coffee.repository'

@Injectable()
export class GetCoffeeByIdUseCase {
  constructor(private readonly coffeeRepository: CoffeeRepositoryPort) {}

  async execute(id: string) {
    const coffeeId = id.trim()

    if (coffeeId === '') {
      throw new DomainError('El id del café es obligatorio')
    }

    const coffee = await this.coffeeRepository.findById(coffeeId)

    if (coffee === null) {
      throw new CoffeeNotFoundError(coffeeId)
    }

    return coffee
  }
}
