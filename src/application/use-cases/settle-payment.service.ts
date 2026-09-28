import { Injectable } from '@nestjs/common'
import { OrderRepositoryPort } from '../../domain/ports/order.repository'
import { PaymentRepositoryPort } from '../../domain/ports/payment.repository'
import { paymentWithEvent, type ConfirmedPayment } from '../../domain/entities/gateway-event.entity'
import { err, ok, type Result } from '../../domain/result'
import type { AppError } from '../../domain/errors/app-error'
import type { GatewayPaymentStatus, Payment } from '../../domain/entities/payment.entity'
import type { Order } from '../../domain/entities/order.entity'
import {
  insufficientStockError,
  unknownPaymentReferenceError,
} from '../../domain/errors/payment.errors'

/** Lo que hay que aplicar a un pago, venga de donde venga. */
export interface PaymentResolution {
  providerReference: string
  status: GatewayPaymentStatus
  rawEvent: Record<string, unknown> | null
  receivedAt: Date
}

/**
 * El efecto de un veredicto de la pasarela, **sin comprobar de dónde vino**.
 *
 * Vive aparte, y no dentro del caso de uso del webhook, porque hay dos caminos que
 * llegan aquí y solo uno trae firma: el aviso de la pasarela y la consulta de
 * reconciliación. Si la comprobación de firma estuviera en medio, la reconciliación
 * no podría funcionar, que es justo cuando hace falta: cuando el aviso no llega.
 */
@Injectable()
export class SettlePaymentService {
  constructor(
    private readonly orders: OrderRepositoryPort,
    private readonly payments: PaymentRepositoryPort,
  ) {}

  async apply(resolucion: PaymentResolution): Promise<Result<ConfirmedPayment, AppError>> {
    const payment = await this.payments.findByProviderReference(resolucion.providerReference)

    if (payment === null) {
      return err(unknownPaymentReferenceError(resolucion.providerReference))
    }

    return this.aplicarA(payment, resolucion)
  }

  /** Aplica el veredicto a un pago que ya se tiene, sin volver a buscarlo. */
  async aplicarA(
    payment: Payment,
    resolucion: PaymentResolution,
  ): Promise<Result<ConfirmedPayment, AppError>> {
    // La pasarela avisa en cuanto nace la transacción, cuando todavía no sabe si se
    // va a cobrar. PENDING no es un veredicto: aplicarlo cobraría sin que nadie haya
    // pagado, así que se responde que no se aplicó y se deja la orden como estaba.
    if (resolucion.status === 'PENDING') {
      const actual = await this.orders.findById(payment.orderId)

      if (actual === null) {
        return err(unknownPaymentReferenceError(resolucion.providerReference))
      }

      return ok({ applied: false, order: aResumen(actual), delivery: null })
    }

    const aplicado = await this.orders.applyPaymentOutcome({
      orderId: payment.orderId,
      paymentStatus: resolucion.status,
      rawEvent: resolucion.rawEvent ?? {},
      receivedAt: resolucion.receivedAt,
    })

    if (aplicado.shortage.length > 0) {
      return err(insufficientStockError(aplicado.shortage[0]?.coffeeName ?? 'la variante'))
    }

    await this.payments.save(
      paymentWithEvent(
        payment,
        resolucion.rawEvent ?? {},
        resolucion.status,
        resolucion.receivedAt,
      ),
    )

    return ok({
      applied: aplicado.applied,
      order: aResumen(aplicado.order),
      delivery: aplicado.delivery,
    })
  }
}

const aResumen = (order: Order): ConfirmedPayment['order'] => ({
  id: order.id,
  orderNumber: order.orderNumber,
  status: order.status,
  paymentStatus: order.paymentStatus,
  total: order.total,
})
