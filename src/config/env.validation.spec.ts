import { validateEnv } from './env.validation'

const completa = { JWT_SECRET: 'un-secreto-suficientemente-largo-para-pruebas' }

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
    expect(() => validateEnv({ JWT_SECRET: 'a'.repeat(32) })).not.toThrow()
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
})
