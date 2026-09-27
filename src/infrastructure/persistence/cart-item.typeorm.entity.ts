import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm'
import type { CartTypeOrmEntity } from './cart.typeorm.entity'
import type { CoffeeVariantTypeOrmEntity } from './coffee-variant.typeorm.entity'

const CART_ENTITY_NAME = 'CartTypeOrmEntity'
const VARIANT_ENTITY_NAME = 'CoffeeVariantTypeOrmEntity'

/**
 * La línea guarda solo el identificador de la variante y la cantidad. El precio y
 * el stock no se copian aquí: se leen del catálogo cada vez que se abre el
 * carrito, que es lo que evita que el carrito prometa un precio viejo.
 */
@Entity('cart_items')
export class CartItemTypeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'cart_id', type: 'uuid' })
  cartId!: string

  @ManyToOne(CART_ENTITY_NAME, 'items', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cart_id' })
  cart!: CartTypeOrmEntity

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId!: string

  /**
   * RESTRICT y no CASCADE a propósito: si la variante se retirara del catálogo,
   * la línea se queda apuntando a ella y el carrito la enseña como no comprable.
   * Con cascada la línea desaparecería sola, y el cliente vería un carrito que
   * perdió cosas sin que nadie se lo dijera.
   */
  @ManyToOne(VARIANT_ENTITY_NAME, undefined, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variant_id' })
  variant!: CoffeeVariantTypeOrmEntity

  @Column({ type: 'integer' })
  quantity!: number
}
