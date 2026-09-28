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

/**
 * El comercio viene envuelto en `data`. Se comprobó contra el host: la raíz solo
 * tiene `data` y `meta`, así que leer `presigned_acceptance` en la raíz daría
 * siempre `undefined` y la transacción se caería con un 422 que no explica nada.
 */
interface MerchantResponse {
  data?: {
    presigned_acceptance?: { acceptance_token?: string }
    presigned_personal_data_auth?: { acceptance_token?: string }
  }
}

/**
 * La transacción creada viene **plana bajo `data`**, sin un `data.transaction`
 * envolvente. Comprobado contra el sandbox: la raíz tiene `data` y `meta`, y dentro
 * de `data` están `id`, `status` y `amount_in_cents` directamente. Leer
 * `data.transaction.id` daba `undefined` en silencio, y con esa referencia perdida el
 * webhook no casa nunca con el pago.
 */
interface TransactionResponse {
  status?: string
  data?: { id?: string; status?: string }
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

  /**
   * El token de aceptación se pide **en cada transacción**, no se cachea. Es de vida
   * corta y la propia documentación avisa de que uno caducado es un error de
   * validación garantizado; la llamada es barata.
   */
  private async pedirTokenDeAceptacion(): Promise<Result<string, AppError>> {
    let respuesta: Response
    try {
      respuesta = await this.fetch(`${this.config.baseUrl}/merchants/${this.config.publicKey}`, {
        headers: { Accept: 'application/json' },
      })
    } catch (error) {
      return err(gatewayUnavailableError((error as Error).message))
    }

    if (!respuesta.ok) {
      return err(gatewayUnavailableError(`el comercio respondió ${respuesta.status}`))
    }

    const cuerpo = (await respuesta.json()) as MerchantResponse
    const token = cuerpo.data?.presigned_acceptance?.acceptance_token

    if (typeof token !== 'string' || token.length === 0) {
      return err(gatewayUnavailableError('el comercio no devolvio token de aceptacion'))
    }

    return ok(token)
  }

  async createTransaction(
    input: CreateTransactionInput,
  ): Promise<Result<GatewayTransaction, AppError>> {
    const aceptacion = await this.pedirTokenDeAceptacion()

    if (!aceptacion.ok) {
      return err(aceptacion.error)
    }

    // Los nombres de campo van en snake_case porque es lo que acepta la
    // transactions: en camelCase responde 422 con "amount_in_cents no está
    // presente", que parece un error de importes y en realidad es de formato.
    const cuerpo = {
      amount_in_cents: input.amountInCents,
      currency: 'COP',
      reference: input.orderNumber,
      status: 'PENDING',
      acceptance_token: aceptacion.value,
      payment_method: { type: 'CARD', installments: 1, token: input.cardToken },
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

    const estado = aEstado(leido.data?.status ?? leido.status)

    if (estado === 'DECLINED' || estado === 'ERROR' || estado === 'CANCELLED') {
      return err(gatewayDeclinedError(this.motivoDelRechazo(leido)))
    }

    return ok({
      reference: leido.data?.id ?? input.orderNumber,
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
