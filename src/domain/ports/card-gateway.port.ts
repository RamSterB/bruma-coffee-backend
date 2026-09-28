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
  /** Solo la vía, sin ciudad ni departamento: la pasarela los pide aparte. */
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
 * nombre del proveedor. Cambiar de proveedor es cambiar este adaptador, y nada
 * más: es lo que mantiene el dominio ignorante de la infraestructura.
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
   * Consulta el estado de una transaccion ya creada.
   *
   * Existe porque **la propia documentacion del proveedor pide consultar el estado a
   * periodas**: el evento es la via rapida, no la unica. Si el evento no llega (la
   * URL mal registrada en el panel, una caida, un despliegue en curso), el pago se
   * queda PENDING para siempre y no hay ningun error en ninguna parte. Con esta
   * llamada, quien programa la reconciliacion es quien decide cuando se resuelve.
   */
  abstract getTransactionStatus(reference: string): Promise<Result<GatewayTransaction, AppError>>

  /**
   * Comprueba la firma del evento. Va en el port, y no en el caso de uso, porque
   * es conocimiento de la pasarela: el dominio no sabe cómo se firma nada.
   */
  abstract verifySignature(headers: WebhookHeaders, payload: unknown): Result<void, AppError>
}
