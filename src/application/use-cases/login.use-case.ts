import { Injectable } from '@nestjs/common'
import { AppError } from '../../domain/errors/app-error'
import { invalidCredentialsError } from '../../domain/errors/auth.errors'
import { UserRole } from '../../domain/enums/user-role.enum'
import { PasswordHasherPort } from '../../domain/ports/password-hasher'
import { RefreshTokenRepositoryPort } from '../../domain/ports/refresh-token.repository'
import { SessionTokenPort } from '../../domain/ports/session-token'
import { UserRepositoryPort } from '../../domain/ports/user.repository'
import { err, ok, type Result } from '../../domain/result'
import { normalizeEmail } from '../../domain/validation/normalize-email'

export interface LoginInput {
  email: string
  password: string
}

export interface SessionUser {
  id: string
  email: string
  fullName: string
  role: UserRole
  isEmailVerified: boolean
}

export interface SessionOutput {
  accessToken: string
  accessTokenExpiresIn: number
  refreshToken: string
  user: SessionUser
}

/** Hash falso, para igualar el coste cuando el correo no existe. */
const DUMMY_HASH = '$2b$10$Zm9vYmFyYmF6cXV1eW91a2NvdW50cmFzYmxvbGFzMTIzNA'

/**
 * El fallo es el mismo en todos los casos y no dice si el correo existe
 * (OWASP A07). Cuando el correo no esta, aun asi se compara la
 * contrasena contra un hash fijo: sin eso, un login con correo inexistente
 * tardaria milisegundos y con correo existente tardaria ~100 ms, y esa diferencia
 * es un oraculo de enumeracion.
 */
@Injectable()
export class LoginUseCase {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly sessionToken: SessionTokenPort,
    private readonly refreshTokens: RefreshTokenRepositoryPort,
  ) {}

  async execute(input: LoginInput): Promise<Result<SessionOutput, AppError>> {
    const email = normalizeEmail(input.email)
    const user = await this.users.findByEmail(email)

    if (user === null) {
      await this.passwordHasher.compare(input.password, DUMMY_HASH)

      return err(invalidCredentialsError())
    }

    const coincide = await this.passwordHasher.compare(input.password, user.passwordHash)

    if (!coincide) {
      return err(invalidCredentialsError())
    }

    const userId = user.id as string
    const access = await this.sessionToken.issueAccessToken(userId, user.role)
    const refresh = await this.sessionToken.issueRefreshToken()

    await this.refreshTokens.save({
      userId,
      tokenHash: refresh.hash,
      expiresAt: new Date(Date.now() + refresh.expiresInSeconds * 1000),
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
