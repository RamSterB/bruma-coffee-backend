import { Injectable } from '@nestjs/common'
import { OrderRepositoryPort } from '../../domain/ports/order.repository'
import { PaymentRepositoryPort } from '../../domain/ports/payment.repository'
import { err, ok, type Result } from '../../domain/result'
import type { AppError } from '../../domain/errors/app-error'
import { orderNotFoundError } from '../../domain/errors/payment.errors'

export interface OrderStatus {
  id: string
  orderNumber: string
  status: string
  paymentStatus: string
  total: number
  delivery: { status: string; carrier: string | null; trackingCode: string | null } | null
}

/**
 * El estado final que ve quien compró. Se lee siempre de la orden, que es la
 * fuente de verdad: el estado de la pasarela es una copia, y si las dos se
 * contradijeran, mandaría la que se escribió en la misma transacción que el stock.
 */
@Injectable()
export class GetOrderStatusUseCase {
  constructor(
    private readonly orders: OrderRepositoryPort,
    private readonly payments: PaymentRepositoryPort,
  ) {}

  async execute(orderId: string, userId: string): Promise<Result<OrderStatus, AppError>> {
    const order = await this.orders.findById(orderId)

    // Una orden que no es de esta persona no existe para esta persona. Se responde
    // 404 y no 403 a propósito: un 403 confirmaría que ese id existe.
    if (order === null || order.userId !== userId) {
      return err(orderNotFoundError(orderId))
    }

    const pagos = await this.payments.findByOrderId(orderId)
    const ultimo = pagos[pagos.length - 1]
    const envio = await this.orders.findDeliveryByOrderId(orderId)

    return ok({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: ultimo?.status ?? order.paymentStatus,
      total: order.total,
      delivery:
        envio === null
          ? null
          : { status: envio.status, carrier: envio.carrier, trackingCode: envio.trackingCode },
    })
  }
}
