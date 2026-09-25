import { ArgumentsHost, HttpStatus } from '@nestjs/common'
import { CoffeeNotFoundError } from '../../../domain/errors/coffee-not-found.error'
import { DomainError } from '../../../domain/enums/assert-enum'
import { DomainExceptionFilter } from './domain-exception.filter'

interface HttpResponse {
  status(code: number): HttpResponse
  json(body: unknown): unknown
}

const hostReturning = (response: HttpResponse): ArgumentsHost =>
  ({
    switchToHttp: () => ({ getResponse: () => response }),
  }) as unknown as ArgumentsHost

const buildResponse = () => {
  const state: { status?: number; body?: unknown } = {}
  const response = {
    status: (code: number) => {
      state.status = code
      return response
    },
    json: (body: unknown) => {
      state.body = body
      return response
    },
  } as unknown as HttpResponse

  return { response, state }
}

describe('DomainExceptionFilter', () => {
  it('traduce un error de dominio de validación a 400', () => {
    const { response, state } = buildResponse()

    new DomainExceptionFilter().catch(new DomainError('región inválida'), hostReturning(response))

    expect(state.status).toBe(HttpStatus.BAD_REQUEST)
    expect(state.body).toEqual({ statusCode: 400, message: 'región inválida' })
  })

  it('traduce CoffeeNotFoundError a 404', () => {
    const { response, state } = buildResponse()

    new DomainExceptionFilter().catch(new CoffeeNotFoundError('abc'), hostReturning(response))

    expect(state.status).toBe(HttpStatus.NOT_FOUND)
    expect(state.body).toEqual({
      statusCode: 404,
      message: 'No existe un café con id "abc"',
    })
  })
})
