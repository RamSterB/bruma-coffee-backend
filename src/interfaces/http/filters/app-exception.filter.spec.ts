import { HttpStatus } from '@nestjs/common'
import { AppError } from '../../../domain/errors/app-error'
import { AppExceptionFilter } from './app-exception.filter'

const ejecutar = (error: AppError) => {
  const estado = { statusCode: 0, cuerpo: null as unknown }
  const res = {
    status: (codigo: number) => {
      estado.statusCode = codigo
      return res
    },
    json: (cuerpo: unknown) => {
      estado.cuerpo = cuerpo
      return cuerpo
    },
  }

  new AppExceptionFilter().catch(error, {
    switchToHttp: () => ({ getResponse: () => res }),
  } as never)

  return estado
}

describe('AppExceptionFilter', () => {
  it('usa el status que trae el error de negocio', () => {
    expect(ejecutar(new AppError('No existe', 'USER_NOT_FOUND', 404)).statusCode).toBe(404)
  })

  it('responde 401 con credenciales incorrectas', () => {
    const estado = ejecutar(
      new AppError('Las credenciales no coinciden', 'INVALID_CREDENTIALS', 401),
    )

    expect(estado.statusCode).toBe(HttpStatus.UNAUTHORIZED)
  })

  it('devuelve el mensaje, que es lo que se lee en el formulario', () => {
    const estado = ejecutar(
      new AppError('Las credenciales no coinciden', 'INVALID_CREDENTIALS', 401),
    )

    expect(estado.cuerpo).toMatchObject({ message: 'Las credenciales no coinciden' })
  })

  it('devuelve tambien el codigo, para que el frontend no tenga que leer el mensaje', () => {
    const estado = ejecutar(new AppError('La sesión no es válida', 'SESSION_EXPIRED', 401))

    expect(estado.cuerpo).toMatchObject({ code: 'SESSION_EXPIRED', statusCode: 401 })
  })

  it('nunca devuelve 500 por un error de negocio previsto', () => {
    const estados = [400, 401, 403, 409, 422].map(
      (status) => ejecutar(new AppError('x', 'X', status)).statusCode,
    )

    expect(estados).not.toContain(500)
  })

  it('acepta un status que no sea de negocio y lo deja pasar, sin adivinar', () => {
    expect(ejecutar(new AppError('raro', 'RARO', 418)).statusCode).toBe(418)
  })
})
