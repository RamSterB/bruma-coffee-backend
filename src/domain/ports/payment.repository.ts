import type { Payment } from '../entities/payment.entity'

/**
 * Un intento de pago por orden. La referencia de la pasarela es única: es lo que
 * hace idempotente el webhook, porque el mismo evento llega dos veces y las dos
 * tienen que chocar contra la misma fila.
 */
export abstract class PaymentRepositoryPort {
  abstract save(payment: Payment): Promise<Payment>

  abstract findByProviderReference(reference: string): Promise<Payment | null>

  abstract findByOrderId(orderId: string): Promise<Payment[]>
}
