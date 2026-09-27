import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { timingSafeEqual } from 'crypto'
import { CSRF_COOKIE, REFRESH_COOKIE } from './auth-cookie'

const CSRF_HEADER = 'x-csrf-token'
const metodosSinEfecto = new Set(['GET', 'HEAD', 'OPTIONS'])

const igualesEnTiempoConstante = (a: string, b: string): boolean => {
  const izquierda = Buffer.from(a)
  const derecha = Buffer.from(b)

  if (izquierda.length !== derecha.length) {
    return false
  }

  return timingSafeEqual(izquierda, derecha)
}

/**
 * CSRF por doble envio: el token viaja en una cookie que JavaScript puede leer y
 * el frontend lo copia a una cabecera. Un formulario de otra pagina puede hacer
 * que el navegador envie la cookie, pero no puede leerla para ponerla en la
 * cabecera.
 *
 * Solo se exige cuando hay cookie de refresh, porque es la unica peticion cuyo
 * efecto es el mismo para el atacante y para la persona: la de quien no aporta
 * el token de CSRF y por tanto es la de login y registro.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      cookies?: Record<string, unknown>
      headers?: Record<string, string | undefined>
      method?: string
    }>()

    const metodo = request?.method?.toUpperCase() ?? 'GET'

    if (metodosSinEfecto.has(metodo)) {
      return true
    }

    if (typeof request?.cookies?.[REFRESH_COOKIE] !== 'string') {
      return true
    }

    const deLaCookie = request.cookies[CSRF_COOKIE]
    const deLaCabecera = request.headers?.[CSRF_HEADER]

    if (typeof deLaCookie !== 'string' || deLaCookie === '' || typeof deLaCabecera !== 'string') {
      throw new ForbiddenException('Falta el token CSRF')
    }

    if (!igualesEnTiempoConstante(deLaCookie, deLaCabecera)) {
      throw new ForbiddenException('El token CSRF no coincide')
    }

    return true
  }
}
