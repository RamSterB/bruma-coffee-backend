import { createHash } from 'node:crypto'
import { CardGatewayAdapter } from './card-gateway.adapter'
import type { CardGatewayConfig } from '../../config/card-gateway.config'
import type { Result } from '../../domain/result'
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

const ACEPTACION_POR_DEFECTO: Respuesta = {
  status: 200,
  // Envolta en `data` como la pasarela real: leerlo en la raíz daría `undefined`
  // siempre, y el test pasaría mientras el cobro falla con un 422 sin explicación.
  cuerpo: {
    data: {
      presigned_acceptance: { acceptance_token: 'tok_aceptacion_1' },
      presigned_personal_data_auth: { acceptance_token: 'tok_datos_1' },
    },
    meta: {},
  },
}

/**
 * El doble responde a dos rutas distintas con dos respuestas distintas. El comercio
 * es la única llamada que no es una transacción, y si el mock le devolviera la
 * transacción, el test probaría algo que en la pasarela real no pasa.
 */
const peticion = (respuesta: Respuesta, aceptacion: Respuesta = ACEPTACION_POR_DEFECTO) => {
  const llamadas: { url: string; init: RequestInit }[] = []

  const fetch = async (url: string | URL, init: RequestInit = {}): Promise<Response> => {
    const direccion = String(url)
    llamadas.push({ url: direccion, init })

    const esComercio = direccion.includes('/merchants/')
    const responde = esComercio ? aceptacion : respuesta

    return {
      ok: responde.status >= 200 && responde.status < 300,
      status: responde.status,
      json: async () => responde.cuerpo,
      text: async () => JSON.stringify(responde.cuerpo),
    } as Response
  }

  return { fetch, llamadas }
}

/** La llamada que crea la transacción, que ya no es la primera: antes va el comercio. */
const transaccionDe = (llamadas: { url: string; init: RequestInit }[]): RequestInit => {
  const llamada = llamadas.find((registrada) => registrada.url.endsWith('/transactions'))

  if (llamada === undefined) {
    throw new Error('El adaptador no llamo a /transactions')
  }

  return llamada.init
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
  shippingAddress: 'Carrera 7 con Calle 72',
  shippingCity: 'Bogotá',
  shippingDepartment: 'Cundinamarca',
  ...over,
})

