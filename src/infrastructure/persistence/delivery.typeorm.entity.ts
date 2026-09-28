import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { OrderTypeOrmEntity } from './order.typeorm.entity'

/** Envío, no dirección: la dirección es copia de la orden (ADR-016). */
@Entity('deliveries')
export class DeliveryTypeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'order_id', type: 'uuid', unique: true })
  orderId!: string

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status!: string

  @Column({ type: 'varchar', length: 60, nullable: true })
  carrier!: string | null

  @Column({ name: 'tracking_code', type: 'varchar', length: 60, nullable: true })
  trackingCode!: string | null

  @Column({ name: 'shipped_at', type: 'timestamptz', nullable: true })
  shippedAt!: Date | null

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null

  @UpdateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date

  @OneToOne(() => OrderTypeOrmEntity, (order) => order.delivery)
  @JoinColumn({ name: 'order_id' })
  order!: OrderTypeOrmEntity
}
