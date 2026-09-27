import { GetProfileUseCase } from './get-profile.use-case'
import { LogoutUseCase } from './logout.use-case'
import { FakeRefreshTokenRepository } from '../../testing/fakes/fake-refresh-token.repository'
import { FakeUserRepository } from '../../testing/fakes/fake-user.repository'
import { FakeSessionToken } from '../../testing/fakes/fake-session-token'
import { User } from '../../domain/entities/user.entity'
import { UserRole } from '../../domain/enums/user-role.enum'

const cuenta = () =>
  User.reconstitute({
    id: '11111111-1111-4111-8111-111111111111',
    email: 'persona@ejemplo.com',
    passwordHash: 'hash:BrumaCafe2026!',
    fullName: 'Persona Registrada',
    role: UserRole.CUSTOMER,
    customerId: '22222222-2222-4222-8222-222222222222',
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
  })

describe('LogoutUseCase', () => {
  it('revoca el refresh recibido en el servidor', async () => {
    const refreshTokens = new FakeRefreshTokenRepository()
    const caso = new LogoutUseCase(refreshTokens, new FakeSessionToken())
    await refreshTokens.save({
      userId: '11111111-1111-4111-8111-111111111111',
      tokenHash: 'hash-refresh-1',
      expiresAt: new Date(Date.now() + 604800000),
      revokedAt: null,
    })

    const resultado = await caso.execute('refresh-1')

    expect(resultado.ok).toBe(true)
    expect(refreshTokens.todos[0]?.revokedAt).not.toBeNull()
  })

  it('no falla si el token ya no estaba en la base', async () => {
    const refreshTokens = new FakeRefreshTokenRepository()
    const caso = new LogoutUseCase(refreshTokens, new FakeSessionToken())

    const resultado = await caso.execute('refresh-que-no-existe')

    expect(resultado.ok).toBe(true)
  })
})

describe('GetProfileUseCase', () => {
  it('devuelve el perfil de la cuenta del token', async () => {
    const users = new FakeUserRepository()
    await users.save(cuenta())
    const caso = new GetProfileUseCase(users)

    const resultado = await caso.execute('11111111-1111-4111-8111-111111111111')

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.value.email).toBe('persona@ejemplo.com')
      expect(resultado.value.role).toBe(UserRole.CUSTOMER)
      expect(resultado.value.isEmailVerified).toBe(true)
    }
  })

  it('nunca devuelve el hash de la contraseña', async () => {
    const users = new FakeUserRepository()
    await users.save(cuenta())
    const caso = new GetProfileUseCase(users)

    const resultado = await caso.execute('11111111-1111-4111-8111-111111111111')

    expect(JSON.stringify(resultado)).not.toMatch(/passwordHash|hash:/i)
  })

  it('falla si la cuenta ya no existe', async () => {
    const caso = new GetProfileUseCase(new FakeUserRepository())

    const resultado = await caso.execute('11111111-1111-4111-8111-111111111111')

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.error.code).toBe('USER_NOT_FOUND')
      expect(resultado.error.status).toBe(404)
    }
  })
})
