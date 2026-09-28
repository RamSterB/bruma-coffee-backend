import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { PaymentRepositoryPort } from '../../domain/ports/payment.repository'
import type { Payment, GatewayPaymentStatus } from '../../domain/entities/payment.entity'
import { PaymentTypeOrmEntity } from './payment.typeorm.entity'

@Injectable()
export class TypeOrmPaymentRepository implements PaymentRepositoryPort {
  constructor(
    @InjectRepository(PaymentTypeOrmEntity)
    private readonly pagos: Repository<PaymentTypeOrmEntity>,
  ) {}

  async save(payment: Payment): Promise<Payment> {
    const fila = this.pagos.create({
      id: payment.id,
      orderId: payment.orderId,
      provider: payment.provider,
      providerReference: payment.providerReference,
      token: payment.token,
      status: payment.status,
      amount: String(payment.amount),
      rawEvent: payment.rawEvent,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    })
    await this.pagos.save(fila)

    return this.aPago(fila)
  }

  async findByProviderReference(reference: string): Promise<Payment | null> {
    const fila = await this.pagos.findOne({ where: { providerReference: reference } })

    return fila === null ? null : this.aPago(fila)
  }

  async findByOrderId(orderId: string): Promise<Payment[]> {
    const filas = await this.pagos.find({ where: { orderId }, order: { createdAt: 'ASC' } })

    return filas.map((fila) => this.aPago(fila))
  }

  private aPago(fila: PaymentTypeOrmEntity): Payment {
    return {
      id: fila.id,
      orderId: fila.orderId,
      provider: fila.provider,
      providerReference: fila.providerReference,
      token: fila.token,
      status: fila.status as GatewayPaymentStatus,
      amount: Number(fila.amount),
      rawEvent: fila.rawEvent,
      createdAt: fila.createdAt,
      updatedAt: fila.updatedAt,
    }
  }
}
