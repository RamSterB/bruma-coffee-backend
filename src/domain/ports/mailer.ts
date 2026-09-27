export abstract class MailerPort {
  abstract sendVerificationCode(to: string, code: string): Promise<void>
}
