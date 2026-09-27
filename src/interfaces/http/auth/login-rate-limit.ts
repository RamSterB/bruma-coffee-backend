import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { IP_DESCONOCIDA, LoginRateLimiter } from './login-rate-limit.guard'

/**
 * El guard no lleva estado: solo traduce una petición en un intento sobre el
 * limitador. El estado vive en LoginRateLimiter, que es un provider, para que
 * las dos instancias que Nest crea de este guard compartan el mismo contador.
 */
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: LoginRateLimiter) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ ip?: string; body?: unknown }>()

    this.limiter.registra(this.correoDe(request?.body), request?.ip ?? IP_DESCONOCIDA)

    return true
  }

  private correoDe(body: unknown): string {
    if (typeof body !== 'object' || body === null || !('email' in body)) {
      return ''
    }

    return String((body as { email: unknown }).email)
  }
}
