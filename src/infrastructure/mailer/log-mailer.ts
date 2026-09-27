import { Injectable } from '@nestjs/common'
import { MailerPort } from '../../domain/ports/mailer'

/**
 * Sustituto de desarrollo: confirma que el puerto de correo esta cableado sin
 * sacar nada a internet.
 *
 * No acepta el codigo de verificacion porque no lo va a escribir en el log: esa
 * costumbre sobrevive a produccion, y ahi el codigo abre una cuenta ajena.
 */
@Injectable()
export class LogMailer implements MailerPort {
  async sendVerificationCode(email: string): Promise<void> {
    console.info(`[correo] verificacion solicitada para ${email}`)
  }
}
