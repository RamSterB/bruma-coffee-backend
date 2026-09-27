import { Injectable } from '@nestjs/common'
import { Cart } from '../../domain/entities/cart.entity'
import type { AppError } from '../../domain/errors/app-error'
import { err, ok, type Result } from '../../domain/result'
import { CartRepositoryPort } from '../../domain/ports/cart.repository'
import { findItemInCart } from './cart.rules'

export interface RemoveCartItemInput {
  userId: string
  variantId: string
}

@Injectable()
export class RemoveCartItemUseCase {
  constructor(private readonly cartRepository: CartRepositoryPort) {}

  async execute(input: RemoveCartItemInput): Promise<Result<Cart, AppError>> {
    const enElCarrito = await findItemInCart(this.cartRepository, input.userId, input.variantId)

    if (!enElCarrito.ok) {
      return err(enElCarrito.error)
    }

    const cart = await this.cartRepository.removeItem(input.userId, input.variantId)

    return ok(cart)
  }
}
