import { Injectable } from '@nestjs/common'
import { Cart } from '../../domain/entities/cart.entity'
import type { AppError } from '../../domain/errors/app-error'
import { err, ok, type Result } from '../../domain/result'
import { CartRepositoryPort } from '../../domain/ports/cart.repository'
import { CoffeeRepositoryPort } from '../../domain/ports/coffee.repository'
import { assertCartQuantity, resolvePurchasableVariant } from './cart.rules'

export interface AddItemToCartInput {
  userId: string
  variantId: string
  quantity: number
}

@Injectable()
export class AddItemToCartUseCase {
  constructor(
    private readonly cartRepository: CartRepositoryPort,
    private readonly coffeeRepository: CoffeeRepositoryPort,
  ) {}

  /**
   * "Agregar" suma a lo que ya había, que es lo que espera quien pulsa el botón
   * dos veces. El recorte al stock lo hace el dominio al guardar, así que la
   * línea nunca promete más de lo que hay.
   */
  async execute(input: AddItemToCartInput): Promise<Result<Cart, AppError>> {
    assertCartQuantity(input.quantity)

    const comprable = await resolvePurchasableVariant(this.coffeeRepository, input.variantId)

    if (!comprable.ok) {
      return err(comprable.error)
    }

    const cart = await this.cartRepository.findByUserId(input.userId)
    const actual = cart.lineaDe(input.variantId)

    const guardado = await this.cartRepository.setItem(
      input.userId,
      input.variantId,
      (actual?.quantity ?? 0) + input.quantity,
    )

    return ok(guardado)
  }
}
