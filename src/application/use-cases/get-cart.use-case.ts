import { Injectable } from '@nestjs/common'
import { Cart } from '../../domain/entities/cart.entity'
import { CartRepositoryPort } from '../../domain/ports/cart.repository'

/**
 * Leer el carrito no es solo devolver lo guardado: cada línea trae el precio y el
 * stock del catálogo del momento, y el subtotal se calcula con esos precios. Por
 * eso abrir el carrito es una lectura de verdad y no un volcado de la tabla.
 */
@Injectable()
export class GetCartUseCase {
  constructor(private readonly cartRepository: CartRepositoryPort) {}

  async execute(userId: string): Promise<Cart> {
    return this.cartRepository.findByUserId(userId)
  }
}
