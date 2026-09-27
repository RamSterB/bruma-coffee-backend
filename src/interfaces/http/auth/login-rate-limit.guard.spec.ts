import { jest } from '@jest/globals'
import { ConfigService } from '@nestjs/config'
import { HttpStatus } from '@nestjs/common'
import { LoginRateLimitGuard } from './login-rate-limit.guard'

const peticion = (ip: string, body: unknown) => ({
  switchToHttp: () => ({
    getRequest: () => ({ ip, body, headers: {} }),
  }),
  getHandler: () => () => undefined,
  getClass: () => class {},
})

const LIMITE = 5

const configCon = (valores: Record<string, unknown>): ConfigService =>
  ({ get: (clave: string) => valores[clave] }) as unknown as ConfigService

/**
 * El reloj se falsea en vez de esperar: dormir sesenta segundos en un test no es
 * una prueba, es una espera.
 */
const congelarReloj = () => {
  let momento = 1_000_000
  const espia = jest.spyOn(Date, 'now').mockImplementation(() => momento)

  return {
    avanzar: (ms: number) => {
      momento += ms
    },
    restaurar: () => espia.mockRestore(),
  }
}

const montar = (login: Record<string, unknown> = { maxAttempts: LIMITE, windowMs: 60_000 }) => {
  const reloj = congelarReloj()
  const guard = new LoginRateLimitGuard(configCon({ auth: { login } }))

  return { guard, reloj }
}

const intentar = (guard: LoginRateLimitGuard, ip: string, body: unknown): boolean =>
  guard.canActivate(peticion(ip, body) as never)

const estaBloqueado = (guard: LoginRateLimitGuard, ip: string, body: unknown): boolean => {
  try {
    intentar(guard, ip, body)
    return false
  } catch (error) {
    return (error as { status?: number }).status === HttpStatus.TOO_MANY_REQUESTS
  }
}

describe('LoginRateLimitGuard', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('deja pasar los primeros cinco intentos', () => {
    const { guard } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      expect(intentar(guard, '1.1.1.1', { email: 'a@ejemplo.com' })).toBe(true)
    }
  })

  it('bloquea el sexto intento', () => {
    const { guard } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      intentar(guard, '1.1.1.1', { email: 'a@ejemplo.com' })
    }

    expect(estaBloqueado(guard, '1.1.1.1', { email: 'a@ejemplo.com' })).toBe(true)
  })

  it('bloquea por correo aunque venga de otra IP, que es la fuerza bruta contra una cuenta', () => {
    const { guard } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      intentar(guard, `1.1.1.${intento}`, { email: 'victima@ejemplo.com' })
    }

    expect(estaBloqueado(guard, '9.9.9.9', { email: 'victima@ejemplo.com' })).toBe(true)
  })

  it('bloquea por IP aunque cambie el correo en cada intento, que es el barrido de cuentas', () => {
    const { guard } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      intentar(guard, '5.5.5.5', { email: `cuenta${intento}@ejemplo.com` })
    }

    expect(estaBloqueado(guard, '5.5.5.5', { email: 'otra@ejemplo.com' })).toBe(true)
  })

  it('deja pasar a otra cuenta desde otra IP mientras la primera no se bloquea', () => {
    const { guard } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      intentar(guard, '1.1.1.1', { email: 'a@ejemplo.com' })
    }

    expect(intentar(guard, '2.2.2.2', { email: 'b@ejemplo.com' })).toBe(true)
  })

  it('vuelve a dejar pasar cuando pasa la ventana de tiempo', () => {
    const { guard, reloj } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      intentar(guard, '1.1.1.1', { email: 'a@ejemplo.com' })
    }
    expect(estaBloqueado(guard, '1.1.1.1', { email: 'a@ejemplo.com' })).toBe(true)

    reloj.avanzar(60_001)

    expect(intentar(guard, '1.1.1.1', { email: 'a@ejemplo.com' })).toBe(true)
  })

  it('no cuenta los intentos correctos, porque sino un usuario legitimo se bloquea a si mismo', () => {
    const { guard } = montar()

    for (let intento = 0; intento < 20; intento += 1) {
      guard.marcarExito('a@ejemplo.com', '1.1.1.1')
    }

    expect(intentar(guard, '1.1.1.1', { email: 'a@ejemplo.com' })).toBe(true)
  })

  it('un login correcto borra el historial de esa cuenta y esa IP', () => {
    const { guard } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      intentar(guard, '1.1.1.1', { email: 'a@ejemplo.com' })
    }
    guard.marcarExito('a@ejemplo.com', '1.1.1.1')

    expect(intentar(guard, '1.1.1.1', { email: 'a@ejemplo.com' })).toBe(true)
  })

  it('normaliza el correo, para que no se evada el limite cambiando mayusculas', () => {
    const { guard } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      intentar(guard, '1.1.1.1', { email: 'a@ejemplo.com' })
    }

    expect(estaBloqueado(guard, '1.1.1.1', { email: '  A@Ejemplo.COM ' })).toBe(true)
  })

  it('cuenta tambien los intentos sin correo en el cuerpo, que son sondeos', () => {
    const { guard } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      intentar(guard, '1.1.1.1', {})
    }

    expect(estaBloqueado(guard, '1.1.1.1', {})).toBe(true)
  })

  it('limpiarContadores devuelve el estado a cero, que es lo que necesita un test', () => {
    const { guard } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      intentar(guard, '1.1.1.1', { email: 'a@ejemplo.com' })
    }
    expect(estaBloqueado(guard, '1.1.1.1', { email: 'a@ejemplo.com' })).toBe(true)

    guard.limpiarContadores()

    expect(intentar(guard, '1.1.1.1', { email: 'a@ejemplo.com' })).toBe(true)
  })

  it('el bloqueo dice cuantos segundos quedan, para que el formulario pueda avisar', () => {
    const { guard } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      intentar(guard, '1.1.1.1', { email: 'a@ejemplo.com' })
    }

    expect(() => intentar(guard, '1.1.1.1', { email: 'a@ejemplo.com' })).toThrow(/60/)
  })
})
