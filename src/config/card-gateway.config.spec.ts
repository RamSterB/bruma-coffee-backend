import {
  CARD_GATEWAY_CONFIG,
  SANDBOX_BASE_URL,
  cardGatewayConfig,
  cardGatewayConfigFrom,
  gatewayEnvironment,
} from './card-gateway.config'

describe('cardGatewayConfig', () => {
  const entornoOriginal = { ...process.env }

  afterEach(() => {
    process.env = { ...entornoOriginal }
  })

  it('usa la URL de sandbox de la documentacion oficial cuando no se define ninguna', () => {
    delete process.env.CARD_GATEWAY_BASE_URL

    expect(cardGatewayConfig().baseUrl).toBe(SANDBOX_BASE_URL)
  })

  it('quita la barra final de la URL, que no pertenece a la API', () => {
    process.env.CARD_GATEWAY_BASE_URL = 'https://sandbox.wompi.co/v1/'

    expect(cardGatewayConfig().baseUrl).toBe('https://sandbox.wompi.co/v1')
  })

  it('lee las cuatro llaves del entorno', () => {
    process.env.CARD_GATEWAY_PUBLIC_KEY = 'pub_test_aaa'
    process.env.CARD_GATEWAY_PRIVATE_KEY = 'prv_test_bbb'
    process.env.CARD_GATEWAY_EVENTS_SECRET = 'test_events_ccc'
    process.env.CARD_GATEWAY_INTEGRITY_SECRET = 'test_integrity_ddd'

    expect(cardGatewayConfig()).toEqual({
      baseUrl: SANDBOX_BASE_URL,
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
    baseUrl: SANDBOX_BASE_URL,
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
      baseUrl: SANDBOX_BASE_URL,
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

  it('usa la URL de sandbox por defecto tambien cuando lee de un registro', () => {
    expect(cardGatewayConfigFrom({}).baseUrl).toBe(SANDBOX_BASE_URL)
  })
})
