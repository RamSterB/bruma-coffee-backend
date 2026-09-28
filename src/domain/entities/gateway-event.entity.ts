import type { Payment, GatewayPaymentStatus } from './payment.entity'
import type { OrderStatus, PaymentStatus } from './order.entity'
import type { Delivery } from '../../domain/entities/delivery.entity'

/**
 * El evento se guarda entero para poder auditar una orden años después, pero
 * **sin datos de tarjeta**: si la pasarela mandara el número, se escribiría en la
 * base de datos y con él en una copia de seguridad, y "la pasarela no lo manda" no
 * es una garantía que se pueda dar (RNF-01.20).
 *
 * Se quita por nombre de campo en vez de por forma de número, porque un PAN
 * válido de 16 dígitos se parece demasiado a un identificador de transacción de
 * 16 caracteres como para confiar en el patrón.
 */
const CAMPOS_DE_TARJETA = [
  'card_number',
  'cardnumber',
  'number',
  'cvc',
  'cvv',
  'security_code',
  'expiration',
  'expiry',
  'exp_month',
  'exp_year',
  'token_card',
]

const limpiar = (valor: unknown): unknown => {
  if (Array.isArray(valor)) {
    return valor.map(limpiar)
  }

  if (valor !== null && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .filter(([clave]) => !CAMPOS_DE_TARJETA.includes(clave.toLowerCase()))
        .map(([clave, interno]) => [clave, limpiar(interno)]),
    )
  }

  return valor
}

export const sanitizeGatewayEvent = (evento: Record<string, unknown>): Record<string, unknown> =>
  limpiar(evento) as Record<string, unknown>

/**
 * Copia de un pago con el evento ya limpio. Vive en el dominio porque es una regla
 * sobre qué se puede guardar, y esa regla no depende de quién llama.
 */
export const paymentWithEvent = (
  payment: Payment,
  evento: Record<string, unknown>,
  status: GatewayPaymentStatus,
  momento: Date,
): Payment => ({
  ...payment,
  status,
  rawEvent: sanitizeGatewayEvent(evento),
  updatedAt: momento,
})

export interface ConfirmedPayment {
  applied: boolean
  order: {
    id: string
    orderNumber: string
    status: OrderStatus
    paymentStatus: PaymentStatus
    total: number
  }
  delivery: Delivery | null
}
