import { Injectable } from '@nestjs/common'
import { SessionTokenPort } from '../../domain/ports/session-token'
import { RefreshTokenRepositoryPort } from '../../domain/ports/refresh-token.repository'
import { ok, type Result } from '../../domain/result'

/**
 * Sin revocar el refresh, el logout seria un adorno: el token de acceso caduca en
 * quince minutos, pero el de refresh vivia siete dias. Revocar en el servidor es
 * lo que hace que cerrar sesion signifique algo.
 */
@Injectable()
export class LogoutUseCase {
  constructor(
    private readonly refreshTokens: RefreshTokenRepositoryPort,
    private readonly sessionToken: SessionTokenPort,
  ) {}

  async execute(rawToken: string): Promise<Result<void, never>> {
    const record = await this.refreshTokens.findByHash(this.sessionToken.hashRefreshToken(rawToken))

    if (record !== null && record.revokedAt === null) {
      await this.refreshTokens.revoke(record.id, new Date())
    }

    return ok(undefined)
  }
}
