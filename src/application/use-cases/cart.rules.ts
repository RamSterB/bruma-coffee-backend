import { DomainError } from '../../domain/enums/assert-enum'
import { Cart } from '../../domain/entities/cart.entity'
import {
  cartItemNotFoundError,
  variantNotFoundError,
  variantNotPurchasableError,
} from '../../domain/errors/cart.errors'
import type { AppError } from '../../domain/errors/app-error'
import { err, ok, type Result } from '../../domain/result'
import { CartRepositoryPort } from '../../domain/ports/cart.repository'
import { CoffeeRepositoryPort } from '../../domain/ports/coffee.repository'

export const MIN_CART_QUANTITY = 1

/**
 * Un error de invariants (una cantidad negativa) es un programmer error y se
 * lanza; un error de negocio (una variante que no existe) se devuelve como
 * Result, que es como lo consume el controlador.
 */
export const assertCartQuantity = (quantity: number): void => {
  if (!Number.isInteger(quantity) || quantity < MIN_CART_QUANTITY) {
    throw new DomainError(`La cantidad debe ser un entero mayor que cero, se recibió ${quantity}`)
  }
}

/**
 * Resuelve la variante y decide si se puede comprar, devolviendo el error como
 * valor y no como excepción, para que el caso de uso pueda encadenar. Se usa en
 * todos los casos de escritura del carrito, para que "no existe" y "no se puede
 * comprar" no dependan de quién pregunta.
 */
export const resolvePurchasableVariant = async (
  coffeeRepository: CoffeeRepositoryPort,
  variantId: string,
): Promise<Result<{ available: true }, AppError>> => {
  const [encontrada] = await coffeeRepository.findVariantsByIds([variantId])

  if (encontrada === undefined) {
    return err(variantNotFoundError())
  }

  if (!encontrada.variant.isAvailable) {
    return err(variantNotPurchasableError())
  }

  return ok({ available: true })
}

export const findItemInCart = async (
  cartRepository: CartRepositoryPort,
  userId: string,
  variantId: string,
): Promise<Result<{ found: true }, AppError>> => {
  const cart: Cart = await cartRepository.findByUserId(userId)

  if (cart.lineaDe(variantId) === null) {
    return err(cartItemNotFoundError())
  }

  return ok({ found: true })
}
