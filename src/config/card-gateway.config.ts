/**
 * La pasarela se configura desde el entorno y no desde el codigo, por la misma
 * razon que los precios: cambiar de ambiente es una operacion, no un despliegue.
 *
 * El nombre del proveedor no aparece aqui a proposito. Se eligio asi el
 * 2026-09-27: neutralizar el nombre no aporta seguridad, porque el nombre tampoco
 * es un secreto, y si aporta algo es evitar que el proveedor se filtre en las
 * migraciones.
 */

/** Token de inyeccion. Vive aqui y no en el modulo por el mismo motivo que PRICING_CONFIG. */
export const CARD_GATEWAY_CONFIG = 'CARD_GATEWAY_CONFIG'

export interface CardGatewayConfig {
  /**
   * Base URL de la API. Sandbox y produccion son APIs distintas con la misma
   * especificacion: lo unico que cambia es la URL y el prefijo de las llaves.
   * Configurable porque la documentacion oficial y el material de origen ya no
   * coinciden en la direccion de sandbox.
   */
  baseUrl: string
  /** Llave publica: es la unica que puede ir en el navegador, para tokenizar. */
  publicKey: string
  /** Llave privada: solo el backend. Nunca en el bundle del frontend. */
  privateKey: string
  /** Secreto de eventos: valida la firma del webhook. No es la llave privada. */
  eventsSecret: string
  /** Secreto de integridad: firma las peticiones de pago. */
  integritySecret: string
}

type GatewayEnvironment = 'sandbox' | 'production'

/**
 * Que prefijo espera cada llave en cada ambiente. Una llave `pub_prod_` con la URL
 * de sandbox cobra dinero real, asi que el prefijo se comprueba en vez de confiar
 * en que la URL este bien puesta.
 *
 * De pruebas hay **dos** convenciones y conviven: `test_`, que es la actual de la
 * documentacion oficial, y `stagtest_`, la anterior, que es la que traen las
 * llaves del material de origen y apuntan al host UAT. Se aceptan las dos porque
 * las dos son pruebas, y reconocer solo una dejaria la aplicacion sin arrancar con
 * unas llaves perfectamente validas.
 */
type LlaveDeLaPasarela = keyof Omit<CardGatewayConfig, 'baseUrl'>

const PREFIJOS: Record<LlaveDeLaPasarela, Record<GatewayEnvironment, string[]>> = {
  publicKey: { sandbox: ['pub_test_', 'pub_stagtest_'], production: ['pub_prod_'] },
  privateKey: { sandbox: ['prv_test_', 'prv_stagtest_'], production: ['prv_prod_'] },
  eventsSecret: { sandbox: ['test_events_', 'stagtest_events_'], production: ['prod_events_'] },
  integritySecret: {
    sandbox: ['test_integrity_', 'stagtest_integrity_'],
    production: ['prod_integrity_'],
  },
}

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '')

/**
 * Lee la configuracion de un registro. Existe separada de `cardGatewayConfig` porque
 * el validador de arranque recibe el registro ya fusionado como argumento, y si leyera
 * de `process.env` estaria comprobando una fuente distinta de la que arranca.
 */
export const cardGatewayConfigFrom = (config: Record<string, unknown>): CardGatewayConfig => ({
  baseUrl: texto(config.CARD_GATEWAY_BASE_URL).replace(/\/+$/, ''),
  publicKey: texto(config.CARD_GATEWAY_PUBLIC_KEY),
  privateKey: texto(config.CARD_GATEWAY_PRIVATE_KEY),
  eventsSecret: texto(config.CARD_GATEWAY_EVENTS_SECRET),
  integritySecret: texto(config.CARD_GATEWAY_INTEGRITY_SECRET),
})

export const cardGatewayConfig = (): CardGatewayConfig => cardGatewayConfigFrom(process.env)

/**
 * El ambiente que dicen las cuatro llaves a la vez. `null` cuando no se puede saber
 * con certeza, y esa es la respuesta que importa: llaves mezcladas o prefijos que no
 * son del proveedor no se adivinan, se rechazan.
 */
export const gatewayEnvironment = (config: CardGatewayConfig): GatewayEnvironment | null => {
  const ambientes = (Object.keys(PREFIJOS) as LlaveDeLaPasarela[]).map((llave) => {
    const valor = config[llave]

    if (PREFIJOS[llave].sandbox.some((prefijo) => valor.startsWith(prefijo))) {
      return 'sandbox' as const
    }

    return PREFIJOS[llave].production.some((prefijo) => valor.startsWith(prefijo))
      ? ('production' as const)
      : null
  })

  const unico = ambientes[0]

  return ambientes.every((ambiente) => ambiente === unico && ambiente !== null) ? unico : null
}

/** Ruta donde la pasarela notifica el estado de cada cobro. */
export const WEBHOOK_PATH = '/api/webhooks/card-gateway'

/**
 * La URL pública de esta aplicación, y la que hay que registrar en el panel de la
 * pasarela para que nos llame.
 *
 * Existe como dato propio y no se deduce de nada porque hay tres sitios que
 * necesitan la misma respuesta: el registro que se hace en el panel, el aviso al
 * arrancar para no tener que buscarla, y la documentación del despliegue. Si cada
 * uno lo compusiera por su cuenta, un día apuntarían a sitios distintos y el
 * síntoma sería que "la pasarela no llama".
 */
export const PUBLIC_BASE_URL = 'PUBLIC_BASE_URL'

export interface PublicUrlValidation {
  ok: boolean
  advertencia?: string
}

/**
 * Valida la URL pública. Solo se avisa del `http` y no se bloquea, porque en local
 * no hay `https` y sin túnel el webhook no se podría probar; pero el aviso está,
 * porque en producción un webhook en http se puede alterar por el camino.
 */
export const validatePublicBaseUrl = (valor: string): PublicUrlValidation => {
  const limpio = valor.trim()

  if (limpio.length === 0) {
    return { ok: false }
  }

  let url: URL
  try {
    url = new URL(limpio)
  } catch {
    return { ok: false }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false }
  }

  return url.protocol === 'http:'
    ? {
        ok: true,
        advertencia: 'La URL pública usa http: en producción el webhook tiene que ser https.',
      }
    : { ok: true }
}

export const publicBaseUrl = (): string =>
  (process.env.PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, '')

/** La URL completa que hay que registrar en el panel de la pasarela. */
export const webhookUrl = (base: string, path: string = WEBHOOK_PATH): string =>
  `${base.replace(/\/+$/, '')}${path}`
