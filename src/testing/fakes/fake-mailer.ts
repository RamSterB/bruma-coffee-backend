import type { MailerPort } from '../../domain/ports/mailer'

export class FakeMailer implements MailerPort {
  readonly enviados: { to: string; subject: string }[] = []

  async sendVerificationCode(to: string, code: string): Promise<void> {
    this.enviados.push({ to, subject: `Codigo: ${code}` })
  }
}
