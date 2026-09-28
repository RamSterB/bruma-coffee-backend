import type { Payment } from '../../domain/entities/payment.entity'
import type { PaymentRepositoryPort } from '../../domain/ports/payment.repository'

export class FakePaymentRepository implements PaymentRepositoryPort {
  private readonly pagos = new Map<string, Payment>()

  async save(payment: Payment): Promise<Payment> {
    this.pagos.set(payment.providerReference, { ...payment })

    return payment
  }

  async findByProviderReference(reference: string): Promise<Payment | null> {
    return this.pagos.get(reference) ?? null
  }

  async findByOrderId(orderId: string): Promise<Payment[]> {
    return [...this.pagos.values()].filter((pago) => pago.orderId === orderId)
  }

  all(): Payment[] {
    return [...this.pagos.values()]
  }
}
