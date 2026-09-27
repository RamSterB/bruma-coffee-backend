import { Injectable } from '@nestjs/common'
import { AppError } from '../../domain/errors/app-error'
import {
  emailInvalidError,
  MIN_PASSWORD_LENGTH,
  passwordTooWeakError,
} from '../../domain/errors/auth.errors'
import { User } from '../../domain/entities/user.entity'
import { MailerPort } from '../../domain/ports/mailer'
import { PasswordHasherPort } from '../../domain/ports/password-hasher'
import { UserRepositoryPort } from '../../domain/ports/user.repository'
import { err, ok, type Result } from '../../domain/result'
import { normalizeEmail } from '../../domain/validation/normalize-email'

export interface RegisterInput {
  email: string
  password: string
  fullName: string
}

export interface RegisterOutput {
  status: 'pending_verification'
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * El registro devuelve SIEMPRE lo mismo, exista o no el correo. Un
 * "ese correo ya esta registrado" confirma que correos existen y ademas impide
 * registrarse con el, que es un ataque de bloqueo de cuenta.
 *
 * Por eso este caso de uso no devuelve token ni cookie: hasta verificar el
 * correo, la cuenta no es de nadie. Y por eso una cuenta ya
 * verificada no se toca: solo se ignora.
 */
@Injectable()
export class RegisterUseCase {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly mailer: MailerPort,
  ) {}

  async execute(input: RegisterInput): Promise<Result<RegisterOutput, AppError>> {
    const email = normalizeEmail(input.email)

    if (!EMAIL_PATTERN.test(email)) {
      return err(emailInvalidError())
    }

    if (input.password.length < MIN_PASSWORD_LENGTH) {
      return err(passwordTooWeakError())
    }

    const existente = await this.users.findByEmail(email)

    if (existente === null) {
      await this.users.save(
        User.create({
          email,
          passwordHash: await this.passwordHasher.hash(input.password),
          fullName: input.fullName,
        }),
      )
    } else if (!existente.isEmailVerified()) {
      await this.users.save(
        User.reconstitute({
          id: existente.id as string,
          email: existente.email,
          passwordHash: await this.passwordHasher.hash(input.password),
          fullName: input.fullName,
          role: existente.role,
          customerId: existente.customerId,
          emailVerifiedAt: existente.emailVerifiedAt,
          createdAt: existente.createdAt,
        }),
      )
    }

    // El codigo se envia tambien cuando la cuenta ya estaba verificada: si no, el
    // tiempo de respuesta y el envio de correo distinguirian los dos casos.
    await this.mailer.sendVerificationCode(email, 'codigo-de-verificacion')

    return ok({ status: 'pending_verification' })
  }
}
