import {
  Column,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import type { OrderItemTypeOrmEntity } from './order-item.typeorm.entity'
import type { DeliveryTypeOrmEntity } from './delivery.typeorm.entity'
import type { PaymentTypeOrmEntity } from './payment.typeorm.entity'

/**
 * La orden guarda copia de los datos del cliente y de la dirección, y no
 * referencias a ellos. Es a propósito: si mañana la persona cambia su nombre o su
 * dirección, la orden histórica tiene que seguir diciendo lo que era.
 */
@Entity('orders')
@Index('idx_orders_customer_id', ['customerId'])
@Index('idx_orders_user_id', ['userId'])
@Index('idx_orders_status', ['status'])
export class OrderTypeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'order_number', type: 'varchar', length: 20, unique: true })
  orderNumber!: string

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string

  /** Quien inició sesión. Null en la compra de invitado, que también tiene orden. */
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status!: string

  @Column({ name: 'payment_status', type: 'varchar', length: 20, default: 'PENDING' })
  paymentStatus!: string

  @Column({ name: 'customer_name', type: 'varchar', length: 120 })
  customerName!: string

  @Column({ name: 'customer_document', type: 'varchar', length: 20 })
  customerDocument!: string

  @Column({ name: 'customer_phone', type: 'varchar', length: 20 })
  customerPhone!: string

  @Column({ name: 'shipping_address', type: 'varchar', length: 200 })
  shippingAddress!: string

  @Column({ name: 'shipping_city', type: 'varchar', length: 80 })
  shippingCity!: string

  @Column({ name: 'shipping_department', type: 'varchar', length: 30 })
  shippingDepartment!: string

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  subtotal!: string

  @Column({ name: 'tax_amount', type: 'numeric', precision: 12, scale: 2 })
  taxAmount!: string

  @Column({ name: 'shipping_amount', type: 'numeric', precision: 12, scale: 2 })
  shippingAmount!: string

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  total!: string

  @UpdateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date

  @OneToMany('OrderItemTypeOrmEntity', 'order')
  items!: OrderItemTypeOrmEntity[]

  @OneToOne('PaymentTypeOrmEntity', 'order')
  payments!: PaymentTypeOrmEntity[]

  @OneToOne('DeliveryTypeOrmEntity', 'order')
  delivery!: DeliveryTypeOrmEntity | null
}
