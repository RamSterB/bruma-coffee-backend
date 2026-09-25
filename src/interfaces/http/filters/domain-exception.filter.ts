import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common'
import { CoffeeNotFoundError } from '../../../domain/errors/coffee-not-found.error'
import { DomainError } from '../../../domain/enums/assert-enum'

interface HttpResponse {
  status(code: number): HttpResponse
  json(body: unknown): unknown
}

type HttpErrorBody = { statusCode: number; message: string }

const statusFor = (error: DomainError): number =>
  error instanceof CoffeeNotFoundError ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST

/**
 * El dominio no depende de HTTP: lanza DomainError y este filtro traduce a la
 * respuesta. Evita exponer como 500 los errores de validación del catálogo.
 */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>()

    const body: HttpErrorBody = {
      statusCode: statusFor(error),
      message: error.message,
    }

    response.status(body.statusCode).json(body)
  }
}
