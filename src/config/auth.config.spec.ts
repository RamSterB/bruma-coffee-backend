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
})
