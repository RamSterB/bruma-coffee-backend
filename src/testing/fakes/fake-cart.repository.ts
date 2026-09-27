import { Cart, CartItem } from '../../domain/entities/cart.entity'
import type { CartRepositoryPort, StoredCartItem } from '../../domain/ports/cart.repository'
import { buildCoffeeVariant } from '../coffee.fixtures'

/**
 * El fake aplica las mismas reglas que el adaptador real: recorta al stock y
 * devuelve las líneas no comprables con cantidad cero. Un fake que no se
 * comporta igual deja pasar justo los errores que la base de datos atraparía.
 */
export class FakeCartRepository implements CartRepositoryPort {
  private readonly carritos = new Map<string, StoredCartItem[]>()

  /** Catálogo que resuelve los datos de cada línea, como hace el LEFT JOIN real. */
  public readonly catalogo = new Map<string, ReturnType<typeof buildCoffeeVariant>>()
  public readonly nombresDeCafe = new Map<string, string>()

  /** Los ids que no están en el catálogo cuentan como variante que ya no existe. */
  private resolver(variantId: string): CartItem | null {
    const variant = this.catalogo.get(variantId)

    if (variant === undefined) {
      return CartItem.create({
        variantId,
        quantity: 1,
        price: 0,
        stock: 0,
        isActive: false,
        exists: false,
      })
    }

    return CartItem.create({
      variantId,
      quantity: variant.stock > 0 && variant.isActive ? variant.stock : 1,
      price: variant.price,
      stock: variant.stock,
      isActive: variant.isActive,
      coffeeId: variant.coffeeId,
      coffeeName: this.nombresDeCafe.get(variantId) ?? 'Café',
      weightGrams: variant.weightGrams,
    })
  }

  private montar(userId: string): Cart {
    const guardadas = this.carritos.get(userId) ?? []

    return Cart.create(
      userId,
      guardadas.flatMap(({ variantId, quantity }) => {
        const resuelta = this.resolver(variantId)

        if (resuelta === null) {
          return []
        }

        return [
          CartItem.create({
            variantId,
            quantity,
            price: resuelta.price,
            stock: resuelta.stock,
            isActive: resuelta.isActive,
            coffeeId: resuelta.coffeeId,
            coffeeName: resuelta.coffeeName,
            weightGrams: resuelta.weightGrams,
          }),
        ]
      }),
    )
  }

  registrar(userId: string, items: StoredCartItem[]): void {
    this.carritos.set(
      userId,
      items.map((item) => ({ ...item })),
    )
  }

  async findByUserId(userId: string): Promise<Cart> {
    return this.montar(userId)
  }

  async setItem(userId: string, variantId: string, quantity: number): Promise<Cart> {
    const actuales = this.carritos.get(userId) ?? []
    const resto = actuales.filter((item) => item.variantId !== variantId)

    this.carritos.set(userId, [...resto, { variantId, quantity }])

    return this.montar(userId)
  }

  async removeItem(userId: string, variantId: string): Promise<Cart> {
    const actuales = this.carritos.get(userId) ?? []

    this.carritos.set(
      userId,
      actuales.filter((item) => item.variantId !== variantId),
    )

    return this.montar(userId)
  }

  async clear(userId: string): Promise<Cart> {
    this.carritos.set(userId, [])

    return this.montar(userId)
  }

  async replaceAll(userId: string, items: StoredCartItem[]): Promise<Cart> {
    this.carritos.set(
      userId,
      items.map((item) => ({ ...item })),
    )

    return this.montar(userId)
  }
}
