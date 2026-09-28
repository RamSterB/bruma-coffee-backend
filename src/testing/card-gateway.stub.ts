import type { FetchLike } from '../infrastructure/payments/card-gateway.adapter'

/**
 * Doble de la red para las pruebas de extremo a extremo. Existe porque una prueba
 * que dependa de un servicio externo no es una prueba: si la pasarela está caída,
 * la suite falla y no hay ningún bug. **No** es un adaptador simulado del
 * dominio (ADR-005): esto no sabe nada de pagos, solo responde lo que se le pide
 * pegar, y vive en `src/testing`, fuera de la aplicación en ejecución.
 */
export const createCardGatewayStub = (referencia: () => string): FetchLike => {
  return async (url, init) => {
    const cuerpo = JSON.parse(String(init?.body ?? '{}'))

    return {
      ok: true,
      status: 201,
      json: async () => ({
        status: 'PENDING',
        data: {
          transaction: {
            id: referencia(),
            reference: cuerpo.reference,
            status: 'PENDING',
            amountInCents: cuerpo.amountInCents,
          },
        },
      }),
    } as Response
  }
}
