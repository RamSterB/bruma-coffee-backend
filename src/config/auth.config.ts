import type { ConfigService } from '@nestjs/config'

export interface AuthConfig {
  jwtSecret: string
  accessTtlSeconds: number
  refreshTtlSeconds: number
  /**
   * En produccion la cookie del refresh lleva Secure. En desarrollo no, porque
   * alli el servidor suele ir por http y una cookie Secure no vuelve nunca.
   */
  secureCookies: boolean
  /** Intentos de login admitidos por ventana, por correo y por IP. */
  login: {
    maxAttempts: number
    windowMs: number
  }
}

const porDefecto = (clave: string, valor: number): number => {
  const leido = Number(process.env[clave])

  return Number.isInteger(leido) && leido > 0 ? leido : valor
}

/**
 * El secreto del access token no tiene valor por defecto a proposito: en
 * produccion tiene que venir del entorno. Si falta, validateEnv aborta el
 * arranque, que es mejor que arrancar sin poder firmar nada.
 */
export const authConfig = (config: ConfigService): AuthConfig => ({
  jwtSecret: config.get<string>('JWT_SECRET') ?? '',
  accessTtlSeconds: porDefecto('ACCESS_TOKEN_TTL_SECONDS', 900),
  refreshTtlSeconds: porDefecto('REFRESH_TOKEN_TTL_SECONDS', 604800),
  secureCookies: process.env.NODE_ENV === 'production',
  login: {
    maxAttempts: porDefecto('LOGIN_MAX_ATTEMPTS', 5),
    windowMs: porDefecto('LOGIN_WINDOW_MS', 60000),
  },
})
