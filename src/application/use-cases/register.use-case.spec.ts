import { RegisterUseCase } from './register.use-case'
import { FakeRefreshTokenRepository } from '../../testing/fakes/fake-refresh-token.repository'
import { FakeUserRepository } from '../../testing/fakes/fake-user.repository'
import { User } from '../../domain/entities/user.entity'
import { UserRole } from '../../domain/enums/user-role.enum'
import { FakeMailer } from '../../testing/fakes/fake-mailer'
import { FakePasswordHasher } from '../../testing/fakes/fake-password-hasher'

const nuevoCaso = () => {
  const users = new FakeUserRepository()
  const refreshTokens = new FakeRefreshTokenRepository()
  const passwordHasher = new FakePasswordHasher()
  const mailer = new FakeMailer()

  const caso = new RegisterUseCase(users, passwordHasher, mailer)

  return { caso, users, passwordHasher, mailer, refreshTokens }
}

const entrada = (email: string) => ({
  email,
  password: 'BrumaCafe2026!',
  fullName: 'Persona Registrada',
})

const cuentaVerificada = () =>
  User.reconstitute({
    id: '11111111-1111-4111-8111-111111111111',
    email: 'persona@ejemplo.com',
    passwordHash: 'hash:la-buena',
    fullName: 'Dueña Real',
    role: UserRole.CUSTOMER,
    customerId: '22222222-2222-4222-8222-222222222222',
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
  })

const cuentaSinVerificar = () =>
  User.reconstitute({
    id: '11111111-1111-4111-8111-111111111111',
    email: 'persona@ejemplo.com',
    passwordHash: 'hash:la-vieja',
    fullName: 'Persona Registrada',
    role: UserRole.CUSTOMER,
    customerId: null,
    emailVerifiedAt: null,
    createdAt: new Date(),
  })

describe('RegisterUseCase', () => {
  it('crea la cuenta cuando el correo es nuevo', async () => {
    const { caso, users } = nuevoCaso()

    await caso.execute(entrada('Persona@Ejemplo.com'))

    expect(users.todos).toHaveLength(1)
    expect(users.todos[0]?.email).toBe('persona@ejemplo.com')
  })

  it('nunca guarda la contrasena en claro', async () => {
    const { caso, users } = nuevoCaso()

    await caso.execute(entrada('persona@ejemplo.com'))

    expect(users.todos[0]?.passwordHash).toBe('hash:BrumaCafe2026!')
    expect(users.todos[0]?.passwordHash).not.toBe('BrumaCafe2026!')
  })

  it('nace sin verificar, sin customer y con role CUSTOMER', async () => {
    const { caso, users } = nuevoCaso()

    await caso.execute(entrada('persona@ejemplo.com'))

    expect(users.todos[0]?.isEmailVerified()).toBe(false)
    expect(users.todos[0]?.customerId).toBeNull()
    expect(users.todos[0]?.role).toBe(UserRole.CUSTOMER)
  })

  it('devuelve una respuesta neutra, sin token ni cookie', async () => {
    const { caso, users, refreshTokens } = nuevoCaso()

    const resultado = await caso.execute(entrada('persona@ejemplo.com'))

    expect(resultado).toEqual({ ok: true, value: { status: 'pending_verification' } })
    expect(JSON.stringify(resultado)).not.toMatch(/access|refresh|token/i)
    expect(refreshTokens.todos).toHaveLength(0)
    expect(users.todos[0]?.passwordHash).toBe('hash:BrumaCafe2026!')
  })

  it('devuelve exactamente la misma respuesta si el correo ya esta verificado', async () => {
    const { caso, users, mailer } = nuevoCaso()
    await users.save(cuentaVerificada())

    const resultado = await caso.execute(entrada('persona@ejemplo.com'))

    expect(resultado).toEqual({ ok: true, value: { status: 'pending_verification' } })
    expect(users.todos).toHaveLength(1)
    expect(users.todos[0]?.passwordHash).toBe('hash:la-buena')
    // Tambien se envia correo aqui. Si el envio fuera la pista, bastaba con
    // registrarse con un correo ajeno y mirar si llegaba algo para saber si
    // existe una cuenta.
    expect(mailer.enviados).toHaveLength(1)
  })

  it('sustituye la contrasena si la cuenta existe sin verificar', async () => {
    const { caso, users } = nuevoCaso()
    await users.save(cuentaSinVerificar())

    const resultado = await caso.execute(entrada('persona@ejemplo.com'))

    expect(resultado).toEqual({ ok: true, value: { status: 'pending_verification' } })
    expect(users.todos).toHaveLength(1)
    expect(users.todos[0]?.passwordHash).toBe('hash:BrumaCafe2026!')
  })

  it('envia el codigo de verificacion a la cuenta nueva y a la sustituida', async () => {
    const { caso, mailer } = nuevoCaso()

    await caso.execute(entrada('persona@ejemplo.com'))

    expect(mailer.enviados).toHaveLength(1)
    expect(mailer.enviados[0]?.to).toBe('persona@ejemplo.com')
  })

  it('reenvia el codigo si la cuenta ya existia sin verificar', async () => {
    const { caso, users, mailer } = nuevoCaso()
    await users.save(cuentaSinVerificar())

    await caso.execute(entrada('persona@ejemplo.com'))

    expect(mailer.enviados).toHaveLength(1)
  })

  it('no deja dos cuentas con el mismo correo', async () => {
    const { caso, users } = nuevoCaso()
    await caso.execute(entrada('persona@ejemplo.com'))
    await caso.execute(entrada('PERSONA@ejemplo.com'))

    expect(users.todos).toHaveLength(1)
  })

  it('rechaza un correo que no es un correo', async () => {
    const { caso, users, mailer } = nuevoCaso()

    const resultado = await caso.execute(entrada('no-es-un-correo'))

    expect(resultado.ok).toBe(false)
    expect(users.todos).toHaveLength(0)
    expect(mailer.enviados).toHaveLength(0)
  })

  it('rechaza una contrasena corta con un motivo legible', async () => {
    const { caso, users } = nuevoCaso()

    const resultado = await caso.execute({ ...entrada('persona@ejemplo.com'), password: 'corta' })

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.error.code).toBe('PASSWORD_TOO_WEAK')
      expect(resultado.error.message).toMatch(/contraseña/i)
    }
    expect(users.todos).toHaveLength(0)
  })
})
