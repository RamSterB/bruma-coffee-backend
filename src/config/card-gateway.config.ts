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

/** URL de sandbox segun la documentacion oficial del proveedor. */
export const SANDBOX_BASE_URL = 'https://sandbox.wompi.co/v1'

type GatewayEnvironment = 'sandbox' | 'production'

/**
 * Que prefijo espera cada llave en cada ambiente. Una llave `pub_prod_` con la URL
 * de sandbox cobra dinero real, asi que el prefijo se comprueba en vez de confiar
 * en que la URL este bien puesta.
 */
const PREFIJOS: Record<
  keyof Omit<CardGatewayConfig, 'baseUrl'>,
  Record<GatewayEnvironment, string>
> = {
  publicKey: { sandbox: 'pub_test_', production: 'pub_prod_' },
  privateKey: { sandbox: 'prv_test_', production: 'prv_prod_' },
  eventsSecret: { sandbox: 'test_events_', production: 'prod_events_' },
  integritySecret: { sandbox: 'test_integrity_', production: 'prod_integrity_' },
}

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '')

/**
 * Lee la configuracion de un registro. Existe separada de `cardGatewayConfig` porque
 * el validador de arranque recibe el registro ya fusionado como argumento, y si leyera
 * de `process.env` estaria comprobando una fuente distinta de la que arranca.
 */
export const cardGatewayConfigFrom = (config: Record<string, unknown>): CardGatewayConfig => ({
  baseUrl: (texto(config.CARD_GATEWAY_BASE_URL) || SANDBOX_BASE_URL).replace(/\/+$/, ''),
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
  const ambientes = (Object.keys(PREFIJOS) as (keyof typeof PREFIJOS)[]).map((llave) => {
    const valor = config[llave]

    return valor.startsWith(PREFIJOS[llave].sandbox)
      ? ('sandbox' as const)
      : valor.startsWith(PREFIJOS[llave].production)
        ? ('production' as const)
        : null
  })

  const unico = ambientes[0]

  return ambientes.every((ambiente) => ambiente === unico && ambiente !== null) ? unico : null
}
