import { Injectable } from '@nestjs/common'
import { DomainError } from '../../domain/enums/assert-enum'
import { CoffeeRepositoryPort } from '../../domain/ports/coffee.repository'

/**
 * Cuántas variantes se resuelven de golpe. El carrito grande es el peor caso
 * que se puede pedir, así que poner un tope acota la consulta en lugar de
 * dejarla abierta a lo que llegue por la URL.
 */
export const MAX_VARIANTS_PER_QUERY = 50

export interface CartVariantLine {
  variantId: string
  coffeeId: string
  coffeeName: string
  weightGrams: number
  price: number
  stock: number
  isActive: boolean
}

@Injectable()
export class GetVariantsByIdsUseCase {
  constructor(private readonly coffeeRepository: CoffeeRepositoryPort) {}

  async execute(ids: string[]): Promise<CartVariantLine[]> {
    if (ids.length > MAX_VARIANTS_PER_QUERY) {
      throw new DomainError(
        `No se pueden resolver más de ${MAX_VARIANTS_PER_QUERY} variantes a la vez`,
      )
    }

    const unicos = [...new Set(ids.map((id) => id.trim()))]

    if (unicos.some((id) => id === '')) {
      throw new DomainError('El id de la variante es obligatorio')
    }

    if (unicos.length === 0) {
      return []
    }

    const lineas = await this.coffeeRepository.findVariantsByIds(unicos)

    return lineas.map(({ variant, coffeeName }) => ({
      variantId: variant.id as string,
      coffeeId: variant.coffeeId as string,
      coffeeName,
      weightGrams: variant.weightGrams,
      price: variant.price,
      stock: variant.stock,
      isActive: variant.isActive,
    }))
  }
}
