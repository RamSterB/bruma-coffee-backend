import { BcryptPasswordHasher } from './bcrypt-password-hasher'
import { JwtSessionToken } from './jwt-session-token'
import { hashRefreshToken } from './refresh-token-hash'

const BCRYPT_ROUNDS = 10

describe('BcryptPasswordHasher', () => {
  const hasher = new BcryptPasswordHasher(BCRYPT_ROUNDS)

  it('produce un hash que no contiene la contraseña', async () => {
    const hash = await hasher.hash('BrumaCafe2026!')

    expect(hash).not.toContain('BrumaCafe2026!')
    expect(hash.startsWith('$2')).toBe(true)
  })

  it('produce un hash distinto cada vez, por la sal', async () => {
    const [uno, otro] = await Promise.all([
      hasher.hash('BrumaCafe2026!'),
      hasher.hash('BrumaCafe2026!'),
    ])

    expect(uno).not.toBe(otro)
  })

  it('reconoce la contraseña correcta', async () => {
    const hash = await hasher.hash('BrumaCafe2026!')

    await expect(hasher.compare('BrumaCafe2026!', hash)).resolves.toBe(true)
  })

  it('rechaza la contraseña incorrecta', async () => {
    const hash = await hasher.hash('BrumaCafe2026!')

    await expect(hasher.compare('otra-cosa', hash)).resolves.toBe(false)
  })

  it('falla al comparar contra un hash que no es de bcrypt, en vez de reventar', async () => {
    await expect(hasher.compare('BrumaCafe2026!', 'no-es-un-hash')).resolves.toBe(false)
  })
})

describe('hashRefreshToken', () => {
  it('devuelve 64 caracteres hexadecimales, que es lo que cabe en la columna', () => {
    expect(hashRefreshToken('refresh-cualquiera')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('es determinista', () => {
    expect(hashRefreshToken('refresh-cualquiera')).toBe(hashRefreshToken('refresh-cualquiera'))
  })

  it('no es el token: con SHA-256 el token no se puede recuperar de la base', () => {
    expect(hashRefreshToken('refresh-cualquiera')).not.toBe('refresh-cualquiera')
  })

  it('cambia con el token', () => {
    expect(hashRefreshToken('uno')).not.toBe(hashRefreshToken('otro'))
  })
})

describe('JwtSessionToken', () => {
  const secret = 'secreto-de-prueba-que-no-es-el-de-produccion'
  const tokens = new JwtSessionToken(secret, 900, 604800)

  it('emite un access token que verifica con el mismo secreto', async () => {
    const emitido = await tokens.issueAccessToken('user-1', 'CUSTOMER')

    await expect(tokens.verifyAccessToken(emitido.token)).resolves.toEqual({
      subject: 'user-1',
      role: 'CUSTOMER',
    })
  })

  it('no acepta un access token firmado con otro secreto', async () => {
    const ajeno = new JwtSessionToken('otro-secreto-distinto', 900, 604800)
    const emitido = await ajeno.issueAccessToken('user-1', 'CUSTOMER')

    await expect(tokens.verifyAccessToken(emitido.token)).resolves.toBeNull()
  })

  it('rechaza un token alterado', async () => {
    const emitido = await tokens.issueAccessToken('user-1', 'CUSTOMER')
    const alterado = `${emitido.token.slice(0, -2)}xx`

    await expect(tokens.verifyAccessToken(alterado)).resolves.toBeNull()
  })

  it('rechaza una cadena que no es un token', async () => {
    await expect(tokens.verifyAccessToken('esto-no-es-un-jwt')).resolves.toBeNull()
  })

  it('devuelve el hash del refresh junto al token, nunca el token en claro en la base', async () => {
    const emitido = await tokens.issueRefreshToken()

    expect(emitido.token).not.toBe(emitido.hash)
    expect(emitido.hash).toBe(hashRefreshToken(emitido.token))
  })

  it('el refresh expira en 7 dias y el access en 15 minutos', async () => {
    const access = await tokens.issueAccessToken('user-1', 'CUSTOMER')
    const refresh = await tokens.issueRefreshToken()

    expect(access.expiresInSeconds).toBe(900)
    expect(refresh.expiresInSeconds).toBe(604800)
  })
})
