import {
  eventChecksumInput,
  integritySignature,
  readProperty,
  sha256,
  verifyEventSignature,
  type GatewayEvent,
} from './gateway-signature'

/**
 * El ejemplo viene de la documentación del proveedor, con su propio resultado
 * esperado. Si este test pasa es que el algoritmo es el que dice la documentación y
 * no uno parecido: un SHA-256 mal armado que "más o menos" cuadra con un ejemplo
 * cuadra con ninguno.
 */
const EVENTO_DE_DOCUMENTACION: GatewayEvent = {
  event: 'transaction.updated',
  data: {
    transaction: {
      id: '04a6e53d-a244-4140-ab9e-48fa541f9fe5',
      status: 'FAILED',
      amountInCents: 7500000,
    },
  },
  signature: {
    properties: ['transaction.id', 'transaction.status', 'transaction.amountInCents'],
    checksum: '82f0e769716170e202edfd348f604bd8461cdeeb416594cde563a890215a5282',
  },
  timestamp: 1747673128600,
}

const SECRETO = 'prod_events_7b193c8afd7b47949f90d443cb1e1742'

describe('verifyEventSignature', () => {
  it('acepta el evento de ejemplo de la documentación', () => {
    expect(verifyEventSignature(EVENTO_DE_DOCUMENTACION, SECRETO).ok).toBe(true)
  })

  it('con la cadena que dice la documentación, concatenated en ese orden exacto', () => {
    expect(
      eventChecksumInput(
        EVENTO_DE_DOCUMENTACION,
        ['transaction.id', 'transaction.status', 'transaction.amountInCents'],
        SECRETO,
      ),
    ).toBe(
      '04a6e53d-a244-4140-ab9e-48fa541f9fe5FAILED75000001747673128600prod_events_7b193c8afd7b47949f90d443cb1e1742',
    )
  })

  it('rechaza el evento si el secreto no es el', () => {
    expect(verifyEventSignature(EVENTO_DE_DOCUMENTACION, 'test_events_otro').ok).toBe(false)
  })

  it('rechaza el evento si alguien cambió el importe', () => {
    const manipulado: GatewayEvent = {
      ...EVENTO_DE_DOCUMENTACION,
      data: {
        transaction: { ...(EVENTO_DE_DOCUMENTACION.data?.transaction as object), amountInCents: 1 },
      },
    }

    expect(verifyEventSignature(manipulado, SECRETO).ok).toBe(false)
  })

  it('acepta el checksum que llega en la cabecera cuando el cuerpo no lo trae', () => {
    // El proveedor manda el checksum en dos sitios y deja elegir cuál usar. Si solo
    // se leyera el del cuerpo, un evento con el cuerpo recortado se rechazaría sin
    // necesidad, y la pasarela lo reintentaría tres veces sin éxito posible.
    const sinChecksumEnCuerpo: GatewayEvent = {
      ...EVENTO_DE_DOCUMENTACION,
      signature: { properties: EVENTO_DE_DOCUMENTACION.signature?.properties },
    }

    const verificado = verifyEventSignature(
      sinChecksumEnCuerpo,
      SECRETO,
      '82f0e769716170e202edfd348f604bd8461cdeeb416594cde563a890215a5282',
    )

    expect(verificado.ok).toBe(true)
  })

  it('rechaza un evento sin lista de propiedades, porque no hay nada que comprobar', () => {
    expect(verifyEventSignature({ event: 'transaction.updated', data: {} }, SECRETO).ok).toBe(false)
  })

  it('rechaza un evento sin checksum', () => {
    expect(
      verifyEventSignature({ signature: { properties: ['transaction.id'] } }, SECRETO).ok,
    ).toBe(false)
  })

  it('lee las propiedades que el evento declara, y no una lista fija', () => {
    // El proveedor añadió un campo a la firma y el mismo dato aparece con dos
    // grafías distintas según el evento. Con la lista fija, esto no se validaría.
    const conNombreDistinto: GatewayEvent = {
      data: { transaction: { amount_in_cents: 7500000, id: 'tx-1', status: 'APPROVED' } },
      signature: { properties: ['transaction.amount_in_cents'] },
      timestamp: 1,
    }
    const conGrafiaVieja: GatewayEvent = {
      ...conNombreDistinto,
      signature: { properties: ['transaction.amountInCents'] },
    }

    expect(verifyEventSignature(conNombreDistinto, 'secreto').ok).toBe(false)
    expect(verifyEventSignature(conGrafiaVieja, 'secreto').ok).toBe(false)
  })

  it('da el error de firma inválida, que es un 401 y no un 500', () => {
    const resultado = verifyEventSignature(EVENTO_DE_DOCUMENTACION, 'otro-secreto')

    expect(resultado.ok).toBe(false)
    if (resultado.ok) {
      return
    }
    expect(resultado.error.status).toBe(401)
  })
})

describe('readProperty', () => {
  it('recorre un camino con puntos', () => {
    expect(readProperty({ a: { b: { c: 'd' } } }, 'a.b.c')).toBe('d')
  })

  it('devuelve undefined en vez de romperse si un nivel no existe', () => {
    expect(readProperty({ a: 1 }, 'a.b.c')).toBeUndefined()
  })
})

describe('integritySignature', () => {
  it('hashea referencia, importe, moneda y secreto, en ese orden', () => {
    const firma = integritySignature({
      reference: 'BC-20260927-0001',
      amountInCents: 5998000,
      integritySecret: 'test_integrity_secreto',
    })

    expect(firma).toBe(sha256('BC-20260927-00015998000COPtest_integrity_secreto'))
  })

  it('cambia si cambia el importe, que es justo lo que tiene que impedir', () => {
    const conUnPesoMenos = integritySignature({
      reference: 'BC-1',
      amountInCents: 100,
      integritySecret: 's',
    })
    const original = integritySignature({
      reference: 'BC-1',
      amountInCents: 101,
      integritySecret: 's',
    })

    expect(conUnPesoMenos).not.toBe(original)
  })
})
