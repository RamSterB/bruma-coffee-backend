export type GatewayPaymentStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'ERROR' | 'CANCELLED'

/**
 * Un intento de pago. Se guarda el **token** que devuelve la tokenización del
 * navegador y la referencia de la pasarela, nunca el número de la tarjeta: el
 * número no llega aquí porque no pasa por este servidor (ADR-006).
 */
export interface Payment {
  id: string
  orderId: string
  provider: string
  providerReference: string
  token: string
  status: GatewayPaymentStatus
  amount: number
  rawEvent: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}

export interface NewPayment {
  id: string
  orderId: string
  provider: string
  providerReference: string
  token: string
  amount: number
  createdAt: Date
}

/** Estados en los que la pasarela ya dio su veredicto. */
export const RESUELTOS: readonly GatewayPaymentStatus[] = [
  'APPROVED',
  'DECLINED',
  'ERROR',
  'CANCELLED',
]

export const esResuelto = (status: GatewayPaymentStatus): boolean => RESUELTOS.includes(status)
