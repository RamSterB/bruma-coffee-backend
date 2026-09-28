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
    // El adaptador pide el comercio para sacar el token de aceptación antes de
    // cobrar. Sin esta ruta, la prueba fallaría por un motivo que no es el que mide.
    if (url.includes('/merchants/')) {
      return {
        ok: true,
        status: 200,
        // Envolto en `data`, que es como lo devuelve la pasarela.
        json: async () => ({
          data: {
            presigned_acceptance: { acceptance_token: 'tok_aceptacion_de_pruebas' },
            presigned_personal_data_auth: { acceptance_token: 'tok_datos_de_pruebas' },
          },
          meta: {},
        }),
      } as Response
    }

    const cuerpo = JSON.parse(String(init?.body ?? '{}'))

    return {
      ok: true,
      status: 201,
      // La transacción viene plana bajo `data`, como la manda la pasarela.
      json: async () => ({
        status: 'PENDING',
        data: {
          id: referencia(),
          reference: cuerpo.reference,
          status: 'PENDING',
          amount_in_cents: cuerpo.amount_in_cents,
        },
      }),
    } as Response
  }
}
