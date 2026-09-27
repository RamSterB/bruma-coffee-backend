import { Injectable } from '@nestjs/common'
import { Cart } from '../../domain/entities/cart.entity'
import type { AppError } from '../../domain/errors/app-error'
import { err, ok, type Result } from '../../domain/result'
import { CartRepositoryPort } from '../../domain/ports/cart.repository'
import { CoffeeRepositoryPort } from '../../domain/ports/coffee.repository'
import { assertCartQuantity, findItemInCart, resolvePurchasableVariant } from './cart.rules'

export interface UpdateCartItemQuantityInput {
  userId: string
  variantId: string
  quantity: number
}

/**
 * Ajusta la cantidad a un valor exacto, que es lo del control de cantidad del
 * cajón. Quitar una línea del todo es otra operación: por eso una cantidad de
 * cero es un error y no un atajo para borrar.
 */
@Injectable()
export class UpdateCartItemQuantityUseCase {
  constructor(
    private readonly cartRepository: CartRepositoryPort,
    private readonly coffeeRepository: CoffeeRepositoryPort,
  ) {}

  async execute(input: UpdateCartItemQuantityInput): Promise<Result<Cart, AppError>> {
    assertCartQuantity(input.quantity)

    const comprable = await resolvePurchasableVariant(this.coffeeRepository, input.variantId)

    if (!comprable.ok) {
      return err(comprable.error)
    }

    const enElCarrito = await findItemInCart(this.cartRepository, input.userId, input.variantId)

    if (!enElCarrito.ok) {
      return err(enElCarrito.error)
    }

    const guardado = await this.cartRepository.setItem(
      input.userId,
      input.variantId,
      input.quantity,
    )

    return ok(guardado)
  }
}
