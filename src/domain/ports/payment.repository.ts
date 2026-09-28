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

  /**
   * Los pagos que siguen `PENDING` y son mas antiguos que el instante dado. Es lo que
   * recorre la reconciliacion: no tiene sentido preguntar por uno que se acaba de
   * crear, porque la pasarela aun no ha decidido.
   */
  abstract findPendingOlderThan(olderThan: Date, limit: number): Promise<Payment[]>
}