describe('CardGatewayAdapter.createTransaction', () => {
  it('manda el importe en centavos y el token, y nunca un número de tarjeta', async () => {
    const { fetch, llamadas } = peticion({
      status: 201,
      cuerpo: { status: 'PENDING', data: { id: 'tx-1', status: 'PENDING' } },
    })
    const adapter = new CardGatewayAdapter(CONFIG, fetch)

    await adapter.createTransaction(entrada({}))

    const cuerpo = JSON.parse(String(transaccionDe(llamadas).body))
    expect(cuerpo.amount_in_cents).toBe(5998000)
    expect(cuerpo.payment_method.token).toBe('tok_test_123')
    expect(JSON.stringify(cuerpo)).not.toMatch(/\d{13,19}/)
  })

  it('envía la llave privada, que es la única que autoriza un pago', async () => {
    const { fetch, llamadas } = peticion({
      status: 201,
      cuerpo: { status: 'PENDING', data: { id: 'tx-1', status: 'PENDING' } },
    })

    await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

    const cabeceras = transaccionDe(llamadas).headers as Record<string, string>
    expect(cabeceras.Authorization).toBe('Bearer prv_test_dos')
  })

  it('firma la petición con el secreto de integridad', async () => {
    const { fetch, llamadas } = peticion({
      status: 201,
      cuerpo: { status: 'PENDING', data: { id: 'tx-1', status: 'PENDING' } },
    })

    await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

    const cuerpo = JSON.parse(String(transaccionDe(llamadas).body))
    // Sin esta firma, cambiar el importe en tránsito sería tan fácil como editar el
    // cuerpo, así que su presencia no es opcional ni decorativa.
    expect(cuerpo.signature).toEqual(expect.stringMatching(/^[0-9a-f]{64}$/))
  })

  it('usa la referencia de la orden, que es como vuelve el evento', async () => {
    const { fetch, llamadas } = peticion({
      status: 201,
      cuerpo: { status: 'PENDING', data: { id: 'tx-1', status: 'PENDING' } },
    })

    await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

    expect(JSON.parse(String(transaccionDe(llamadas).body)).reference).toBe('BC-20260927-0001')
  })

  it('devuelve la referencia y el estado que responde la pasarela', async () => {
    const { fetch } = peticion({
      status: 201,
      cuerpo: { status: 'PENDING', data: { id: 'tx-77', status: 'PENDING' } },
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
        data: { id: 'tx-1', status: 'DECLINED' },
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

describe('CardGatewayAdapter.createTransaction contra el contrato real', () => {
  const transaccionAceptada = (referencia: string) => ({
    status: 201,
    cuerpo: { status: 'PENDING', data: { id: referencia, status: 'PENDING' } },
  })

  it('saca el identificador de data.id, que es donde viene, y no de data.transaction', async () => {
    // Con la ruta equivocada el identificador salía undefined y la referencia que se
    // guardaba era el número de orden. El webhook nunca habría casado con el pago y
    // la orden se habría quedado PENDING para siempre.
    const { fetch } = peticion(transaccionAceptada('tx-real'))

    const resultado = await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

    expect(resultado.ok && resultado.value.reference).toBe('tx-real')
  })

  it('pide el token de aceptacion antes de cobrar, porque es obligatorio', async () => {
    const { fetch, llamadas } = peticion(transaccionAceptada('tx-1'))

    const resultado = await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

    const texturas = llamadas.map((llamada) => llamada.url)
    expect(texturas.some((url) => url.includes('/merchants/'))).toBe(true)
    expect(resultado.ok).toBe(true)
  })

  it('manda el token de aceptacion en el cuerpo de la transaccion', async () => {
    const { fetch, llamadas } = peticion(transaccionAceptada('tx-1'))

    await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

    const cuerpo = JSON.parse(String(transaccionDe(llamadas).body))
    expect(cuerpo.acceptance_token).toBe('tok_aceptacion_1')
  })

  it('usa snake_case en los importes, porque en camel_case la pasarela responde 422', async () => {
    const { fetch, llamadas } = peticion(transaccionAceptada('tx-1'))

    await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

    const cuerpo = JSON.parse(String(transaccionDe(llamadas).body))
    expect(cuerpo.amount_in_cents).toBe(5998000)
    expect(cuerpo.amountInCents).toBeUndefined()
  })

  it('pide las cuotas, que la pasarela las espera en payment_method', async () => {
    const { fetch, llamadas } = peticion(transaccionAceptada('tx-1'))

    await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

    const cuerpo = JSON.parse(String(transaccionDe(llamadas).body))
    expect(cuerpo.payment_method.installments).toBe(1)
  })

  it('traduce un rechazo de la pasarela, que llega con 201 y estado DECLINED', async () => {
    // El rechazo no es un error de API: es un 201 con el estado DECLINED. Si se
    // tratara como exito, la orden quedaria PENDING para siempre sin que nada
    // avise, porque nunca llegaria un evento que la resolviera.
    const { fetch } = peticion({
      status: 201,
      cuerpo: {
        status: 'DECLINED',
        data: { id: 'tx-1', status: 'DECLINED' },
      },
    })

    const resultado = await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

    expect(resultado.ok).toBe(false)
    if (resultado.ok) {
      return
    }
    expect(resultado.error.status).toBe(402)
  })

  it('avisa como pasarela caída si no se puede pedir el token de aceptacion', async () => {
    const caida: Respuesta = { status: 500, cuerpo: { error: 'no se puede' } }
    const { fetch } = peticion(caida, caida)

    const resultado = await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

    expect(resultado.ok).toBe(false)
    if (resultado.ok) {
      return
    }
    expect(resultado.error.status).toBe(502)
  })
})

describe('CardGatewayAdapter.getTransactionStatus', () => {
  it('consulta la transacción por su identificador y devuelve el estado', async () => {
    // La ruta de consulta es la red de seguridad: si el evento no llega, el estado
    // se pregunta. Por eso el adaptador tiene que poder leer, no solo escribir.
    const { fetch, llamadas } = peticion({
      status: 200,
      cuerpo: { data: { id: 'tx-1', status: 'APPROVED', amount_in_cents: 150000 } },
    })

    const resultado = await new CardGatewayAdapter(CONFIG, fetch).getTransactionStatus('tx-1')

    expect(llamadas[0]?.url).toContain('/transactions/tx-1')
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) {
      return
    }
    expect(resultado.value).toEqual({ reference: 'tx-1', status: 'APPROVED', amount: 150000 })
  })

  it('traduce un 404 de la pasarela a un error, sin tirar la excepción', async () => {
    const { fetch } = peticion({ status: 404, cuerpo: { error: 'no existe' } })

    const resultado = await new CardGatewayAdapter(CONFIG, fetch).getTransactionStatus(
      'tx-inexistente',
    )

    expect(resultado.ok).toBe(false)
  })

  it('avisa como pasarela caída si la consulta falla por red', async () => {
    const fetch = async (): Promise<Response> => {
      throw new Error('sin conexión')
    }

    const resultado = await new CardGatewayAdapter(CONFIG, fetch).getTransactionStatus('tx-1')

    expect(resultado.ok).toBe(false)
    if (resultado.ok) {
      return
    }
    expect(resultado.error.status).toBe(502)
  })

  describe('CardGatewayAdapter.createTransaction y la direccion', () => {
    it('manda la direccion como objeto, porque como texto la pasarela la rechaza', async () => {
      // Con texto plano responde 422 y el unico campo que menciona es
      // `shipping_address: "Debe ser tipo hash"`, que no dice que el problema sea el
      // tipo. Se averiguo quitando campos del cuerpo uno a uno.
      const { fetch, llamadas } = peticion({
        status: 201,
        cuerpo: { data: { id: 'tx-1', status: 'PENDING' } },
      })

      await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

      const cuerpo = JSON.parse(String(transaccionDe(llamadas).body))
      expect(typeof cuerpo.shipping_address).toBe('object')
      expect(cuerpo.shipping_address.address_line_1).toBe('Carrera 7 con Calle 72')
    })

    it('parte el nombre en nombre y apellido, que son campos separados alli', async () => {
      const { fetch, llamadas } = peticion({
        status: 201,
        cuerpo: { data: { id: 'tx-1', status: 'PENDING' } },
      })

      await new CardGatewayAdapter(CONFIG, fetch).createTransaction(
        entrada({ customerName: 'Persona Compradora' }),
      )

      const cuerpo = JSON.parse(String(transaccionDe(llamadas).body))
      expect(cuerpo.shipping_address.first_name).toBe('Persona')
      expect(cuerpo.shipping_address.last_name).toBe('Compradora')
    })

    it('pone el pais como codigo ISO de dos letras, que no es COL', async () => {
      const { fetch, llamadas } = peticion({
        status: 201,
        cuerpo: { data: { id: 'tx-1', status: 'PENDING' } },
      })

      await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

      const cuerpo = JSON.parse(String(transaccionDe(llamadas).body))
      expect(cuerpo.shipping_address.country).toBe('CO')
    })

    it('no manda payment_source, que es para otros metodos de pago', async () => {
      const { fetch, llamadas } = peticion({
        status: 201,
        cuerpo: { data: { id: 'tx-1', status: 'PENDING' } },
      })

      await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

      const cuerpo = JSON.parse(String(transaccionDe(llamadas).body))
      expect(cuerpo.payment_source).toBeUndefined()
    })
  })
})

describe('CardGatewayAdapter con respuestas incompletas', () => {
  it('avisa si el comercio no responde con 200, en vez de seguir sin token', async () => {
    const { fetch } = peticion(
      { status: 201, cuerpo: { data: { id: 'tx-1', status: 'PENDING' } } },
      { status: 500, cuerpo: { error: 'no se puede' } },
    )

    const resultado = await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

    expect(resultado.ok).toBe(false)
    if (resultado.ok) {
      return
    }
    expect(resultado.error.status).toBe(502)
  })

  it('avisa si el comercio responde sin token de aceptación', async () => {
    const { fetch } = peticion(
      { status: 201, cuerpo: { data: { id: 'tx-1', status: 'PENDING' } } },
      { status: 200, cuerpo: { data: {} } },
    )

    const resultado = await new CardGatewayAdapter(CONFIG, fetch).createTransaction(entrada({}))

    expect(resultado.ok).toBe(false)
  })

  it('consulta sin datos de importe devuelve cero en vez de romperse', async () => {
    const { fetch } = peticion({ status: 200, cuerpo: { data: {} } })

    const resultado = await new CardGatewayAdapter(CONFIG, fetch).getTransactionStatus('tx-1')

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) {
      return
    }
    // Cero, y no `undefined`: el importe del evento no se usa para cobrar, pero
    // tiene que ser un número para que quien lo lea no tenga que comprobarlo.
    expect(resultado.value.amount).toBe(0)
    expect(resultado.value.reference).toBe('tx-1')
  })

  it('un estado desconocido se trata como ERROR, no como aprobado', async () => {
    const { fetch } = peticion({ status: 200, cuerpo: { data: { id: 'tx-1', status: 'RARO' } } })

    const resultado = await new CardGatewayAdapter(CONFIG, fetch).getTransactionStatus('tx-1')

    expect(resultado.ok && resultado.value.status).toBe('ERROR')
  })
})
