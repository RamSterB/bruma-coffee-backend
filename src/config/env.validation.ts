/**
 * El arranque comprueba, antes de crear ningun proveedor, que este todo lo que hace
 * falta para funcionar. Sin este paso la aplicacion levanta sana y falla mas tarde,
 * que es la peor forma de fallar: el health check responde y el primer cliente que
 * intenta pagar o entrar se encuentra con un 500 sin explicacion.
 *
 * Son dos grupos, y en los dos se prefiere no arrancar:
 *
 * - La **sesion**: el access token se firma con HMAC y su unica defensa es el
 *   secreto. Sin el, la aplicacion firmaria con una llave vacia y devolveria 401 a
 *   todo el mundo sin decir por que: un fallo con cuatro causas posibles y ninguna
 *   obvia.
 * - La **pasarela de pago**: las cuatro llaves. No hay adaptador simulado, el
 *   adaptador habla con el proveedor de verdad, asi que sin ellas no hay forma de
 *   cobrar.
 */
import {
  cardGatewayConfigFrom,
  gatewayEnvironment,
  type CardGatewayConfig,
} from './card-gateway.config'

export const MIN_SECRET_LENGTH = 32

const readSecret = (config: Record<string, unknown>, name: string): string => {
  const value = config[name]

  return typeof value === 'string' ? value.trim() : ''
}

const problemasDeSesion = (config: Record<string, unknown>): string[] => {
  const jwtSecret = readSecret(config, 'JWT_SECRET')

  if (jwtSecret.length === 0) {
    return ['JWT_SECRET no esta definida.']
  }

  if (jwtSecret.length < MIN_SECRET_LENGTH) {
    return [
      `JWT_SECRET necesita al menos ${MIN_SECRET_LENGTH} caracteres; tiene ${jwtSecret.length}.`,
    ]
  }

  return []
}

const LLAVES_DE_LA_PASARELA = [
  ['CARD_GATEWAY_PUBLIC_KEY', 'publicKey'],
  ['CARD_GATEWAY_PRIVATE_KEY', 'privateKey'],
  ['CARD_GATEWAY_EVENTS_SECRET', 'eventsSecret'],
  ['CARD_GATEWAY_INTEGRITY_SECRET', 'integritySecret'],
] as const satisfies readonly (readonly [string, keyof CardGatewayConfig])[]

const problemasDePasarela = (pasarela: CardGatewayConfig): string[] => {
  const faltantes = LLAVES_DE_LA_PASARELA.filter(([, campo]) => pasarela[campo].length === 0).map(
    ([variable]) => `${variable} no esta definida.`,
  )

  if (faltantes.length > LLAVES_DE_LA_PASARELA.length - 1) {
    // Con una o dos llaves sueltas el mensaje de "no esta definida" repetido cuatro
    // veces no ayuda a nadie; lo que falta es el bloque entero.
    return ['Falta el bloque CARD_GATEWAY_* de la pasarela de pago.']
  }

  if (faltantes.length > 0) {
    return faltantes
  }

  if (gatewayEnvironment(pasarela) === null) {
    return [
      'No se puede determinar el ambiente de la pasarela: las cuatro llaves tienen que ser ' +
        'del mismo y con prefijo del proveedor (pub_test_, prv_test_, test_events_ y ' +
        'test_integrity_ en sandbox; pub_prod_, prv_prod_, prod_events_ y prod_integrity_ en ' +
        'produccion). Llaves de los dos ambientes mezcladas son el caso peligroso: la ' +
        'peticion se crearia con la llave de un ambiente contra la URL del otro.',
    ]
  }

  return []
}

const EXPLICACION_DE_SESION =
  'El access token se valida con la firma HMAC de este secreto. Arrancar sin el seria fingir ' +
  'que hay sesiones: cada login devolveria 401 sin explicar por que.'

const EXPLICACION_DE_PASARELA =
  'No hay adaptador simulado a proposito: arrancar sin estas llaves dejaria una tienda que ' +
  'parece vender y no cobra, y el fallo se descubriria en el primer pago de un cliente y no ' +
  'en el despliegue.'

/**
 * Se la pasa ConfigModule.forRoot({ validate }) y corre con el .env ya fusionado
 * con process.env, antes de que exista ningun proveedor.
 *
 * Los dos grupos de problemas se juntan en un solo error: quien arranca tiene que ver
 * todo lo que falta de una vez, y no corregir una variable, reiniciar y descubrir la
 * siguiente.
 */
export const validateEnv = (config: Record<string, unknown>): Record<string, unknown> => {
  const sesion = problemasDeSesion(config)
  const pasarela = problemasDePasarela(cardGatewayConfigFrom(config))
  const secciones = [
    sesion.length > 0
      ? `Falta configuracion de autenticacion, y sin ella ninguna sesion puede firmarse:\n${sesion
          .map((problema) => `  - ${problema}`)
          .join('\n')}\n\n${EXPLICACION_DE_SESION}`
      : null,
    pasarela.length > 0
      ? `Falta configuracion de la pasarela de pago, y sin ella no se puede cobrar:\n${pasarela
          .map((problema) => `  - ${problema}`)
          .join('\n')}\n\n${EXPLICACION_DE_PASARELA}`
      : null,
  ].filter((seccion): seccion is string => seccion !== null)

  if (secciones.length > 0) {
    throw new Error(`La aplicacion no arranca con esta configuracion:\n\n${secciones.join('\n\n')}`)
  }

  return config
}
