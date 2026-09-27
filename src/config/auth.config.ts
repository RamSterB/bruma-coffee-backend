import type { ConfigService } from '@nestjs/config'

export interface AuthConfig {
  jwtSecret: string
  accessTtlSeconds: number
  refreshTtlSeconds: number
}

const porDefecto = (clave: string, valor: number): number => {
  const leido = Number(process.env[clave])

  return Number.isInteger(leido) && leido > 0 ? leido : valor
}

/**
 * El secreto del access token no tiene valor por defecto a proposito: en
 * produccion tiene que venir del entorno. Si falta, la aplicacion arranca
 * igual pero nadie puede firmar un token, que es peor que no arrancar.
 */
export const authConfig = (config: ConfigService): AuthConfig => ({
  jwtSecret: config.get<string>('JWT_SECRET') ?? '',
  accessTtlSeconds: porDefecto('ACCESS_TOKEN_TTL_SECONDS', 900),
  refreshTtlSeconds: porDefecto('REFRESH_TOKEN_TTL_SECONDS', 604800),
})
