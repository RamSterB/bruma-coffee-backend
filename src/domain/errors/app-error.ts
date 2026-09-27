/**
 * Error de negocio con su codigo estable y su status HTTP. El codigo existe para
 * que el frontend pueda reaccionar sin leer el mensaje: los mensajes se traducen
 * y pueden cambiar, los codigos no.
 *
 * La jerarquia de DomainError sigue sirviendo para las invariantes del dominio
 * (por ejemplo, un peso de cafe negativo), que son programmer errors y no
 * respuestas de negocio. Esto es lo otro: un fallo que se espera, como unas
 * credenciales que no cuadran.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'AppError'
  }
}
