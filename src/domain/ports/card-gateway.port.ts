import type { Result } from '../result'
import type { AppError } from '../errors/app-error'
import type { GatewayPaymentStatus } from '../entities/payment.entity'

export interface CreateTransactionInput {
  /** Referencia interna de la orden. La pasarela la devuelve en cada evento. */
  orderId: string
  orderNumber: string
  /** En centavos. Los importes del dominio son pesos enteros. */
  amountInCents: number
  /** Token devuelto por la tokenización del navegador. Nunca el número de tarjeta. */
  cardToken: string
  customerEmail: string
  customerName: string
  customerDocument: string
  customerPhone: string
  shippingAddress: string
  shippingCity: string
  shippingDepartment: string
}

export interface GatewayTransaction {
  reference: string
  status: GatewayPaymentStatus
  amount: number
}

export interface WebhookHeaders {
  /** Checksum de integridad del evento. Viene también dentro del cuerpo. */
  eventChecksum: string | undefined
}

/**
 * El port de la pasarela. El dominio solo sabe esto: que hay alguien que
 * autoriza un pago y que avisa de cómo acabó. Ni la URL, ni las llaves, ni el
 * nombre del proveedor (ADR-001 y ADR-005).
 */
export abstract class CardGateway {
  /**
   * Pide el cobro. `amountInCents` va en centavos porque es lo que espera la
   * pasarela, y equivocarse de unidad cobra la centésima parte sin que nada falle.
   */
  abstract createTransaction(
    input: CreateTransactionInput,
  ): Promise<Result<GatewayTransaction, AppError>>

  /**
   * Comprueba la firma del evento. Va en el port, y no en el caso de uso, porque
   * es conocimiento de la pasarela: el dominio no sabe cómo se firma nada.
   */
  abstract verifySignature(headers: WebhookHeaders, payload: unknown): Result<void, AppError>
}
