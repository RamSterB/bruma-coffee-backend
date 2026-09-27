import { UnauthorizedException } from '@nestjs/common'
import { JwtAuthGuard, CustomerGuard, AdminGuard } from './auth.guards'
import { UserRole } from '../../../domain/enums/user-role.enum'
import { FakeSessionToken } from '../../../testing/fakes/fake-session-token'
import { FakeUserRepository } from '../../../testing/fakes/fake-user.repository'
import { User } from '../../../domain/entities/user.entity'

type Contexto = Record<string, unknown>

const contexto = (request: Contexto | undefined) => ({
  switchToHttp: () => ({ getRequest: () => request }),
  getHandler: () => () => undefined,
  getClass: () => class {},
})

const cuenta = (verificada: boolean, role = UserRole.CUSTOMER) =>
  User.reconstitute({
    id: '11111111-1111-4111-8111-111111111111',
    email: 'persona@ejemplo.com',
    passwordHash: 'hash:BrumaCafe2026!',
    fullName: 'Persona Registrada',
    role,
    customerId: '22222222-2222-4222-8222-222222222222',
    emailVerifiedAt: verificada ? new Date() : null,
    createdAt: new Date(),
  })

const userId = '11111111-1111-4111-8111-111111111111'

describe('JwtAuthGuard', () => {
  const conCabecera = async (authorization: string) => {
    const tokens = new FakeSessionToken()
    const emitido = await tokens.issueAccessToken(userId, UserRole.CUSTOMER)
    const request: Contexto = {
      headers: { authorization: authorization.replace('TOKEN', emitido.token) },
    }
    const guard = new JwtAuthGuard(tokens)

    return { guard, request, tokens }
  }

  it('deja pasar una peticion con un access token valido', async () => {
    const { guard, request, tokens } = await conCabecera('Bearer TOKEN')

    await expect(guard.canActivate(contexto(request) as never)).resolves.toBe(true)
    expect(tokens.verifyAccessToken).toBeDefined()
  })

  it('deja el id de cuenta y el role en la peticion, que es lo que usan los demas guards', async () => {
    const { guard, request } = await conCabecera('Bearer TOKEN')

    await guard.canActivate(contexto(request) as never)

    expect(request.auth).toEqual({ userId, role: UserRole.CUSTOMER })
  })

  it('rechaza con 401 una peticion sin cabecera Authorization', async () => {
    const tokens = new FakeSessionToken()
    const request: Contexto = { headers: {} }

    await expect(new JwtAuthGuard(tokens).canActivate(contexto(request) as never)).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it('rechaza una peticion que no llega hasta el guard, sin objeto de peticion', async () => {
    const tokens = new FakeSessionToken()

    await expect(
      new JwtAuthGuard(tokens).canActivate(contexto(undefined) as never),
    ).rejects.toThrow(UnauthorizedException)
  })

  it('rechaza un token caducado', async () => {
    const { guard, request } = await conCabecera('Bearer TOKEN-caducado')

    await expect(guard.canActivate(contexto(request) as never)).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it('rechaza un token que nadie emitio', async () => {
    const tokens = new FakeSessionToken()
    const request: Contexto = { headers: { authorization: 'Bearer inventado' } }

    await expect(new JwtAuthGuard(tokens).canActivate(contexto(request) as never)).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it('acepta el esquema Bearer en minusculas, que es como lo envia el navegador', async () => {
    const { guard, request } = await conCabecera('bearer TOKEN')

    await expect(guard.canActivate(contexto(request) as never)).resolves.toBe(true)
  })

  it('no acepta un refresh token en el lugar del access, que es el ataque clasico', async () => {
    const tokens = new FakeSessionToken()
    const request: Contexto = { headers: { authorization: 'Bearer refresh-1' } }

    await expect(new JwtAuthGuard(tokens).canActivate(contexto(request) as never)).rejects.toThrow(
      UnauthorizedException,
    )
  })
})

describe('CustomerGuard', () => {
  const montar = async (verificada: boolean, role = UserRole.CUSTOMER) => {
    const users = new FakeUserRepository()
    await users.save(cuenta(verificada, role))
    const request: Contexto = { auth: { userId, role } }

    return { guard: new CustomerGuard(users), request }
  }

  it('deja pasar a una cuenta con el correo verificado', async () => {
    const { guard, request } = await montar(true)

    await expect(guard.canActivate(contexto(request) as never)).resolves.toBe(true)
  })

  it('impide el historial de pedidos a una cuenta sin verificar', async () => {
    const { guard, request } = await montar(false)

    await expect(guard.canActivate(contexto(request) as never)).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it('deja pasar a un admin sin comprobar su correo', async () => {
    const { guard, request } = await montar(false, UserRole.ADMIN)

    await expect(guard.canActivate(contexto(request) as never)).resolves.toBe(true)
  })

  it('impide el paso si el guard de sesion no corrio antes', async () => {
    const users = new FakeUserRepository()

    await expect(
      new CustomerGuard(users).canActivate(contexto({} as Contexto) as never),
    ).rejects.toThrow(UnauthorizedException)
  })

  it('impide el paso si la cuenta ya no existe, para no devolver un perfil vacio', async () => {
    const users = new FakeUserRepository()
    const request: Contexto = { auth: { userId, role: UserRole.CUSTOMER } }

    await expect(new CustomerGuard(users).canActivate(contexto(request) as never)).rejects.toThrow(
      UnauthorizedException,
    )
  })
})

describe('AdminGuard', () => {
  const ejecutar = (request: Contexto) => new AdminGuard().canActivate(contexto(request) as never)

  it('deja pasar a un admin', async () => {
    await expect(ejecutar({ auth: { userId, role: UserRole.ADMIN } })).resolves.toBe(true)
  })

  it('impide el paso a un cliente, que es el caso que de verdad importa', async () => {
    await expect(ejecutar({ auth: { userId, role: UserRole.CUSTOMER } })).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it('impide el paso a una peticion sin sesion', async () => {
    await expect(ejecutar({})).rejects.toThrow(UnauthorizedException)
  })
})
