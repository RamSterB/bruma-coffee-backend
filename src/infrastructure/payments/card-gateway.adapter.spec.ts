import { createHash } from 'node:crypto'
import { CardGatewayAdapter } from './card-gateway.adapter'
import type { CardGatewayConfig } from '../../config/card-gateway.config'
import { err, ok, type Result } from '../../domain/result'
import { gatewayDeclinedError, gatewayUnavailableError } from '../../domain/errors/payment.errors'
import type { AppError } from '../../domain/errors/app-error'
import type { CreateTransactionInput, WebhookHeaders } from '../../domain/ports/card-gateway.port'

const CONFIG: CardGatewayConfig = {
  baseUrl: 'https://sandbox.wompi.co/v1',
  publicKey: 'pub_test_una',
  privateKey: 'prv_test_dos',
  eventsSecret: 'test_events_tres',
  integritySecret: 'test_integrity_cuatro',
}

type Respuesta = { status: number; cuerpo: unknown }

const peticion = (respuesta: Respuesta) => {
  const llamadas: { url: string; init: RequestInit }[] = []

  const fetch = async (url: string | URL, init: RequestInit = {}): Promise<Response> => {
    llamadas.push({ url: String(url), init })

    return {
      ok: respuesta.status >= 200 && respuesta.status < 300,
      status: respuesta.status,
      json: async () => respuesta.cuerpo,
      text: async () => JSON.stringify(respuesta.cuerpo),
    } as Response
  }

  return { fetch, llamadas }
}

const entrada = (over: Partial<CreateTransactionInput> = {}): CreateTransactionInput => ({
  orderId: 'orden-1',
  orderNumber: 'BC-20260927-0001',
  amountInCents: 5998000,
  cardToken: 'tok_test_123',
  customerEmail: 'comprador@ejemplo.co',
  customerName: 'Persona Compradora',
  customerDocument: '1098765434',
  customerPhone: '3001234567',
  shippingAddress: 'Carrera 7, Bogotá, Cundinamarca',
  shippingCity: 'Bogotá',
  shippingDepartment: 'Cundinamarca',
  ...over,
})

describe('CardGatewayAdapter.createTransaction', () => {
  it('manda el importe en centavos y el token, y nunca un número de tarjeta', async () => {
    const { fetch, llamadas } = peticion({
      status: 201,
      cuerpo: { status: 'PENDING', data: { transaction: { id: 'tx-1', status: 'PENDING' } } },
    })
    const adapter = new CardGatewayAdapter(CONFIG, fetch)

    await adapter.createTransaction(entrada({}))

    const cuerpo = JSON.parse(String(llamadas[0]?.init.body))
    expect(cuerpo.amountInCents).toBe(5998000)
    expect(cuerpo.payment_method.token).toBe('tok_test_123')
    expect(JSON.stringify(cuerpo)).not.toMatch(/\d{13,19}/)
  })

  it('envía la llave privada, que es la única que autoriza un pago', async () => {
    const { fetch, llamadas } = peticion({
      status: 201,
      cuerpo: { status: 'PENDING', data: { transaction: { id: 'tx-1', status: 'PENDING' } } },
    })

    await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

    const cabeceras = llamadas[0]?.init.headers as Record<string, string>
    expect(cabeceras.Authorization).toBe('Bearer prv_test_dos')
  })

  it('firma la petición con el secreto de integridad', async () => {
    const { fetch, llamadas } = peticion({
      status: 201,
      cuerpo: { status: 'PENDING', data: { transaction: { id: 'tx-1', status: 'PENDING' } } },
    })

    await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

    const cuerpo = JSON.parse(String(llamadas[0]?.init.body))
    // Sin esta firma, cambiar el importe en tránsito sería tan fácil como editar el
    // cuerpo, así que su presencia no es opcional ni decorativa.
    expect(cuerpo.signature).toEqual(expect.stringMatching(/^[0-9a-f]{64}$/))
  })

  it('usa la referencia de la orden, que es como vuelve el evento', async () => {
    const { fetch, llamadas } = peticion({
      status: 201,
      cuerpo: { status: 'PENDING', data: { transaction: { id: 'tx-1', status: 'PENDING' } } },
    })

    await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

    expect(JSON.parse(String(llamadas[0]?.init.body)).reference).toBe('BC-20260927-0001')
  })

  it('devuelve la referencia y el estado que responde la pasarela', async () => {
    const { fetch } = peticion({
      status: 201,
      cuerpo: { status: 'PENDING', data: { transaction: { id: 'tx-77', status: 'PENDING' } } },
    })

    const resultado = await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) {
      return
    }
    expect(resultado.value).toEqual({ reference: 'tx-77', status: 'PENDING', amount: 5998000 })
  })

  it('traduce un rechazo de la pasarela a un error de negocio, no a una caída', async () => {
    const { fetch } = peticion({
      status: 200,
      cuerpo: {
        status: 'DECLINED',
        data: { transaction: { id: 'tx-1', status: 'DECLINED' } },
        error: { type: 'card_error', messages: { card_number: ['La tarjeta fue rechazada'] } },
      },
    })

    const resultado = await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

    expect(resultado.ok).toBe(false)
    if (resultado.ok) {
      return
    }
    expect(resultado.error.status).toBe(402)
  })

  it('traduce un 5xx de la pasarela a un 502, que sí tiene sentido reintentar', async () => {
    const { fetch } = peticion({ status: 500, cuerpo: { error: 'se rompió' } })

    const resultado = await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

    expect(resultado.ok).toBe(false)
    if (resultado.ok) {
      return
    }
    expect(resultado.error.status).toBe(502)
  })

  it('traduce un 401 de la pasarela a un 502, porque el problema son nuestras llaves', async () => {
    const { fetch } = peticion({ status: 401, cuerpo: { error: 'llave inválida' } })

    const resultado = await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

    expect(resultado.ok).toBe(false)
    if (resultado.ok) {
      return
    }
    // No un 401: para quien compra, un 401 significa "tu sesión caducó" y lo que
    // ocurrió es que la tienda no pudo cobrar.
    expect(resultado.error.status).toBe(502)
  })
})

