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

    if (coffee !== null) {
      return coffee
    }

    // Si no es un café, puede ser una variante: el enlace de "ver el café" que aparece tras
    // pagar solo conoce el id de la variante, porque el pedido no guarda el del café.
    const cafeDeLaVariante = await this.coffeeRepository.findCoffeeIdByVariantId(coffeeId)

    if (cafeDeLaVariante !== null) {
      const cafeDeLaVarianteId = await this.coffeeRepository.findById(cafeDeLaVariante)

      if (cafeDeLaVarianteId !== null) {
        return cafeDeLaVarianteId
      }
    }

    throw new CoffeeNotFoundError(coffeeId)
  }
}
