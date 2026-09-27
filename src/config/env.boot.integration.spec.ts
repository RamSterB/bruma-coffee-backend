import { Test } from '@nestjs/testing'
import { ConfigModule } from '@nestjs/config'
import { validateEnv } from './env.validation'

/**
 * La funcion de validacion por si sola no demuestra nada: lo que importa es que
 * el arranque de la aplicacion muere cuando falta el secreto. Estos tests
 * compilan un modulo real con la misma configuracion que usa AppModule.
 */
describe('arranque sin configuracion de autenticacion', () => {
  const montar = (env: Record<string, string | undefined>) => {
    for (const clave of Object.keys(process.env)) {
      if (clave === 'JWT_SECRET') {
        delete process.env.JWT_SECRET
      }
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

  it('compila sin problema con un secreto válido', async () => {
    const anterior = { ...process.env }

    await expect(
      montar({ JWT_SECRET: 'a-secreto-validado-de-pruebas-123456' }),
    ).resolves.toBeDefined()
    restaurar(anterior)
  })
})
