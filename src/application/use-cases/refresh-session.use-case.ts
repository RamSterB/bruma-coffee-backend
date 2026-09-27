import { Injectable } from '@nestjs/common'
import { AppError } from '../../domain/errors/app-error'
import { sessionExpiredError } from '../../domain/errors/auth.errors'
import { SessionTokenPort } from '../../domain/ports/session-token'
import { RefreshTokenRepositoryPort } from '../../domain/ports/refresh-token.repository'
import { UserRepositoryPort } from '../../domain/ports/user.repository'
import { err, ok, type Result } from '../../domain/result'
import type { SessionOutput } from './login.use-case'

/**
 * El refresh rota siempre: el token recibido se revoca y se emite otro. Asi, si
 * alguien se lleva un token robado, el uso legitimo posterior genera un token
 * nuevo y el robado muere en la rotacion siguiente.
 */
@Injectable()
export class RefreshSessionUseCase {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly sessionToken: SessionTokenPort,
    private readonly refreshTokens: RefreshTokenRepositoryPort,
  ) {}

  async execute(rawToken: string): Promise<Result<SessionOutput, AppError>> {
    const record = await this.refreshTokens.findByHash(this.sessionToken.hashRefreshToken(rawToken))

    if (record === null) {
      return err(sessionExpiredError())
    }

    const now = new Date()
    const vigente = record.revokedAt === null && record.expiresAt.getTime() > now.getTime()

    if (!vigente) {
      return err(sessionExpiredError())
    }

    const user = await this.users.findById(record.userId)

    if (user === null) {
      return err(sessionExpiredError())
    }

    await this.refreshTokens.revoke(record.id, now)

    const userId = user.id as string
    const access = await this.sessionToken.issueAccessToken(userId, user.role)
    const refresh = await this.sessionToken.issueRefreshToken()

    await this.refreshTokens.save({
      userId,
      tokenHash: refresh.hash,
      expiresAt: new Date(now.getTime() + refresh.expiresInSeconds * 1000),
      revokedAt: null,
    })

    return ok({
      accessToken: access.token,
      accessTokenExpiresIn: access.expiresInSeconds,
      refreshToken: refresh.token,
      user: {
        id: userId,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isEmailVerified: user.isEmailVerified(),
      },
    })
  }
}
