import { AppError } from './app-error'

export const variantNotPurchasableError = (): AppError =>
  new AppError('Esa variante no se puede comprar', 'VARIANT_NOT_PURCHASABLE', 409)

export const cartItemNotFoundError = (): AppError =>
  new AppError('Esa variante no está en el carrito', 'CART_ITEM_NOT_FOUND', 404)

export const variantNotFoundError = (): AppError =>
  new AppError('La variante no existe', 'VARIANT_NOT_FOUND', 404)

export const cartTooManyItemsError = (max: number): AppError =>
  new AppError(`Un carrito no puede tener más de ${max} líneas`, 'CART_TOO_MANY_ITEMS', 400)
