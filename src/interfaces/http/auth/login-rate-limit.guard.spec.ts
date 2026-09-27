import { jest } from '@jest/globals'
import { HttpStatus } from '@nestjs/common'
import { authConfig, type AuthConfig } from '../../../config/auth.config'
import { LoginRateLimiter } from './login-rate-limit.guard'

const LIMITE = 5

/**
 * El limitador recibe la configuración ya resuelta, no el ConfigService: por eso
 * aqui se construye con authConfig y no con un doble de rutas con puntos, que es
 * justo lo que hacia pasar la configuracion en silencio.
 */
const configDe = (login: { maxAttempts: number; windowMs: number }): AuthConfig => {
  const anterior = { ...process.env }
  process.env.LOGIN_MAX_ATTEMPTS = String(login.maxAttempts)
  process.env.LOGIN_WINDOW_MS = String(login.windowMs)
  const config = authConfig({ get: () => undefined } as never)
  process.env = anterior

  return config
}

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

const montar = (
  login: { maxAttempts: number; windowMs: number } = { maxAttempts: LIMITE, windowMs: 60_000 },
) => {
  const reloj = congelarReloj()
  const limiter = new LoginRateLimiter(configDe(login))

  return { limiter, reloj }
}

const correo = 'a@ejemplo.com'

const estaBloqueado = (limiter: LoginRateLimiter, email: string, ip: string): boolean => {
  try {
    limiter.registra(email, ip)

    return false
  } catch (error) {
    return (error as { status?: number }).status === HttpStatus.TOO_MANY_REQUESTS
  }
}

describe('LoginRateLimiter', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('deja pasar los primeros cinco intentos', () => {
    const { limiter } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      expect(estaBloqueado(limiter, correo, '1.1.1.1')).toBe(false)
    }
  })

  it('bloquea el sexto intento', () => {
    const { limiter } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      limiter.registra(correo, '1.1.1.1')
    }

    expect(estaBloqueado(limiter, correo, '1.1.1.1')).toBe(true)
  })

  it('bloquea por correo aunque venga de otra IP, que es la fuerza bruta contra una cuenta', () => {
    const { limiter } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      limiter.registra(correo, `1.1.1.${intento}`)
    }

    expect(estaBloqueado(limiter, correo, '9.9.9.9')).toBe(true)
  })

  it('bloquea por IP aunque cambie el correo en cada intento, que es el barrido de cuentas', () => {
    const { limiter } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      limiter.registra(`cuenta${intento}@ejemplo.com`, '5.5.5.5')
    }

    expect(estaBloqueado(limiter, 'otra@ejemplo.com', '5.5.5.5')).toBe(true)
  })

  it('deja pasar a otra cuenta desde otra IP mientras la primera no se bloquea', () => {
    const { limiter } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      limiter.registra(correo, '1.1.1.1')
    }

    expect(estaBloqueado(limiter, 'b@ejemplo.com', '2.2.2.2')).toBe(false)
  })

  it('vuelve a dejar pasar cuando pasa la ventana de tiempo', () => {
    const { limiter, reloj } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      limiter.registra(correo, '1.1.1.1')
    }
    expect(estaBloqueado(limiter, correo, '1.1.1.1')).toBe(true)

    reloj.avanzar(60_001)

    expect(estaBloqueado(limiter, correo, '1.1.1.1')).toBe(false)
  })

  it('limpiar tras un acierto deja entrar otra vez, que es el caso de quien entra bien muchas veces', () => {
    const { limiter } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      limiter.registra(correo, '1.1.1.1')
    }
    limiter.limpiar(correo, '1.1.1.1')

    expect(estaBloqueado(limiter, correo, '1.1.1.1')).toBe(false)
  })

  it('limpiar borra también el historial de la IP, no solo el del correo', () => {
    const { limiter } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      limiter.registra(`cuenta${intento}@ejemplo.com`, '5.5.5.5')
    }
    limiter.limpiar('cuenta0@ejemplo.com', '5.5.5.5')

    expect(estaBloqueado(limiter, 'otra@ejemplo.com', '5.5.5.5')).toBe(false)
  })

  it('no cuenta los intentos correctos, porque si no un usuario legítimo se bloquea a sí mismo', () => {
    const { limiter } = montar()

    for (let intento = 0; intento < 20; intento += 1) {
      limiter.registra(correo, '1.1.1.1')
      limiter.limpiar(correo, '1.1.1.1')
    }

    expect(estaBloqueado(limiter, correo, '1.1.1.1')).toBe(false)
  })

  it('normaliza el correo, para que no se evada el límite cambiando mayúsculas', () => {
    const { limiter } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      limiter.registra(correo, '1.1.1.1')
    }

    expect(estaBloqueado(limiter, '  A@Ejemplo.COM ', '1.1.1.1')).toBe(true)
  })

  it('cuenta también los intentos sin correo, que son sondeos', () => {
    const { limiter } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      limiter.registra('', '1.1.1.1')
    }

    expect(estaBloqueado(limiter, '', '1.1.1.1')).toBe(true)
  })

  it('el bloqueo dice cuántos segundos quedan, para que el formulario pueda avisar', () => {
    const { limiter } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      limiter.registra(correo, '1.1.1.1')
    }

    expect(() => limiter.registra(correo, '1.1.1.1')).toThrow(/60/)
  })

  it('respeta el límite que venga de la configuración', () => {
    const { limiter } = montar({ maxAttempts: 2, windowMs: 60_000 })

    limiter.registra(correo, '1.1.1.1')
    limiter.registra(correo, '1.1.1.1')

    expect(estaBloqueado(limiter, correo, '1.1.1.1')).toBe(true)
  })

  it('limpiarContadores devuelve el estado a cero, que es lo que necesita un test', () => {
    const { limiter } = montar()

    for (let intento = 0; intento < LIMITE; intento += 1) {
      limiter.registra(correo, '1.1.1.1')
    }
    expect(estaBloqueado(limiter, correo, '1.1.1.1')).toBe(true)

    limiter.limpiarContadores()

    expect(estaBloqueado(limiter, correo, '1.1.1.1')).toBe(false)
  })
})
