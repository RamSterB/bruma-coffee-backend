import { CardGateway } from '../../domain/ports/card-gateway.port'
import type {
  CreateTransactionInput,
  GatewayTransaction,
  WebhookHeaders,
} from '../../domain/ports/card-gateway.port'
import { err, ok, type Result } from '../../domain/result'
import type { AppError } from '../../domain/errors/app-error'
import { gatewayDeclinedError, gatewayUnavailableError } from '../../domain/errors/payment.errors'
import type { GatewayPaymentStatus } from '../../domain/entities/payment.entity'
import type { CardGatewayConfig } from '../../config/card-gateway.config'
import { integritySignature, verifyEventSignature, type GatewayEvent } from './gateway-signature'

/** `fetch` como parámetro, y no el global, para que las pruebas no toquen la red. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

interface TransactionResponse {
  status?: string
  data?: { transaction?: { id?: string; status?: string } }
  error?: { messages?: Record<string, string[]> }
}

const ESTADOS_CONOCIDOS: readonly GatewayPaymentStatus[] = [
  'PENDING',
  'APPROVED',
  'DECLINED',
  'ERROR',
  'CANCELLED',
]

const aEstado = (valor: string | undefined): GatewayPaymentStatus =>
  ESTADOS_CONOCIDOS.find((estado) => estado === valor) ?? 'ERROR'

/**
 * Adaptador de la pasarela de pago. Es el **único** lugar del código donde se
 * conoce el proveedor: la URL, las llaves, la firma y el formato de la respuesta.
 * Todo lo demás habla con el port (ADR-001 y ADR-005).
 */
export class CardGatewayAdapter extends CardGateway {
  constructor(
    private readonly config: CardGatewayConfig,
    private readonly fetch: FetchLike,
  ) {
    super()
  }

  async createTransaction(
    input: CreateTransactionInput,
  ): Promise<Result<GatewayTransaction, AppError>> {
    const cuerpo = {
      amountInCents: input.amountInCents,
      currency: 'COP',
      reference: input.orderNumber,
      status: 'PENDING',
      payment_method: { type: 'CARD', token: input.cardToken },
      payment_source: input.customerDocument,
      customer_email: input.customerEmail,
      customer_name: input.customerName,
      customer_phone: input.customerPhone,
      shipping_address: input.shippingAddress,
      shipping_city: input.shippingCity,
      shipping_department: input.shippingDepartment,
      // La firma viaja en el cuerpo, no en la cabecera: así es como la calcula y la
      // espera el proveedor, y es lo que ata el importe a la petición.
      signature: integritySignature({
        reference: input.orderNumber,
        amountInCents: input.amountInCents,
        integritySecret: this.config.integritySecret,
      }),
    }

    let respuesta: Response
    try {
      respuesta = await this.fetch(`${this.config.baseUrl}/transactions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.privateKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(cuerpo),
      })
    } catch (error) {
      return err(gatewayUnavailableError((error as Error).message))
    }

    const leido = (await respuesta.json()) as TransactionResponse

    if (respuesta.status >= 500 || respuesta.status === 401 || respuesta.status === 403) {
      return err(gatewayUnavailableError(`la pasarela respondió ${respuesta.status}`))
    }

    const estado = aEstado(leido.data?.transaction?.status ?? leido.status)

    if (estado === 'DECLINED' || estado === 'ERROR' || estado === 'CANCELLED') {
      return err(gatewayDeclinedError(this.motivoDelRechazo(leido)))
    }

    return ok({
      reference: leido.data?.transaction?.id ?? input.orderNumber,
      status: estado,
      amount: input.amountInCents,
    })
  }

  verifySignature(headers: WebhookHeaders, payload: unknown): Result<void, AppError> {
    if (payload === null || typeof payload !== 'object') {
      return verifyEventSignature({}, this.config.eventsSecret, headers.eventChecksum)
    }

    return verifyEventSignature(
      payload as GatewayEvent,
      this.config.eventsSecret,
      headers.eventChecksum,
    )
  }

  /**
   * El motivo del rechazo se lee del cuerpo, pero el mensaje se arma en el caso de
   * uso: aquí solo se junta lo que vino. La razón es que el texto de la pasarela
   * cambia y no debe filtrarse tal cual a quien compra.
   */
  private motivoDelRechazo(respuesta: TransactionResponse): string {
    const mensajes = respuesta.error?.messages ?? {}
    const primero = Object.values(mensajes).flat()[0]

    return primero ?? 'la pasarela no dio un motivo'
  }
}
