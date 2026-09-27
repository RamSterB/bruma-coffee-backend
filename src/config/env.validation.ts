/**
 * El access token se firma con HMAC y su unica defensa es este secreto. Sin el
 * la aplicacion firmaria con una llave vacia y devolveria 401 a todo el mundo
 * sin decir por que, que es un fallo dificil de diagnosticar: tiene cuatro
 * causas posibles y ninguna es obvia.
 *
 * Asi que si el secreto falta, es corto, o son espacios, no se arranca.
 */
export const MIN_SECRET_LENGTH = 32

const readSecret = (config: Record<string, unknown>, name: string): string => {
  const value = config[name]

  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Se la pasa ConfigModule.forRoot({ validate }) y corre con el .env ya fusionado
 * con process.env, antes de que exista ningun proveedor.
 */
export const validateEnv = (config: Record<string, unknown>): Record<string, unknown> => {
  const problemas: string[] = []
  const jwtSecret = readSecret(config, 'JWT_SECRET')

  if (jwtSecret.length === 0) {
    problemas.push('JWT_SECRET no esta definida.')
  } else if (jwtSecret.length < MIN_SECRET_LENGTH) {
    problemas.push(
      `JWT_SECRET necesita al menos ${MIN_SECRET_LENGTH} caracteres; tiene ${jwtSecret.length}.`,
    )
  }

  if (problemas.length > 0) {
    throw new Error(
      `Falta configuracion de autenticacion, y sin ella ninguna sesion puede firmarse:\n` +
        problemas.map((problema) => `  - ${problema}`).join('\n') +
        `\n\nEl access token se valida con la firma HMAC de este secreto. Arrancar sin el ` +
        `seria fingir que hay sesiones: cada login devolveria 401 sin explicar por que.`,
    )
  }

  return config
}
