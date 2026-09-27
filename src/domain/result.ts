import type { AppError } from './errors/app-error'

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })

export const err = <T, E>(error: E): Result<T, E> => ({ ok: false, error })

export const map = <T, U, E>(resultado: Result<T, E>, fn: (value: T) => U): Result<U, E> =>
  resultado.ok ? ok(fn(resultado.value)) : resultado

export const andThen = <T, U, E>(
  resultado: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> => (resultado.ok ? fn(resultado.value) : resultado)
