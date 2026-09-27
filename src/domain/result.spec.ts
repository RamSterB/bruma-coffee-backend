import { jest } from '@jest/globals'
import { AppError } from './errors/app-error'
import { andThen, err, map, ok, type Result } from './result'

describe('Result', () => {
  it('ok envuelve un valor', () => {
    const resultado: Result<number> = ok(3)

    expect(resultado).toEqual({ ok: true, value: 3 })
  })

  it('err envuelve un error', () => {
    const error = new AppError('fallo', 'CODE', 400)
    const resultado: Result<number> = err(error)

    expect(resultado).toEqual({ ok: false, error })
  })
})

describe('map', () => {
  it('transforma el valor de un resultado correcto', () => {
    expect(map(ok<number>(2), (n) => n * 3)).toEqual({ ok: true, value: 6 })
  })

  it('deja intacto un resultado con error, sin llamar a la función', () => {
    const error = new AppError('fallo', 'CODE', 400)
    const fn = jest.fn<(value: number) => Result<number, AppError>>()

    expect(map(err<number, AppError>(error), fn)).toEqual({ ok: false, error })
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('andThen', () => {
  it('encadena sobre un resultado correcto', () => {
    expect(andThen(ok<number>(2), (n) => ok(n + 1))).toEqual({ ok: true, value: 3 })
  })

  it('corta la cadena si un paso falla, sin ejecutar el siguiente', () => {
    const error = new AppError('fallo', 'CODE', 400)
    const fn = jest.fn<(value: number) => Result<number, AppError>>()

    expect(andThen(err<number, AppError>(error), fn)).toEqual({ ok: false, error })
    expect(fn).not.toHaveBeenCalled()
  })
})
