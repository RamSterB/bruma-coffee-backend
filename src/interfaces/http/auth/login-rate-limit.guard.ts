import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import { normalizeEmail } from '../../../domain/validation/normalize-email'
import { AUTH_CONFIG, type AuthConfig } from '../../../config/auth.config'

export const IP_DESCONOCIDA = 'desconocida'

export const DEFAULT_LOGIN_LIMIT = 5
export const DEFAULT_LOGIN_WINDOW_MS = 60_000

interface Intento {
  veces: number
  ultimoIntento: number
}

/**
 * Cuenta los intentos de login por dos vías a la vez, y eso es lo importante:
 *
 * - por **correo**, que es la fuerza bruta contra una cuenta concreta: probar
 *   contraseñas desde IP distintas no sirve de nada.
 * - por **IP**, que es el barrido: probar un correo distinto en cada intento
 *   desde la misma máquina.
 *
 * Un límite solo por IP no frena lo primero, y uno solo por correo no frena lo
 * segundo.
 *
 * Solo cuenta los **intentos fallidos**. Un usuario que entra bien cinco veces
 * seguidas no se bloquea a sí mismo, que es el fallo clásico de contar de más.
 *
 * El contador vive en memoria, así que el límite es por proceso: con varias
 * instancias detrás de un balanceador cada una cuenta por su lado. Es una
 * limitación consciente, no un olvido; cuando haga falta, este contador es el
 * sitio de un almacén compartido.
 *
 * Vive en esta clase y no en el guard a propósito. Nest crea una instancia del
 * guard por cada controlador que lo usa, además de la que hay en los providers,
 * así que un guard con estado en sus campos tendría dos juegos de contadores:
 * uno bloquea y el otro no, y `marcarExito` limpiaría el que nadie vigila.
 */
@Injectable()
export class LoginRateLimiter {
  private readonly porCorreo = new Map<string, Intento>()
  private readonly porIp = new Map<string, Intento>()

  constructor(@Inject(AUTH_CONFIG) private readonly auth: AuthConfig) {}

  /** Suma un intento y lanza 429 si esa vía ya se pasó. */
  registra(email: string, ip: string): void {
    const correo = normalizeEmail(email)

    if (this.agotaLaVentana(this.porCorreo, correo) || this.agotaLaVentana(this.porIp, ip)) {
      throw new HttpException(
        `Demasiados intentos. Vuelve a probar en ${this.segundosDeVentana()} segundos.`,
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    this.contar(this.porCorreo, correo)
    this.contar(this.porIp, ip)
  }

  /**
   * Un acierto no cuenta, y además borra lo anterior: quien entra bien cinco
   * veces seguidas no acaba bloqueado por su propio uso legítimo.
   */
  limpiar(email: string, ip: string): void {
    this.porCorreo.delete(normalizeEmail(email))
    this.porIp.delete(ip)
  }

  /**
   * Vacía los contadores. Sin esto un test de bloqueo envenena los siguientes,
   * porque el contador vive en memoria y el proceso no se reinicia entre tests.
   */
  limpiarContadores(): void {
    this.porCorreo.clear()
    this.porIp.clear()
  }

  private limite(): number {
    return this.auth.login.maxAttempts
  }

  private ventanaMs(): number {
    return this.auth.login.windowMs
  }

  private contar(registro: Map<string, Intento>, clave: string): void {
    const momento = Date.now()
    const actual = registro.get(clave)

    if (actual === undefined) {
      registro.set(clave, { veces: 1, ultimoIntento: momento })

      return
    }

    actual.veces += 1
    actual.ultimoIntento = momento
  }

  private agotaLaVentana(registro: Map<string, Intento>, clave: string): boolean {
    const actual = registro.get(clave)

    if (actual === undefined) {
      return false
    }

    if (Date.now() - actual.ultimoIntento >= this.ventanaMs()) {
      registro.delete(clave)

      return false
    }

    // >= y no >: con cinco permitidos, el sexto es el que se bloquea.
    return actual.veces >= this.limite()
  }

  private segundosDeVentana(): number {
    return Math.ceil(this.ventanaMs() / 1000)
  }
}
