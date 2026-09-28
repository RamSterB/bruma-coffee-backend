import { AppError } from './app-error'

/**
 * Carrito vacío al intentar pagar. Es un 400 y no un 404: la operación es válida,
 * lo que no hay es nada que cobrar, y el mensaje lo dice sin esconder nada.
 */
export const emptyCartError = (): AppError =>
  new AppError('No hay nada en el carrito para pagar', 'EMPTY_CART', 400)

/** El token de la tarjeta no llegó, o llegó vacío. Nunca el número: ese no se acepta. */
export const missingCardTokenError = (): AppError =>
  new AppError('Falta el token de la tarjeta', 'MISSING_CARD_TOKEN', 400)

/**
 * La pasarela no respondió o respondió algo que no se puede leer. Es 502 y no 500 a
 * propósito: el fallo no es de este servicio, y el cliente tiene que poder
 * distinguir "vuelve a intentarlo" de "esta roto y no hay nada que hacer".
 */
export const gatewayUnavailableError = (detalle: string): AppError =>
  new AppError(`La pasarela de pago no responde: ${detalle}`, 'GATEWAY_UNAVAILABLE', 502)

/** La pasarela rechazó el pago. 402: se entendió la petición y el pago no se hizo. */
export const gatewayDeclinedError = (detalle: string): AppError =>
  new AppError(`El pago fue rechazado: ${detalle}`, 'PAYMENT_DECLINED', 402)

/**
 * La firma del webhook no cuadra. Sin esto, cualquiera que conozca la URL podría
 * marcar una orden como pagada. 401, y el evento se ignora.
 */
export const invalidWebhookSignatureError = (): AppError =>
  new AppError('La firma del evento no es válida', 'INVALID_WEBHOOK_SIGNATURE', 401)

/** El evento no trae referencia de la pasarela, así que no se puede saber de qué orden es. */
export const missingReferenceError = (): AppError =>
  new AppError('El evento no trae referencia de transacción', 'MISSING_REFERENCE', 400)

/** No hay ninguna orden con esa referencia. El evento se ignora, no se responde con error. */
export const unknownPaymentReferenceError = (referencia: string): AppError =>
  new AppError(`No hay ningún pago con la referencia ${referencia}`, 'UNKNOWN_PAYMENT', 404)

export const orderNotFoundError = (id: string): AppError =>
  new AppError(`No existe la orden ${id}`, 'ORDER_NOT_FOUND', 404)

/** Ya no hay stock de una variante que la orden quería. 409: hay que reponer el carrito. */
export const insufficientStockError = (coffeeName: string): AppError =>
  new AppError(`No queda stock de ${coffeeName}`, 'INSUFFICIENT_STOCK', 409)
