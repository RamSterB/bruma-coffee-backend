import type {
  AccessToken,
  AccessTokenClaims,
  RefreshToken,
  SessionTokenPort,
} from '../../domain/ports/session-token'
import { UserRole } from '../../domain/enums/user-role.enum'

/**
 * Los nombres de los tokens son predecibles para que los tests puedan afirmar
 * sobre ellos. El hash se parece al real en lo que importa: no es el token.
 */
export class FakeSessionToken implements SessionTokenPort {
  accessIssued = 0
  refreshIssued = 0
  readonly access: AccessToken[] = []
  readonly refresh: RefreshToken[] = []
  readonly subjects: string[] = []

  async issueAccessToken(subject: string, role: string): Promise<AccessToken> {
    this.accessIssued += 1
    this.subjects.push(subject)
    const emitido: AccessToken = {
      token: `access-${this.accessIssued}-${role}`,
      expiresInSeconds: 900,
    }
    this.access.push(emitido)

    return emitido
  }

  async issueRefreshToken(): Promise<RefreshToken> {
    this.refreshIssued += 1
    const emitido: RefreshToken = {
      token: `refresh-${this.refreshIssued}`,
      hash: `hash-refresh-${this.refreshIssued}`,
      expiresInSeconds: 604800,
    }
    this.refresh.push(emitido)

    return emitido
  }

  hashRefreshToken(token: string): string {
    return `hash-${token}`
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
    if (token === '') {
      return null
    }

    return {
      subject: this.subjects[0] ?? '11111111-1111-4111-8111-111111111111',
      role: token.includes(UserRole.ADMIN) ? UserRole.ADMIN : UserRole.CUSTOMER,
    }
  }
}
