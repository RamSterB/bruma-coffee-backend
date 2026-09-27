import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn, OneToMany } from 'typeorm'
import type { CartItemTypeOrmEntity } from './cart-item.typeorm.entity'

const CART_ITEM_ENTITY_NAME = 'CartItemTypeOrmEntity'

/**
 * Un carrito por usuario, y solo para usuarios con cuenta: el invitado lleva el
 * suyo en el navegador. El UNIQUE de user_id es lo que garantiza
 * que no haya dos, sin tener que pedirlo en código.
 */
@Entity('carts')
export class CartTypeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId!: string

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date

  @OneToMany(CART_ITEM_ENTITY_NAME, 'cart')
  items!: CartItemTypeOrmEntity[]
}
