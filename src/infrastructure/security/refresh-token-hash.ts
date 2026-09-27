import { createHash } from 'crypto'

/**
 * SHA-256 del refresh token. No es bcrypt a proposito: aqui no hay nada que
 * atacar con fuerza bruta, porque el token son 256 bits aleatorios, y bcrypt
 * ralentizaria cada refresh sin aportar nada.
 *
 * Lo que si protege es que una copia de la tabla no sirva para robar sesiones.
 */
export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex')
