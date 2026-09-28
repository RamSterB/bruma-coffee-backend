import {
  CARD_GATEWAY_CONFIG,
  cardGatewayConfig,
  cardGatewayConfigFrom,
  gatewayEnvironment,
  validatePublicBaseUrl,
  webhookUrl,
} from './card-gateway.config'

/** Host neutro de pruebas. El de verdad lo pone cada quien en su entorno. */
const HOST_DE_PRUEBAS = 'https://api.pruebas.proveedor.example/v1'

describe('cardGatewayConfig', () => {
  const entornoOriginal = { ...process.env }

  afterEach(() => {
    process.env = { ...entornoOriginal }
  })

  it('no se inventa la URL: si no se define, no hay ninguna', () => {
    // Antes caia en un host escrito en el codigo. Sin valor por defecto el arranque se
    // corta en la validacion, que es donde se puede decir que variable falta.
    delete process.env.CARD_GATEWAY_BASE_URL

    expect(cardGatewayConfig().baseUrl).toBe('')
  })

  it('quita la barra final de la URL, que no pertenece a la API', () => {
    process.env.CARD_GATEWAY_BASE_URL = 'https://api.pruebas.proveedor.example/v1/'

    expect(cardGatewayConfig().baseUrl).toBe('https://api.pruebas.proveedor.example/v1')
  })

  it('lee las cuatro llaves del entorno', () => {
    process.env.CARD_GATEWAY_PUBLIC_KEY = 'pub_test_aaa'
    process.env.CARD_GATEWAY_PRIVATE_KEY = 'prv_test_bbb'
    process.env.CARD_GATEWAY_EVENTS_SECRET = 'test_events_ccc'
    process.env.CARD_GATEWAY_INTEGRITY_SECRET = 'test_integrity_ddd'
    process.env.CARD_GATEWAY_BASE_URL = HOST_DE_PRUEBAS

    expect(cardGatewayConfig()).toEqual({
      baseUrl: HOST_DE_PRUEBAS,
      publicKey: 'pub_test_aaa',
      privateKey: 'prv_test_bbb',
      eventsSecret: 'test_events_ccc',
      integritySecret: 'test_integrity_ddd',
    })
  })

  it('deja las llaves vacias si no estan, en vez de inventar un valor', () => {
    process.env.CARD_GATEWAY_PUBLIC_KEY = ''
    process.env.CARD_GATEWAY_PRIVATE_KEY = ''

    const config = cardGatewayConfig()

    expect(config.publicKey).toBe('')
    expect(config.privateKey).toBe('')
  })
})

describe('gatewayEnvironment', () => {
  const llavesDe = (ambiente: 'test' | 'prod') => ({
    baseUrl: HOST_DE_PRUEBAS,
    publicKey: `pub_${ambiente}_una`,
    privateKey: `prv_${ambiente}_dos`,
    eventsSecret: `${ambiente}_events_tres`,
    integritySecret: `${ambiente}_integrity_cuatro`,
  })

  it('reconoce las cuatro llaves de sandbox', () => {
    expect(gatewayEnvironment(llavesDe('test'))).toBe('sandbox')
  })

  it('reconoce las cuatro llaves de produccion, para poder avisar de que cobran dinero real', () => {
    expect(gatewayEnvironment(llavesDe('prod'))).toBe('production')
  })

  it('no reconoce el ambiente si las llaves son de los dos ambientes mezcladas', () => {
    const mezcladas = { ...llavesDe('test'), privateKey: 'prv_prod_dos' }

    expect(gatewayEnvironment(mezcladas)).toBeNull()
  })

  it('no reconoce el ambiente si las llaves no tienen el prefijo del proveedor', () => {
    const inventadas = {
      baseUrl: HOST_DE_PRUEBAS,
      publicKey: 'aaa',
      privateKey: 'bbb',
      eventsSecret: 'ccc',
      integritySecret: 'ddd',
    }

    expect(gatewayEnvironment(inventadas)).toBeNull()
  })
})

