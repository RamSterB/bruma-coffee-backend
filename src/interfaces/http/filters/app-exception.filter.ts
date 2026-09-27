import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common'
import { AppError } from '../../../domain/errors/app-error'

interface HttpResponse {
  status(code: number): HttpResponse
  json(body: unknown): unknown
}

interface AppErrorBody {
  statusCode: number
  code: string
  message: string
}

/**
 * Los casos de uso devuelven Result<T, AppError> en vez de lanzar. El controlador
 * lanza el AppError que viene en el error del Result, y este filtro lo traduce a
 * la respuesta: asi el status vive en el error de negocio y el controller no
 * tiene que decidir si algo es 400 o 401.
 *
 * Devuelve tambien el codigo estable, para que el frontend reaccione sin tener
 * que comparar mensajes, que se traducen y pueden cambiar.
 */
@Catch(AppError)
export class AppExceptionFilter implements ExceptionFilter {
  catch(error: AppError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>()
    const body: AppErrorBody = {
      statusCode: error.status,
      code: error.code,
      message: error.message,
    }

    response.status(error.status).json(body)
  }
}
