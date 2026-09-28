import { createHash } from 'node:crypto'
import { ok, err, type Result } from '../../domain/result'
import { invalidWebhookSignatureError } from '../../domain/errors/payment.errors'
import type { AppError } from '../../domain/errors/app-error'

/**
 * Verificación de la firma de un evento, y firma de integridad de una petición.
 *
 * La regla que documenta el proveedor y que aquí se respeta: **las propiedades que
 * entran en el checksum vienen en el propio evento** (`signature.properties`), y no
 * son una lista fija. Hardcodearlas funciona con el primer evento que se pruebe y
 * falla en cuanto el proveedor añade un campo, que es exactamente lo que pasó con
 * la documentación, donde el mismo campo aparece como `amount_in_cents` y como
 * `amountInCents` según el evento.
 */

export interface GatewayEvent {
  event?: string
  data?: Record<string, unknown>
  signature?: {
    properties?: string[]
    checksum?: string
  }
  timestamp?: number
}

/** Lee `data` siguiendo un camino con puntos, como `transaction.status`. */
export const readProperty = (data: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((valor, parte) => {
    if (valor === null || typeof valor !== 'object') {
      return undefined
    }

    return (valor as Record<string, unknown>)[parte]
  }, data)

/**
 * La cadena que se hashea: los valores de las propiedades, en el orden en que las
 * pide el evento, sin separadores; luego el timestamp; luego el secreto.
 *
 * Un valor que no existe se convierte en la cadena vacía en vez de en `undefined`:
 * `undefined` dentro de la concatenación da "undefined" hasheado, y eso no puede
 * coincidir nunca con lo que calculó el proveedor, así que el fallo aparecería como
 * "firma inválida" en un evento que sí venía bien.
 */
export const eventChecksumInput = (
  evento: GatewayEvent,
  properties: string[],
  secret: string,
): string => {
  const data = evento.data ?? {}
  const valores = properties.map((path) => {
    const valor = readProperty(data, path)

    return valor === undefined || valor === null ? '' : String(valor)
  })

  return `${valores.join('')}${evento.timestamp ?? ''}${secret}`
}

export const sha256 = (texto: string): string =>
  createHash('sha256').update(texto, 'utf8').digest('hex')

/** Comparación en tiempo constante: comparar con `===` filtra el dato por tiempos. */
const igualesEnTiempoConstante = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false
  }

  let diferencia = 0
  for (let i = 0; i < a.length; i += 1) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }

  return diferencia === 0
}

export const verifyEventSignature = (
  evento: GatewayEvent,
  secret: string,
  checksumDelHeader?: string,
): Result<void, AppError> => {
  const properties = evento.signature?.properties
  const checksum = evento.signature?.checksum ?? checksumDelHeader

  if (!Array.isArray(properties) || properties.length === 0) {
    return err(invalidWebhookSignatureError())
  }

  if (typeof checksum !== 'string' || checksum.length === 0) {
    return err(invalidWebhookSignatureError())
  }

  const esperado = sha256(eventChecksumInput(evento, properties, secret))

  return igualesEnTiempoConstante(esperado, checksum.toLowerCase())
    ? ok(undefined)
    : err(invalidWebhookSignatureError())
}

/**
 * La firma de integridad de una petición de pago: lo que demuestra que el importe
 * se construyó en el servidor y no en el camino. Sin ella, cambiar el importe en
 * tránsito sería tan fácil como editar el cuerpo.
 */
export const integritySignature = (parts: {
  reference: string
  amountInCents: number
  currency?: string
  integritySecret: string
}): string =>
  sha256(
    `${parts.reference}${parts.amountInCents}${parts.currency ?? 'COP'}${parts.integritySecret}`,
  )
