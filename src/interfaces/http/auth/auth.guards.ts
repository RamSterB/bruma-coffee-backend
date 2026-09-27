import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { UserRole } from '../../../domain/enums/user-role.enum'
import { SessionTokenPort } from '../../../domain/ports/session-token'
import { UserRepositoryPort } from '../../../domain/ports/user.repository'

export interface SessionInfo {
  userId: string
  role: UserRole
}

export interface AuthenticatedRequest {
  headers: Record<string, string | undefined>
  auth?: SessionInfo
}

const esRolValido = (valor: string): valor is UserRole =>
  Object.values<string>(UserRole).includes(valor)

/**
 * El access token va en la cabecera Authorization y no en cookie: es el que
 * viaja en memoria en el navegador, y mandarlo en cookie lo expondría a CSRF sin
 * necesidad.
 *
 * Cuando falla devuelve 401 y nada más. Un 403 con un token caducado sugeriría
 * que el token valía y lo que faltaba era permiso, y no es el caso.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly sessionToken: SessionTokenPort) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest | undefined>()
    const claims = await this.sessionToken.verifyAccessToken(this.readBearer(request))

    if (claims === null || claims.subject === '' || !esRolValido(claims.role)) {
      throw new UnauthorizedException('Sesion no valida o token caducado')
    }

    if (request !== undefined) {
      request.auth = { userId: claims.subject, role: claims.role }
    }

    return true
  }

  private readBearer(request: AuthenticatedRequest | undefined): string {
    const header = request?.headers?.authorization

    if (typeof header !== 'string') {
      return ''
    }

    const [esquema, token] = header.split(' ')

    return esquema?.toLowerCase() === 'bearer' && typeof token === 'string' ? token : ''
  }
}

/**
 * El historial de pedidos exige correo verificado, porque es donde una cuenta sin
 * verificar se apropia del correo de otra persona. La compra directa no pasa por
 * aquí: por eso una cuenta sin verificar sí puede comprar.
 *
 * Consulta la cuenta en vez de fiarse del token: si el token dijera que está
 * verificada, se tardaría hasta quince minutos en verse la verificación.
 */
@Injectable()
export class CustomerGuard implements CanActivate {
  constructor(private readonly users: UserRepositoryPort) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ auth?: SessionInfo } | undefined>()
    const auth = request?.auth

    if (auth === undefined) {
      throw new UnauthorizedException('Sesion no valida')
    }

    if (auth.role === UserRole.ADMIN) {
      return true
    }

    const user = await this.users.findById(auth.userId)

    if (user === null || !user.isEmailVerified()) {
      throw new UnauthorizedException('El correo de la cuenta aun no esta verificado')
    }

    return true
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ auth?: SessionInfo } | undefined>()

    if (request?.auth?.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('Se requiere rol de administrador')
    }

    return true
  }
}
