import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { normalizeEmail } from '../../../domain/validation/normalize-email'

export const IP_DESCONOCIDA = 'desconocida'

export const DEFAULT_LOGIN_LIMIT = 5
export const DEFAULT_LOGIN_WINDOW_MS = 60_000

interface Intento {
  veces: number
  primerIntento: number
  ultimoIntento: number
}

/**
 * Limita los intentos de login por dos vias a la vez, y eso es lo importante:
 *
 * - por **correo**, que es la fuerza bruta contra una cuenta concreta: probar
 *   contraseñas desde IP distintas no sirve de nada.
 * - por **IP**, que es el barrido: probar un correo distinto en cada intento
 *   desde la misma maquina.
 *
 * Un limite solo por IP no frena lo primero, y uno solo por correo no frena lo
 * segundo.
 *
 * Solo cuenta los **intentos fallidos**. Un usuario que entra bien cinco veces
 * seguidas no se bloquea a si mismo, que es el fallo clasico de contar de mas.
 *
 * El contador vive en memoria, asi que el limite es por instancia: con varias
 * instancias detras de un balanceador cada una cuenta por separado. Es una
 * limitacion consciente, no un olvido; cuando haga falta, este contador es el
 * sitio de un almacen compartido.
 */
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly porCorreo = new Map<string, Intento>()
  private readonly porIp = new Map<string, Intento>()

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ ip?: string; body?: unknown }>()
    const email = this.correoDe(request?.body)
    const ip = request?.ip ?? IP_DESCONOCIDA

    if (this.agotaLaVentana(this.porCorreo, email) || this.agotaLaVentana(this.porIp, ip)) {
      throw new HttpException(
        `Demasiados intentos. Vuelve a probar en ${this.segundosDeVentana()} segundos.`,
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    this.contar(this.porCorreo, email)
    this.contar(this.porIp, ip)

    return true
  }

  /**
   * Un acierto no cuenta, y ademas borra lo anterior: quien entra bien cinco
   * veces seguidas no acaba bloqueado por su propio uso legitimo.
   */
  marcarExito(email: string, ip: string): void {
    this.porCorreo.delete(normalizeEmail(email))
    this.porIp.delete(ip)
  }

  /**
   * Vacia los contadores. Sin esto un test de bloqueo envenena los siguientes,
   * porque el contador vive en memoria y el proceso no se reinicia entre tests.
   */
  limpiarContadores(): void {
    this.porCorreo.clear()
    this.porIp.clear()
  }

  private limite(): number {
    return this.config.get<number>('auth.login.maxAttempts') ?? DEFAULT_LOGIN_LIMIT
  }

  private ventanaMs(): number {
    return this.config.get<number>('auth.login.windowMs') ?? DEFAULT_LOGIN_WINDOW_MS
  }

  private correoDe(body: unknown): string {
    if (typeof body !== 'object' || body === null || !('email' in body)) {
      return ''
    }

    return normalizeEmail(String((body as { email: unknown }).email))
  }

  private contar(registro: Map<string, Intento>, clave: string): void {
    const momento = Date.now()
    const actual = registro.get(clave)

    if (actual === undefined) {
      registro.set(clave, { veces: 1, primerIntento: momento, ultimoIntento: momento })
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
