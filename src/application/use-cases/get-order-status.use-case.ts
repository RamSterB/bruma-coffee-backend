import { Injectable } from '@nestjs/common'
import { OrderRepositoryPort } from '../../domain/ports/order.repository'
import { PaymentRepositoryPort } from '../../domain/ports/payment.repository'
import { err, ok, type Result } from '../../domain/result'
import type { AppError } from '../../domain/errors/app-error'
import { orderNotFoundError } from '../../domain/errors/payment.errors'
import { CardGateway } from '../../domain/ports/card-gateway.port'
import { SettlePaymentService } from './settle-payment.service'

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
/**
 * Cuánto tiene que haber pasado un pago para que valga la pena preguntarle a la
 * pasarela. Muy corto a propósito: quien compra está mirando la pantalla esperando, y
 * el coste de una consulta de más es pequeño al lado de esperar de más.
 */
const SEGUNDOS_ANTES_DE_PREGUNTAR = 5

@Injectable()
export class GetOrderStatusUseCase {
  constructor(
    private readonly orders: OrderRepositoryPort,
    private readonly payments: PaymentRepositoryPort,
    private readonly gateway: CardGateway,
    private readonly settle: SettlePaymentService,
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

    // **Un pago que sigue pendiente se consulta a la pasarela antes de responder.** El
    // aviso de veredicto es lo normal, pero es una configuración del comercio y no está
    // garantizada: si no llega, la compra se queda en PENDING para siempre aunque la
    // pasarela la haya aprobado, y quien compró se queda mirando "confirmando tu pago"
    // sin que nada avance. Preguntar al leer es lo que evita depender de ese aviso.
    if (ultimo !== undefined && ultimo.status === 'PENDING') {
      const antiguedad = Date.now() - ultimo.createdAt.getTime()

      if (antiguedad >= SEGUNDOS_ANTES_DE_PREGUNTAR * 1000) {
        const consulta = await this.gateway.getTransactionStatus(ultimo.providerReference)

        if (consulta.ok && consulta.value.status !== 'PENDING') {
          // Sin evento que archivar y sin firma que comprobar: la firma protege contra
          // quien nos llama, y aquí los que llamamos somos nosotros.
          await this.settle.aplicarA(ultimo, {
            providerReference: ultimo.providerReference,
            status: consulta.value.status,
            rawEvent: null,
            receivedAt: new Date(),
          })
        }
      }
    }

    const actualizados = await this.payments.findByOrderId(orderId)
    const vigente = actualizados[actualizados.length - 1]
    const envio = await this.orders.findDeliveryByOrderId(orderId)

    return ok({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: vigente?.status ?? order.paymentStatus,
      total: order.total,
      delivery:
        envio === null
          ? null
          : { status: envio.status, carrier: envio.carrier, trackingCode: envio.trackingCode },
    })
  }
}
