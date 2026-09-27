import { createHmac, timingSafeEqual } from 'crypto'
import { SessionTokenPort } from '../../domain/ports/session-token'
import type { AccessToken, AccessTokenClaims, RefreshToken } from '../../domain/ports/session-token'
import { hashRefreshToken } from './refresh-token-hash'

const base64url = (entrada: Buffer | string): string =>
  Buffer.from(entrada).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const fromBase64url = (entrada: string): Buffer => Buffer.from(entrada, 'base64url')

interface AccessClaims {
  sub: string
  role: string
  iat: number
  exp: number
}

/**
 * JWT firmado con HMAC-SHA256, implementado sobre crypto de Node. Son unas pocas lineas y no una dependencia mas que actualizar.
 */
export class JwtSessionToken implements SessionTokenPort {
  constructor(
    private readonly secret: string,
    private readonly accessTtlSeconds: number,
    private readonly refreshTtlSeconds: number,
  ) {}

  async issueAccessToken(subject: string, role: string): Promise<AccessToken> {
    const issuedAt = Math.floor(Date.now() / 1000)
    const header = { alg: 'HS256', typ: 'JWT' }
    const claims: AccessClaims = {
      sub: subject,
      role,
      iat: issuedAt,
      exp: issuedAt + this.accessTtlSeconds,
    }
    const token = this.sign(header, claims)

    return { token, expiresInSeconds: this.accessTtlSeconds }
  }

  async issueRefreshToken(): Promise<RefreshToken> {
    const token = `${this.randomSegment()}.${this.randomSegment()}`

    return { token, hash: hashRefreshToken(token), expiresInSeconds: this.refreshTtlSeconds }
  }

  hashRefreshToken(token: string): string {
    return hashRefreshToken(token)
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
    const partes = token.split('.')

    if (partes.length !== 3) {
      return null
    }

    const [header, payload, signature] = partes
    const esperada = this.signature(`${header}.${payload}`)

    if (!this.matches(signature, esperada)) {
      return null
    }

    let claims: AccessClaims

    try {
      claims = JSON.parse(fromBase64url(payload).toString('utf8')) as AccessClaims
    } catch {
      return null
    }

    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) {
      return null
    }

    if (typeof claims.sub !== 'string' || typeof claims.role !== 'string') {
      return null
    }

    return { subject: claims.sub, role: claims.role }
  }

  private sign(header: object, claims: object): string {
    const segmento = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`

    return `${segmento}.${this.signature(segmento)}`
  }

  private signature(segmento: string): string {
    return createHmac('sha256', this.secret).update(segmento).digest('base64url')
  }

  private matches(recibida: string, esperada: string): boolean {
    const a = Buffer.from(recibida)
    const b = Buffer.from(esperada)

    if (a.length !== b.length) {
      return false
    }

    return timingSafeEqual(a, b)
  }

  private randomSegment(): string {
    return createHmac('sha256', this.secret)
      .update(`${Date.now()}:${Math.random()}`)
      .digest('base64url')
      .slice(0, 32)
  }
}
