import { Test } from '@nestjs/testing'
import { ConfigModule } from '@nestjs/config'
import { validateEnv } from './env.validation'

/**
 * La funcion de validacion por si sola no demuestra nada: lo que importa es que
 * el arranque de la aplicacion muere cuando falta el secreto. Estos tests
 * compilan un modulo real con la misma configuracion que usa AppModule.
 */
/** Todas las llaves que el validador lee. Si alguna se queda puesta, la prueba pasa
 * con el valor del .env del desarrollador y no prueba nada. */
const LLAVES_DEL_VALIDADOR = [
  'JWT_SECRET',
  'CARD_GATEWAY_PUBLIC_KEY',
  'CARD_GATEWAY_PRIVATE_KEY',
  'CARD_GATEWAY_EVENTS_SECRET',
  'CARD_GATEWAY_INTEGRITY_SECRET',
] as const

const LLAVES_DE_SANDBOX = {
  CARD_GATEWAY_PUBLIC_KEY: 'pub_test_una',
  CARD_GATEWAY_PRIVATE_KEY: 'prv_test_dos',
  CARD_GATEWAY_EVENTS_SECRET: 'test_events_tres',
  CARD_GATEWAY_INTEGRITY_SECRET: 'test_integrity_cuatro',
} as const

describe('arranque sin configuracion completa', () => {
  const montar = (env: Record<string, string | undefined>) => {
    for (const clave of LLAVES_DEL_VALIDADOR) {
      delete process.env[clave]
    }
    Object.assign(process.env, env)

    return Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })],
    }).compile()
  }

  const restaurar = (anterior: NodeJS.ProcessEnv) => {
    process.env = anterior
  }

  it('falla al compilar el modulo si falta JWT_SECRET', async () => {
    const anterior = { ...process.env }

    await expect(montar({ JWT_SECRET: undefined })).rejects.toThrow(/JWT_SECRET/)
    restaurar(anterior)
  })

  it('falla tambien si el secreto es demasiado corto', async () => {
    const anterior = { ...process.env }

    await expect(montar({ JWT_SECRET: '1234' })).rejects.toThrow(/32/)
    restaurar(anterior)
  })

  it('falla al arrancar si falta el bloque de la pasarela, que no tiene sustituto', async () => {
    const anterior = { ...process.env }

    await expect(montar({ JWT_SECRET: 'a-secreto-validado-de-pruebas-123456' })).rejects.toThrow(
      /CARD_GATEWAY/,
    )
    restaurar(anterior)
  })

  it('falla al arrancar si las llaves son de los dos ambientes', async () => {
    const anterior = { ...process.env }

    await expect(
      montar({
        JWT_SECRET: 'a-secreto-validado-de-pruebas-123456',
        ...LLAVES_DE_SANDBOX,
        CARD_GATEWAY_PRIVATE_KEY: 'prv_prod_dos',
      }),
    ).rejects.toThrow(/ambiente/)
    restaurar(anterior)
  })

  it('compila sin problema con el secreto y las cuatro llaves de sandbox', async () => {
    const anterior = { ...process.env }

    await expect(
      montar({ JWT_SECRET: 'a-secreto-validado-de-pruebas-123456', ...LLAVES_DE_SANDBOX }),
    ).resolves.toBeDefined()
    restaurar(anterior)
  })
})
