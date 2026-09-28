import { Injectable } from '@nestjs/common'
import { CardGateway, type WebhookHeaders } from '../../domain/ports/card-gateway.port'
import { OrderRepositoryPort } from '../../domain/ports/order.repository'
import { PaymentRepositoryPort } from '../../domain/ports/payment.repository'
import { paymentWithEvent, type ConfirmedPayment } from '../../domain/entities/gateway-event.entity'
import { err, ok, type Result } from '../../domain/result'
import type { AppError } from '../../domain/errors/app-error'
import type { GatewayPaymentStatus } from '../../domain/entities/payment.entity'
import type { Order } from '../../domain/entities/order.entity'
import {
  insufficientStockError,
  unknownPaymentReferenceError,
} from '../../domain/errors/payment.errors'

export interface ConfirmPaymentInput {
  providerReference: string
  status: GatewayPaymentStatus
  rawEvent: Record<string, unknown>
  receivedAt: Date
}

/**
 * Aplica el veredicto de la pasarela a la orden.
 *
 * Tres cosas se comprueban en este orden, y el orden importa: **primero la firma**,
 * porque si el evento no viene de la pasarela no hay nada que aplicar y aceptarlo
 * sería permitir que cualquiera que conozca la URL marque pedidos como pagados.
 * Después se busca el pago, porque un evento sin referencia conocida no se puede
 * atribuir a ninguna orden. Y solo entonces se toca el stock.
 *
 * La idempotencia no está en el código de este caso de uso sino detrás del puerto:
 * el adaptador aplica el resultado en una transacción y descarta el caso en que el
 * pago ya estaba resuelto. Aquí solo se devuelve si se aplicó o no.
 */
@Injectable()
export class ConfirmPaymentUseCase {
  constructor(
    private readonly orders: OrderRepositoryPort,
    private readonly payments: PaymentRepositoryPort,
    private readonly gateway: CardGateway,
  ) {}

  async execute(
    input: ConfirmPaymentInput,
    headers: WebhookHeaders = { eventChecksum: undefined },
  ): Promise<Result<ConfirmedPayment, AppError>> {
    const firma = this.gateway.verifySignature(headers, input.rawEvent)

    if (!firma.ok) {
      return err(firma.error)
    }

    const payment = await this.payments.findByProviderReference(input.providerReference)

    if (payment === null) {
      return err(unknownPaymentReferenceError(input.providerReference))
    }

    // La pasarela avisa en cuanto nace la transacción, cuando todavía no sabe si se
    // va a cobrar. PENDING no es un veredicto: aplicarlo cobraría sin que nadie haya
    // pagado, así que se responde que no se aplicó y se deja la orden como estaba.
    if (input.status === 'PENDING') {
      const actual = await this.orders.findById(payment.orderId)

      if (actual === null) {
        return err(unknownPaymentReferenceError(input.providerReference))
      }

      return ok({ applied: false, order: this.aResumen(actual), delivery: null })
    }

    const aplicado = await this.orders.applyPaymentOutcome({
      orderId: payment.orderId,
      paymentStatus: input.status,
      rawEvent: input.rawEvent,
      receivedAt: input.receivedAt,
    })

    if (aplicado.shortage.length > 0) {
      return err(insufficientStockError(aplicado.shortage[0]?.coffeeName ?? 'la variante'))
    }

    await this.payments.save(
      paymentWithEvent(payment, input.rawEvent, input.status, input.receivedAt),
    )

    return ok({
      applied: aplicado.applied,
      order: this.aResumen(aplicado.order),
      delivery: aplicado.delivery,
    })
  }

  private aResumen(order: Order): ConfirmedPayment['order'] {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      total: order.total,
    }
  }
}
