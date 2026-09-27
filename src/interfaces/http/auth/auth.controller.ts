import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { randomBytes } from 'crypto'
import type { Request, Response } from 'express'
import { GetProfileUseCase } from '../../../application/use-cases/get-profile.use-case'
import { LoginUseCase } from '../../../application/use-cases/login.use-case'
import { LogoutUseCase } from '../../../application/use-cases/logout.use-case'
import { RefreshSessionUseCase } from '../../../application/use-cases/refresh-session.use-case'
import { RegisterUseCase } from '../../../application/use-cases/register.use-case'
import { authConfig } from '../../../config/auth.config'
import type { AppError } from '../../../domain/errors/app-error'
import type { Result } from '../../../domain/result'
import { JwtAuthGuard, type SessionInfo } from './auth.guards'
import { CsrfGuard } from './csrf.guard'
import { LoginRateLimitGuard } from './login-rate-limit.guard'
import { REFRESH_COOKIE, clearAuthCookies, readRefreshCookie, setAuthCookies } from './auth-cookie'
import {
  LoginDto,
  LogoutResponseDto,
  RegisterDto,
  RegisterResponseDto,
  SessionDto,
  SessionUserDto,
} from './dto/auth.dto'

const IP_DESCONOCIDA = 'desconocida'

type SesionEmitida = {
  accessToken: string
  accessTokenExpiresIn: number
  refreshToken: string
  user: SessionUserDto
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshSessionUseCase: RefreshSessionUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly getProfileUseCase: GetProfileUseCase,
    private readonly config: ConfigService,
    private readonly loginRateLimit: LoginRateLimitGuard,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear una cuenta',
    description:
      'Registra una cuenta y pide el envío de un correo de verificación. La respuesta es siempre la misma exista o no el correo, para no revelar qué correos están dados de alta, y por eso no devuelve ninguna sesión: hay que entrar con login.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ type: RegisterResponseDto })
  @ApiBadRequestResponse({ description: 'El correo, la contraseña o el nombre no son válidos' })
  async register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    const resultado = await this.registerUseCase.execute({
      email: dto.email,
      password: dto.password,
      fullName: dto.fullName,
    })

    this.desdoblar(resultado)

    // El mensaje es fijo a proposito: si distinguiera "cuenta creada" de "ya
    // existia", bastaria un intento para enumerar los correos dados de alta.
    return {
      message:
        'Si ese correo puede registrarse, recibiras un mensaje con el enlace de verificacion',
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LoginRateLimitGuard)
  @ApiOperation({
    summary: 'Iniciar sesión',
    description:
      'Devuelve el token de acceso en el cuerpo, para que el navegador lo guarde en memoria, y pone el de refresh en una cookie httpOnly que el navegador no puede leer. El limite de intentos se cuenta por correo y por IP, y se borra en cuanto el login es correcto.',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: SessionDto })
  @ApiBadRequestResponse({ description: 'El correo o la contraseña no tienen un formato válido' })
  @ApiUnauthorizedResponse({ description: 'Credenciales incorrectas' })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description:
      'Demasiados intentos. Se cuentan por correo y por IP, y el contador se reinicia solo al pasar el tiempo.',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    const resultado = await this.loginUseCase.execute({
      email: dto.email,
      password: dto.password,
    })
    const sesion = this.desdoblar(resultado)
    const respuesta = this.ponerCookiesDeSesion(res, sesion)

    // Un acierto borra el historial de esa cuenta: si no, alguien que entra bien
    // cinco veces seguidas acabaria bloqueado por su propio uso legitimo.
    this.loginRateLimit.marcarExito(dto.email, req.ip ?? IP_DESCONOCIDA)

    return respuesta
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary: 'Renovar la sesión',
    description:
      'Rota el token de refresh: revoca el que llega en la cookie httpOnly y devuelve otro, también en cookie. El token de acceso sale en el cuerpo. Exige la cabecera x-csrf-token con el valor de la cookie csrf_token.',
  })
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOkResponse({ type: SessionDto })
  @ApiForbiddenResponse({ description: 'Falta el token CSRF o no coincide con la cookie' })
  @ApiUnauthorizedResponse({ description: 'El refresh está caducado, revocado o no existe' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    const refreshToken = readRefreshCookie(req.cookies)

    if (refreshToken === null) {
      clearAuthCookies(res, this.secureCookies())
      throw new UnauthorizedException('Sesion no valida')
    }

    const resultado = await this.refreshSessionUseCase.execute(refreshToken)

    if (!resultado.ok) {
      // Las cookies se borran igual: si el refresh ya no vale, dejarlo puesto
      // hace que el navegador repita el fallo en cada peticion siguiente.
      clearAuthCookies(res, this.secureCookies())
      throw new UnauthorizedException(resultado.error.message)
    }

    return this.ponerCookiesDeSesion(res, resultado.value)
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary: 'Cerrar sesión',
    description:
      'Revoca el token de refresh en el servidor y borra las dos cookies. Sin revocar, cerrar sesión solo caducaría el token de acceso en quince minutos y el refresh seguiría valiendo siete días.',
  })
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOkResponse({ type: LogoutResponseDto })
  @ApiForbiddenResponse({ description: 'Falta el token CSRF o no coincide con la cookie' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LogoutResponseDto> {
    const refreshToken = readRefreshCookie(req.cookies)

    if (refreshToken !== null) {
      await this.logoutUseCase.execute(refreshToken)
    }

    clearAuthCookies(res, this.secureCookies())

    return { message: 'Sesion cerrada' }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Consultar el perfil de la sesión',
    description:
      'Devuelve los datos de la cuenta del token de acceso, que va en la cabecera Authorization. Nunca el hash de la contraseña.',
  })
  @ApiOkResponse({ type: SessionUserDto })
  @ApiUnauthorizedResponse({ description: 'Falta el token, o está caducado' })
  async me(@Req() req: Request & { auth: SessionInfo }): Promise<SessionUserDto> {
    const resultado = await this.getProfileUseCase.execute(req.auth.userId)

    const perfil = this.desdoblar(resultado)

    return {
      id: perfil.id,
      email: perfil.email,
      fullName: perfil.fullName,
      role: perfil.role,
      isEmailVerified: perfil.isEmailVerified,
    }
  }

  private ponerCookiesDeSesion(res: Response, sesion: SesionEmitida): SessionDto {
    const { refreshTtlSeconds } = authConfig(this.config)
    const csrfToken = randomBytes(32).toString('base64url')

    setAuthCookies(
      res,
      sesion.refreshToken,
      csrfToken,
      refreshTtlSeconds * 1000,
      this.secureCookies(),
    )

    return {
      accessToken: sesion.accessToken,
      accessTokenExpiresIn: sesion.accessTokenExpiresIn,
      csrfToken,
      user: sesion.user,
    }
  }

  private secureCookies(): boolean {
    return authConfig(this.config).secureCookies
  }

  /**
   * El dominio no lanza errores de negocio, los devuelve. En el borde HTTP se
   * deshace el Result y se lanza el AppError, que AppExceptionFilter traduce a la
   * respuesta. Es el unico punto donde se rompe la cadena de resultados.
   */
  private desdoblar<T>(resultado: Result<T, AppError>): T {
    if (!resultado.ok) {
      throw resultado.error
    }

    return resultado.value
  }
}
