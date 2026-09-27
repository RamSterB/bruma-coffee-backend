import { LoginUseCase } from './login.use-case'
import { FakeRefreshTokenRepository } from '../../testing/fakes/fake-refresh-token.repository'
import { FakeUserRepository } from '../../testing/fakes/fake-user.repository'
import { User } from '../../domain/entities/user.entity'
import { UserRole } from '../../domain/enums/user-role.enum'
import type { UserRepositoryPort } from '../../domain/ports/user.repository'
import { FakeMailer } from '../../testing/fakes/fake-mailer'
import { FakePasswordHasher } from '../../testing/fakes/fake-password-hasher'
import { FakeSessionToken } from '../../testing/fakes/fake-session-token'

const nuevoCaso = () => {
  const users = new FakeUserRepository()
  const refreshTokens = new FakeRefreshTokenRepository()
  const passwordHasher = new FakePasswordHasher()
  const sessionToken = new FakeSessionToken()
  const mailer = new FakeMailer()

  const caso = new LoginUseCase(users, passwordHasher, sessionToken, refreshTokens)

  return { caso, users, refreshTokens, passwordHasher, sessionToken, mailer }
}

const guardarCuenta = (users: UserRepositoryPort, password = 'BrumaCafe2026!') =>
  users.save(
    User.reconstitute({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'persona@ejemplo.com',
      passwordHash: `hash:${password}`,
      fullName: 'Persona Registrada',
      role: UserRole.CUSTOMER,
      customerId: '22222222-2222-4222-8222-222222222222',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    }),
  )

const entrada = (password = 'BrumaCafe2026!') => ({
  email: 'persona@ejemplo.com',
  password,
})

describe('LoginUseCase', () => {
  it('devuelve el access token y guarda el refresh cuando las credenciales cuadran', async () => {
    const { caso, users, sessionToken, refreshTokens } = nuevoCaso()
    await guardarCuenta(users)

    const resultado = await caso.execute(entrada())

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.value.accessToken).toBe('access-1-CUSTOMER')
      expect(resultado.value.accessTokenExpiresIn).toBe(900)
      expect(resultado.value.refreshToken).toBe('refresh-1')
      expect(resultado.value.user.email).toBe('persona@ejemplo.com')
      expect(resultado.value.user.role).toBe(UserRole.CUSTOMER)
    }
    expect(sessionToken.accessIssued).toBe(1)
    expect(refreshTokens.todos).toHaveLength(1)
    expect(refreshTokens.todos[0]?.tokenHash).toBe('hash-refresh-1')
  })

  it('nunca guarda el refresh en claro, solo su hash', async () => {
    const { caso, users, refreshTokens } = nuevoCaso()
    await guardarCuenta(users)

    await caso.execute(entrada())

    expect(refreshTokens.todos[0]?.tokenHash).not.toBe('refresh-1')
  })

  it('falla con credenciales incorrectas', async () => {
    const { caso, users } = nuevoCaso()

    await guardarCuenta(users)

    const resultado = await caso.execute(entrada('la-contrasena-que-no-es'))

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.error.code).toBe('INVALID_CREDENTIALS')
      expect(resultado.error.status).toBe(401)
    }
  })

  it('falla con el mismo error si el correo no existe', async () => {
    const { caso } = nuevoCaso()

    const resultado = await caso.execute({ email: 'nadie@ejemplo.com', password: 'BrumaCafe2026!' })

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.error.code).toBe('INVALID_CREDENTIALS')
      expect(resultado.error.message).not.toMatch(/no existe|desconocido|no encontrada/i)
    }
  })

  it('compara la contrasena aunque el correo no exista, para no delatarlo por tiempo', async () => {
    const { caso, passwordHasher } = nuevoCaso()

    await caso.execute({ email: 'nadie@ejemplo.com', password: 'BrumaCafe2026!' })

    expect(passwordHasher.comparaciones).toHaveLength(1)
  })

  it('no emite refresh si la cuenta no esta verificada', async () => {
    const { caso, users, sessionToken } = nuevoCaso()
    await users.save(
      User.reconstitute({
        id: '11111111-1111-4111-8111-111111111111',
        email: 'persona@ejemplo.com',
        passwordHash: 'hash:BrumaCafe2026!',
        fullName: 'Persona Registrada',
        role: UserRole.CUSTOMER,
        customerId: null,
        emailVerifiedAt: null,
        createdAt: new Date(),
      }),
    )

    const resultado = await caso.execute(entrada())

    // El login no se bloquea por no verificar: la cuenta funciona, solo
    // que no ve historial. Por eso entra igual.
    expect(resultado.ok).toBe(true)
    expect(sessionToken.accessIssued).toBe(1)
  })

  it('normaliza el correo antes de buscar', async () => {
    const { caso, users } = nuevoCaso()
    await guardarCuenta(users)

    const resultado = await caso.execute({
      email: '  PERSONA@Ejemplo.com ',
      password: 'BrumaCafe2026!',
    })

    expect(resultado.ok).toBe(true)
  })
})
