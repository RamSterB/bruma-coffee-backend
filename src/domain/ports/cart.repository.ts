import type { Cart } from '../entities/cart.entity'

/**
 * El carrito guardado guarda solo identificador de variante y cantidad. El precio,
 * el stock y el nombre los resuelve el repositorio al leer, porque son datos del
 * catálogo que envejecen y no pueden quedarse congelados en el carrito.
 */
export interface StoredCartItem {
  variantId: string
  quantity: number
}

/**
 * Un carrito por usuario, y solo para usuarios autenticados: el invitado lleva
 * el suyo en el navegador. Por eso el `userId` viene siempre del
 * token y nunca del cuerpo de la petición.
 */
export abstract class CartRepositoryPort {
  /** Devuelve el carrito con los datos del catálogo ya resueltos, o vacío si no tiene. */
  abstract findByUserId(userId: string): Promise<Cart>

  /**
   * Guarda la cantidad de una variante. Si la línea no existía la crea, y si
   * existía la deja en la cantidad indicada, recortada al stock.
   */
  abstract setItem(userId: string, variantId: string, quantity: number): Promise<Cart>

  abstract removeItem(userId: string, variantId: string): Promise<Cart>

  abstract clear(userId: string): Promise<Cart>

  /**
   * Reemplaza el carrito entero. Es la operación del arranque de sesión: el
   * carrito local se sube de golpe o no se sube, nunca línea a línea, porque una
   * subida parcial sería un carrito con las dos mitades mezcladas.
   */
  abstract replaceAll(userId: string, items: StoredCartItem[]): Promise<Cart>
}
