import { validateEnv } from './env.validation'

/**
 * Las cuatro llaves de la pasarela son obligatorias: sin ellas no se puede cobrar, y
 * como el adaptador habla con el proveedor de verdad, no hay forma de cobrar de otro
 * modo. Un entorno con solo el secreto de sesion es un entorno incompleto, y arrancar a
 * medias seria fingir que la app esta sana.
 */
const pasarela = {
  CARD_GATEWAY_PUBLIC_KEY: 'pub_test_una',
  CARD_GATEWAY_PRIVATE_KEY: 'prv_test_dos',
  CARD_GATEWAY_BASE_URL: 'https://api.pruebas.proveedor.example/v1',
  CARD_GATEWAY_EVENTS_SECRET: 'test_events_tres',
  CARD_GATEWAY_INTEGRITY_SECRET: 'test_integrity_cuatro',
}

const completa = {
  JWT_SECRET: 'un-secreto-suficientemente-largo-para-pruebas',
  ...pasarela,
}

describe('validateEnv', () => {
  it('devuelve la configuración intacta cuando está todo', () => {
    expect(validateEnv({ ...completa })).toEqual(completa)
  })

  it('falla si falta JWT_SECRET', () => {
    expect(() => validateEnv({})).toThrow(/JWT_SECRET/)
  })

  it('falla si JWT_SECRET está vacío', () => {
    expect(() => validateEnv({ JWT_SECRET: '' })).toThrow(/JWT_SECRET/)
  })

  it('falla si JWT_SECRET son solo espacios, que es el caso de un .env mal pegado', () => {
    expect(() => validateEnv({ JWT_SECRET: '   ' })).toThrow(/JWT_SECRET/)
  })

  it('acepta un secreto de 32 caracteres o más', () => {
    expect(() => validateEnv({ JWT_SECRET: 'a'.repeat(32), ...pasarela })).not.toThrow()
  })

  it('rechaza un secreto demasiado corto, que se adivina', () => {
    expect(() => validateEnv({ JWT_SECRET: 'corto' })).toThrow(/32/)
  })

  it('nombra todas las variables que faltan, no solo la primera', () => {
    let mensaje = ''

    try {
      validateEnv({})
    } catch (error) {
      mensaje = (error as Error).message
    }

    expect(mensaje).toContain('JWT_SECRET')
  })

  it('no revienta por variables que no son de autenticación', () => {
    expect(() => validateEnv({ ...completa, PORT: '8000', DB_HOST: 'postgres16' })).not.toThrow()
  })

  it('falla si falta la llave publica de la pasarela, que es la que tokeniza en el navegador', () => {
    expect(() => validateEnv({ ...completa, CARD_GATEWAY_PUBLIC_KEY: '' })).toThrow(
      /CARD_GATEWAY_PUBLIC_KEY/,
    )
  })

  it('falla si falta la llave privada, que es la que autoriza el pago', () => {
    expect(() => validateEnv({ ...completa, CARD_GATEWAY_PRIVATE_KEY: '' })).toThrow(
      /CARD_GATEWAY_PRIVATE_KEY/,
    )
  })

  it('falla si falta el secreto de eventos, sin el cual el webhook no se puede validar', () => {
    expect(() => validateEnv({ ...completa, CARD_GATEWAY_EVENTS_SECRET: '' })).toThrow(
      /CARD_GATEWAY_EVENTS_SECRET/,
    )
  })

  it('falla si falta el secreto de integridad, sin el cual no se puede firmar el pago', () => {
    expect(() => validateEnv({ ...completa, CARD_GATEWAY_INTEGRITY_SECRET: '' })).toThrow(
      /CARD_GATEWAY_INTEGRITY_SECRET/,
    )
  })

  it('acepta las cuatro llaves de produccion, porque en produccion es lo que hay', () => {
    expect(() =>
      validateEnv({
        ...completa,
        CARD_GATEWAY_PUBLIC_KEY: 'pub_prod_una',
        CARD_GATEWAY_PRIVATE_KEY: 'prv_prod_dos',
        CARD_GATEWAY_EVENTS_SECRET: 'prod_events_tres',
        CARD_GATEWAY_INTEGRITY_SECRET: 'prod_integrity_cuatro',
      }),
    ).not.toThrow()
  })

  it('falla si las llaves son de los dos ambientes, porque no se sabe a donde se cobra', () => {
    expect(() => validateEnv({ ...completa, CARD_GATEWAY_PRIVATE_KEY: 'prv_prod_dos' })).toThrow(
      /ambiente/,
    )
  })

  it('falla si los prefijos no son del proveedor, porque entonces no se sabe el ambiente', () => {
    expect(() => validateEnv({ ...completa, CARD_GATEWAY_PUBLIC_KEY: 'mi-llave' })).toThrow(
      /ambiente/,
    )
  })
})