describe('CardGatewayAdapter.verifySignature', () => {
  const evento = {
    event: 'transaction.updated',
    data: { transaction: { id: 'tx-1', status: 'APPROVED', amountInCents: 5998000 } },
    signature: { properties: ['transaction.id', 'transaction.status'] },
    timestamp: 1,
  }
  // Firma calculada aparte y a mano, con la cadena que dice la documentación, para
  // que el test no dependa de la función que está probando.
  const firma = (payload: unknown, secret = CONFIG.eventsSecret): string => {
    const datos = payload as typeof evento

    return createHash('sha256')
      .update(
        `${datos.data.transaction.id}${datos.data.transaction.status}${datos.timestamp}${secret}`,
      )
      .digest('hex')
  }

  it('acepta un evento firmado con nuestro secreto de eventos', () => {
    const adapter = new CardGatewayAdapter(CONFIG, peticion({ status: 200, cuerpo: {} }).fetch)
    const conFirma = { ...evento, signature: { ...evento.signature, checksum: firma(evento) } }

    const resultado = adapter.verifySignature({ eventChecksum: undefined }, conFirma)

    expect(resultado.ok).toBe(true)
  })

  it('rechaza un evento firmado con otro secreto', () => {
    const adapter = new CardGatewayAdapter(CONFIG, peticion({ status: 200, cuerpo: {} }).fetch)
    const conFirma = {
      ...evento,
      signature: { ...evento.signature, checksum: firma(evento, 'otro') },
    }

    const resultado: Result<void, AppError> = adapter.verifySignature(
      { eventChecksum: undefined },
      conFirma,
    )

    expect(resultado.ok).toBe(false)
  })

  it('lee el checksum de la cabecera si el cuerpo no lo trae', () => {
    const adapter = new CardGatewayAdapter(CONFIG, peticion({ status: 200, cuerpo: {} }).fetch)
    const cabeceras: WebhookHeaders = { eventChecksum: firma(evento) }

    expect(adapter.verifySignature(cabeceras, evento).ok).toBe(true)
  })

  it('rechaza un cuerpo que no es un objeto, en vez de romperse', () => {
    const adapter = new CardGatewayAdapter(CONFIG, peticion({ status: 200, cuerpo: {} }).fetch)

    const resultado = adapter.verifySignature({ eventChecksum: 'x' }, 'no soy un evento')

    expect(resultado.ok).toBe(false)
  })
})

describe('errores del adaptador', () => {
  it('expone gatewayDeclinedError y gatewayUnavailableError como errores de negocio', () => {
    expect(gatewayDeclinedError('x').status).toBe(402)
    expect(gatewayUnavailableError('x').status).toBe(502)
    expect(ok(undefined).ok).toBe(true)
    expect(err(new Error('x')).ok).toBe(false)
  })
})