describe('CARD_GATEWAY_CONFIG', () => {
  it('es un token de inyeccion, y no una clase que el caso de uso pueda instanciar', () => {
    expect(typeof CARD_GATEWAY_CONFIG).toBe('string')
  })

  it('lee las llaves del registro que le pasan, y no de process.env', () => {
    // El validador de arranque recibe la configuracion ya fusionada como argumento
    // y no como process.env: leer de ahi haria que la prueba y el arranque
    // comprobaran dos fuentes distintas, y la prueba pasaria sin que el arranque
    // comprobara nada.
    process.env.CARD_GATEWAY_PUBLIC_KEY = 'pub_test_del_entorno'

    const config = cardGatewayConfigFrom({ CARD_GATEWAY_PUBLIC_KEY: 'pub_test_del_argumento' })

    expect(config.publicKey).toBe('pub_test_del_argumento')
  })

  it('tampoco se la inventa cuando lee de un registro', () => {
    expect(cardGatewayConfigFrom({}).baseUrl).toBe('')
  })

  it('reconoce las llaves de la convencion antigua stagtest_ como sandbox', () => {
    // La documentacion actual habla de pub_test_ y test_events_, pero las llaves del
    // material de origen usan la convencion anterior (stagtest_). Las dos son el
    // ambiente de pruebas: si solo se reconociera una, la aplicacion no arrancaria
    // con las llaves que de verdad trae el material.
    const antiguas = {
      baseUrl: 'https://api.pruebas.proveedor.example/v1',
      publicKey: 'pub_stagtest_una',
      privateKey: 'prv_stagtest_dos',
      eventsSecret: 'stagtest_events_tres',
      integritySecret: 'stagtest_integrity_cuatro',
    }

    expect(gatewayEnvironment(antiguas)).toBe('sandbox')
  })

  it('sigue rechazando una llave de pruebas junto a una de produccion', () => {
    const mezcladas = {
      baseUrl: 'https://api.pruebas.proveedor.example/v1',
      publicKey: 'pub_stagtest_una',
      privateKey: 'prv_prod_dos',
      eventsSecret: 'stagtest_events_tres',
      integritySecret: 'stagtest_integrity_cuatro',
    }

    expect(gatewayEnvironment(mezcladas)).toBeNull()
  })
})

describe('webhookUrl', () => {
  it('devuelve la URL del webhook a partir de la URL pública, sin barra final', () => {
    expect(webhookUrl('https://tienda.example.com/', '/api/webhooks/card-gateway')).toBe(
      'https://tienda.example.com/api/webhooks/card-gateway',
    )
  })

  it('rechaza una URL pública que no es absoluta, porque no sirve para nada', () => {
    // Sin esto, la URL del webhook sería "undefined/api/..." y el evento llegaría a
    // un sitio que no existe. Es un fallo silencioso: la pasarela insiste tres
    // veces y nadie sabe por qué.
    const resultado = validatePublicBaseUrl('localhost:8000')

    expect(resultado.ok).toBe(false)
  })

  it('acepta una URL absoluta con http, que es lo único que hay en local', () => {
    expect(validatePublicBaseUrl('http://localhost:8000').ok).toBe(true)
  })

  it('avisa si la URL pública usa http y no https', () => {
    // El aviso no es un bloqueo porque en local solo hay http, pero en producción
    // un webhook en http se puede mandar alterado por cualquiera en medio.
    const resultado = validatePublicBaseUrl('http://tienda.example.com')

    expect(resultado.ok).toBe(true)
    expect(resultado.advertencia).toMatch(/https/i)
  })

  it('no avisa si la URL pública ya usa https', () => {
    expect(validatePublicBaseUrl('https://tienda.example.com').advertencia).toBeUndefined()
  })
})

describe('validatePublicBaseUrl, los casos que faltan', () => {
  it('rechaza una URL vacía, que es lo que pasa si nadie la define', () => {
    expect(validatePublicBaseUrl('').ok).toBe(false)
  })

  it('rechaza un protocolo que no sea http, como un archivo', () => {
    expect(validatePublicBaseUrl('file:///etc/passwd').ok).toBe(false)
  })

  it('acepta una URL con puerto, que es como queda el túnel', () => {
    expect(validatePublicBaseUrl('http://localhost:8000').ok).toBe(true)
  })
})
