import { RefreshSessionUseCase } from './refresh-session.use-case'
import { FakeRefreshTokenRepository } from '../../testing/fakes/fake-refresh-token.repository'
import { FakeUserRepository } from '../../testing/fakes/fake-user.repository'
import { FakeSessionToken } from '../../testing/fakes/fake-session-token'
import { User } from '../../domain/entities/user.entity'
import { UserRole } from '../../domain/enums/user-role.enum'

const nuevoCaso = () => {
  const users = new FakeUserRepository()
  const refreshTokens = new FakeRefreshTokenRepository()
  const sessionToken = new FakeSessionToken()

  const caso = new RefreshSessionUseCase(users, sessionToken, refreshTokens)

  return { caso, users, refreshTokens, sessionToken }
}

const guardarCuenta = async (users: FakeUserRepository) =>
  users.save(
    User.reconstitute({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'persona@ejemplo.com',
      passwordHash: 'hash:BrumaCafe2026!',
      fullName: 'Persona Registrada',
      role: UserRole.CUSTOMER,
      customerId: '22222222-2222-4222-8222-222222222222',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    }),
  )

describe('RefreshSessionUseCase', () => {
  it('emite una sesion nueva y rota el refresh', async () => {
    const { caso, users, refreshTokens, sessionToken } = nuevoCaso()
    await guardarCuenta(users)
    const emitido = await sessionToken.issueRefreshToken()
    await refreshTokens.save({
      userId: '11111111-1111-4111-8111-111111111111',
      tokenHash: emitido.hash,
      expiresAt: new Date(Date.now() + 604800000),
      revokedAt: null,
    })

    const resultado = await caso.execute(emitido.token)

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.value.accessToken).toBe('access-1-CUSTOMER')
      expect(resultado.value.refreshToken).toBe('refresh-2')
    }
  })

  it('revoca el token usado, que es lo que hace util la rotacion', async () => {
    const { caso, users, refreshTokens, sessionToken } = nuevoCaso()
    await guardarCuenta(users)
    const emitido = await sessionToken.issueRefreshToken()
    await refreshTokens.save({
      userId: '11111111-1111-4111-8111-111111111111',
      tokenHash: emitido.hash,
      expiresAt: new Date(Date.now() + 604800000),
      revokedAt: null,
    })

    await caso.execute(emitido.token)

    expect(refreshTokens.todos[0]?.revokedAt).not.toBeNull()
    expect(refreshTokens.todos).toHaveLength(2)
  })

  it('falla si el token no existe', async () => {
    const { caso } = nuevoCaso()

    const resultado = await caso.execute('refresh-inventado')

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.error.code).toBe('SESSION_EXPIRED')
      expect(resultado.error.status).toBe(401)
    }
  })

  it('falla si el token ya fue revocado, para que un token robado no sirva dos veces', async () => {
    const { caso, users, refreshTokens, sessionToken } = nuevoCaso()
    await guardarCuenta(users)
    const emitido = await sessionToken.issueRefreshToken()
    await refreshTokens.save({
      userId: '11111111-1111-4111-8111-111111111111',
      tokenHash: emitido.hash,
      expiresAt: new Date(Date.now() + 604800000),
      revokedAt: new Date(),
    })

    const resultado = await caso.execute(emitido.token)

    expect(resultado.ok).toBe(false)
  })

  it('falla si el token ha caducado', async () => {
    const { caso, users, refreshTokens, sessionToken } = nuevoCaso()
    await guardarCuenta(users)
    const emitido = await sessionToken.issueRefreshToken()
    await refreshTokens.save({
      userId: '11111111-1111-4111-8111-111111111111',
      tokenHash: emitido.hash,
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
    })

    const resultado = await caso.execute(emitido.token)

    expect(resultado.ok).toBe(false)
  })

  it('falla si la cuenta del token ya no existe', async () => {
    const { caso, refreshTokens, sessionToken } = nuevoCaso()
    const emitido = await sessionToken.issueRefreshToken()
    await refreshTokens.save({
      userId: '11111111-1111-4111-8111-111111111111',
      tokenHash: emitido.hash,
      expiresAt: new Date(Date.now() + 604800000),
      revokedAt: null,
    })

    const resultado = await caso.execute(emitido.token)

    expect(resultado.ok).toBe(false)
  })
})
