import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { OrderTypeOrmEntity } from './order.typeorm.entity'

/**
 * Solo se guarda el **token** que devuelve la tokenización del navegador, nunca el
 * número de la tarjeta: el número no pasa por este servidor, porque la tarjeta se
 * tokeniza en el navegador.
 *
 * El UNIQUE de (provider, provider_reference) lo crea la migración, no el decorador,
 * porque es la pieza de la que depende la idempotencia del evento.
 */
@Entity('payments')
@Index('idx_payments_order_id', ['orderId'])
export class PaymentTypeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string

  @Column({ type: 'varchar', length: 20 })
  provider!: string

  @Column({ name: 'provider_reference', type: 'varchar', length: 120 })
  providerReference!: string

  @Column({ type: 'varchar', length: 120 })
  token!: string

  @Column({ type: 'varchar', length: 20 })
  status!: string

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: string

  /** El evento tal cual llegó, ya sin datos de tarjeta. */
  @Column({ name: 'raw_event', type: 'jsonb', nullable: true })
  rawEvent!: Record<string, unknown> | null

  @UpdateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date

  @ManyToOne(() => OrderTypeOrmEntity, (order) => order.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: OrderTypeOrmEntity
}
