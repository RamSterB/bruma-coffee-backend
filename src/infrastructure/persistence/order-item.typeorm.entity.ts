import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { OrderTypeOrmEntity } from './order.typeorm.entity'

/**
 * Copia de lo que se cobró, no una referencia a lo que hoy vale. Por eso guarda el
 * nombre, el peso y el precio: aunque el café cambie de precio o se descontinúe, la
 * línea tiene que seguir diciendo lo que se pagó.
 */
@Entity('order_items')
@Index('idx_order_items_order_id', ['orderId'])
export class OrderItemTypeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string

  /** Puede quedar en null si la variante desaparece del catálogo: es un histórico. */
  @Column({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId!: string | null

  @Column({ name: 'coffee_name', type: 'varchar', length: 120 })
  coffeeName!: string

  @Column({ name: 'weight_grams', type: 'integer', nullable: true })
  weightGrams!: number | null

  @Column({ name: 'unit_price', type: 'numeric', precision: 12, scale: 2 })
  unitPrice!: string

  @Column({ type: 'integer' })
  quantity!: number

  @Column({ name: 'line_total', type: 'numeric', precision: 12, scale: 2 })
  lineTotal!: string

  @ManyToOne(() => OrderTypeOrmEntity, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: OrderTypeOrmEntity
}
