import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Cart, CartItem } from '../../domain/entities/cart.entity'
import { CartRepositoryPort, StoredCartItem } from '../../domain/ports/cart.repository'
import { CartTypeOrmEntity } from './cart.typeorm.entity'
import { CartItemTypeOrmEntity } from './cart-item.typeorm.entity'

/** Fila del LEFT JOIN: la línea guardada más lo que el catálogo dice de ella. */
interface FilaDeLinea {
  variant_id: string
  quantity: number
  price: string | null
  stock: number | null
  is_active: boolean | null
  coffee_id: string | null
  coffee_name: string | null
  weight_grams: number | null
}

@Injectable()
export class TypeOrmCartRepository implements CartRepositoryPort {
  constructor(
    @InjectRepository(CartTypeOrmEntity)
    private readonly carts: Repository<CartTypeOrmEntity>,
  ) {}

  private get items(): Repository<CartItemTypeOrmEntity> {
    return this.carts.manager.getRepository(CartItemTypeOrmEntity)
  }

  /**
   * LEFT JOIN y no INNER a propósito: si la variante se retiró del catálogo, la
   * línea sigue guardada y tiene que volver en la respuesta marcada como no
   * comprable. Con INNER desaparecería sola, y el cliente vería un carrito que
   * perdió cosas sin que nadie le dijera por qué.
   */
  private async leer(userId: string): Promise<Cart> {
    const cart = await this.carts.findOne({ where: { userId } })

    if (cart === null) {
      return Cart.empty(userId)
    }

    const filas = (await this.items
      .createQueryBuilder('item')
      .leftJoin('item.variant', 'variant')
      .leftJoin('variant.coffee', 'coffee')
      .select([
        'item.variant_id AS "variant_id"',
        'item.quantity AS "quantity"',
        'variant.price AS "price"',
        'variant.stock AS "stock"',
        'variant.is_active AS "is_active"',
        'variant.coffee_id AS "coffee_id"',
        'coffee.name AS "coffee_name"',
        'variant.weight_grams AS "weight_grams"',
      ])
      .where('item.cart_id = :cartId', { cartId: cart.id })
      .getRawMany()) as FilaDeLinea[]

    return Cart.create(
      userId,
      filas.map((fila) =>
        CartItem.create({
          variantId: fila.variant_id,
          quantity: Number(fila.quantity),
          // numeric llega como texto en PostgreSQL, y un "42000.50" comparado o
          // multiplicado como texto da resultados que no son los de un número.
          price: fila.price === null ? 0 : Number(fila.price),
          stock: fila.stock ?? 0,
          isActive: fila.is_active ?? false,
          coffeeId: fila.coffee_id,
          coffeeName: fila.coffee_name,
          weightGrams: fila.weight_grams,
          exists: fila.price !== null,
        }),
      ),
    )
  }

  private async carritoDe(userId: string): Promise<CartTypeOrmEntity> {
    const existente = await this.carts.findOne({ where: { userId } })

    if (existente !== null) {
      return existente
    }

    return this.carts.save(this.carts.create({ userId }))
  }

  async findByUserId(userId: string): Promise<Cart> {
    return this.leer(userId)
  }

  async setItem(userId: string, variantId: string, quantity: number): Promise<Cart> {
    const cart = await this.carritoDe(userId)
    const existente = await this.items.findOne({ where: { cartId: cart.id, variantId } })

    if (existente === null) {
      await this.items.save(this.items.create({ cartId: cart.id, variantId, quantity }))
    } else {
      await this.items.update({ id: existente.id }, { quantity })
    }

    return this.leer(userId)
  }

  async removeItem(userId: string, variantId: string): Promise<Cart> {
    const cart = await this.carritoDe(userId)
    await this.items.delete({ cartId: cart.id, variantId })

    return this.leer(userId)
  }

  async clear(userId: string): Promise<Cart> {
    const cart = await this.carritoDe(userId)
    await this.items.delete({ cartId: cart.id })

    return this.leer(userId)
  }

  async replaceAll(userId: string, items: StoredCartItem[]): Promise<Cart> {
    const cart = await this.carritoDe(userId)
    await this.items.delete({ cartId: cart.id })

    if (items.length > 0) {
      await this.items.save(items.map((item) => this.items.create({ cartId: cart.id, ...item })))
    }

    return this.leer(userId)
  }
}
