import { Injectable } from '@nestjs/common'
import { Cart } from '../../domain/entities/cart.entity'
import { cartTooManyItemsError } from '../../domain/errors/cart.errors'
import type { AppError } from '../../domain/errors/app-error'
import { err, ok, type Result } from '../../domain/result'
import { CartRepositoryPort, StoredCartItem } from '../../domain/ports/cart.repository'
import { CoffeeRepositoryPort } from '../../domain/ports/coffee.repository'
import { assertCartQuantity } from './cart.rules'

/**
 * El mismo tope que acepta la consulta de variantes por identificadores. Sin
 * él, una sola petición de arranque de sesión podría escribir miles de filas.
 */
export const MAX_CART_ITEMS = 50

export interface MergeLocalCartInput {
  userId: string
  items: StoredCartItem[]
}

/**
 * El arranque de sesión. El carrito del servidor gana si ya tiene algo, porque es
 * la copia de otro dispositivo y se considera la más confiable; si está vacío,
 * sube el del navegador.
 *
 * El resultado es siempre el carrito completo, porque el cliente lo reemplaza
 * entero con esta respuesta: si ganara el local, el cliente tendría que adivinar
 * qué se descartó, y esa diferencia es la que se equivoca.
 */
@Injectable()
export class MergeLocalCartUseCase {
  constructor(
    private readonly cartRepository: CartRepositoryPort,
    private readonly coffeeRepository: CoffeeRepositoryPort,
  ) {}

  async execute(input: MergeLocalCartInput): Promise<Result<Cart, AppError>> {
    if (input.items.length > MAX_CART_ITEMS) {
      return err(cartTooManyItemsError(MAX_CART_ITEMS))
    }

    input.items.forEach((item) => assertCartQuantity(item.quantity))

    const delServidor = await this.cartRepository.findByUserId(input.userId)

    if (delServidor.totalItems > 0) {
      return ok(delServidor)
    }

    const summedas = this.sumarPorVariante(input.items)
    const ids = summedas.map((item) => item.variantId)
    const encontradas = await this.coffeeRepository.findVariantsByIds(ids)

    const comprables = summedas.flatMap((item) => {
      const linea = encontradas.find((candidata) => candidata.variant.id === item.variantId)

      if (linea === undefined || !linea.variant.isAvailable) {
        return []
      }

      return [{ variantId: item.variantId, quantity: Math.min(item.quantity, linea.variant.stock) }]
    })

    return ok(await this.cartRepository.replaceAll(input.userId, comprables))
  }

  private sumarPorVariante(items: StoredCartItem[]): StoredCartItem[] {
    const porVariante = new Map<string, number>()

    for (const item of items) {
      porVariante.set(item.variantId, (porVariante.get(item.variantId) ?? 0) + item.quantity)
    }

    return [...porVariante].map(([variantId, quantity]) => ({ variantId, quantity }))
  }
}
