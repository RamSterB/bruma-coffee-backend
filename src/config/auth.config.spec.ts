import { ConfigService } from '@nestjs/config'
import { authConfig } from './auth.config'

const config = (valores: Record<string, unknown>) =>
  ({ get: (clave: string) => valores[clave] ?? undefined }) as ConfigService

describe('authConfig', () => {
  it('usa el secreto del entorno', () => {
    const leido = authConfig(config({ JWT_SECRET: 'secreto-de-produccion' }))

    expect(leido.jwtSecret).toBe('secreto-de-produccion')
  })

  it('deja el secreto vacio si no viene, en vez de inventar uno', () => {
    expect(authConfig(config({})).jwtSecret).toBe('')
  })

  it('usa los TTL por defecto, que son 15 minutos y 7 dias', () => {
    const leido = authConfig(config({}))

    expect(leido.accessTtlSeconds).toBe(900)
    expect(leido.refreshTtlSeconds).toBe(604800)
  })

  it('lee los TTL del entorno cuando vienen', () => {
    process.env.ACCESS_TOKEN_TTL_SECONDS = '600'
    process.env.REFRESH_TOKEN_TTL_SECONDS = '3600'

    try {
      const leido = authConfig(config({}))

      expect(leido.accessTtlSeconds).toBe(600)
      expect(leido.refreshTtlSeconds).toBe(3600)
    } finally {
      delete process.env.ACCESS_TOKEN_TTL_SECONDS
      delete process.env.REFRESH_TOKEN_TTL_SECONDS
    }
  })

  it('marca las cookies como seguras solo en produccion', () => {
    const anterior = process.env.NODE_ENV

    process.env.NODE_ENV = 'production'
    expect(authConfig(config({})).secureCookies).toBe(true)

    process.env.NODE_ENV = 'development'
    expect(authConfig(config({})).secureCookies).toBe(false)

    process.env.NODE_ENV = anterior
  })

  it('ignora un TTL que no es un entero positivo', () => {
    process.env.ACCESS_TOKEN_TTL_SECONDS = 'mucho'
    process.env.REFRESH_TOKEN_TTL_SECONDS = '-1'

    try {
      const leido = authConfig(config({}))

      expect(leido.accessTtlSeconds).toBe(900)
      expect(leido.refreshTtlSeconds).toBe(604800)
    } finally {
      delete process.env.ACCESS_TOKEN_TTL_SECONDS
      delete process.env.REFRESH_TOKEN_TTL_SECONDS
    }
  })

  describe('limite de intentos de login', () => {
    afterEach(() => {
      delete process.env.LOGIN_MAX_ATTEMPTS
      delete process.env.LOGIN_WINDOW_MS
    })

    it('por defecto son cinco intentos por minuto', () => {
      const leido = authConfig(config({ JWT_SECRET: 'x' }))

      expect(leido.login).toEqual({ maxAttempts: 5, windowMs: 60000 })
    })

    it('toma el limite y la ventana del entorno', () => {
      process.env.LOGIN_MAX_ATTEMPTS = '3'
      process.env.LOGIN_WINDOW_MS = '15000'

      const leido = authConfig(config({ JWT_SECRET: 'x' }))

      expect(leido.login).toEqual({ maxAttempts: 3, windowMs: 15000 })
    })

    it('ignora un limite que no es un numero positivo', () => {
      process.env.LOGIN_MAX_ATTEMPTS = 'muchos'

      const leido = authConfig(config({ JWT_SECRET: 'x' }))

      expect(leido.login.maxAttempts).toBe(5)
    })
  })

  describe('coste de bcrypt', () => {
    afterEach(() => {
      delete process.env.BCRYPT_ROUNDS
    })

    it('es un numero, no el texto del .env', () => {
      process.env.BCRYPT_ROUNDS = '12'

      const leido = authConfig(config({ JWT_SECRET: 'x' }))

      expect(typeof leido.bcryptRounds).toBe('number')
      expect(leido.bcryptRounds).toBe(12)
    })

    it('usa diez rondas si la variable no esta o no es un numero', () => {
      expect(authConfig(config({ JWT_SECRET: 'x' })).bcryptRounds).toBe(10)

      process.env.BCRYPT_ROUNDS = 'mucho'
      expect(authConfig(config({ JWT_SECRET: 'x' })).bcryptRounds).toBe(10)
    })
  })
})
