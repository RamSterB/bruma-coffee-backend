import { AppError } from './app-error'

export const MIN_PASSWORD_LENGTH = 8

/**
 * Un correo con formato invalido se responde como "si ese correo puede registrarse
 * te avisamos" en el endpoint, para no confirmar nada. Aqui, en el dominio, solo
 * se lanza cuando la entrada es tan invalida que la peticion tiene que
 * corregirla: una direccion sin arroba no es un dato que exista.
 */
export const invalidCredentialsError = (): AppError =>
  new AppError('Las credenciales no coinciden con ninguna cuenta', 'INVALID_CREDENTIALS', 401)

export const passwordTooWeakError = (): AppError =>
  new AppError(
    `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
    'PASSWORD_TOO_WEAK',
    400,
  )

export const emailInvalidError = (): AppError =>
  new AppError('El correo no tiene un formato válido', 'EMAIL_INVALID', 400)

export const sessionExpiredError = (): AppError =>
  new AppError('La sesión no es válida o ha caducado', 'SESSION_EXPIRED', 401)
