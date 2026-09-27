import { DomainError } from '../enums/assert-enum'
import { UserRole } from '../enums/user-role.enum'
import { normalizeEmail } from '../validation/normalize-email'

const MAX_EMAIL_LENGTH = 320
const MAX_FULL_NAME_LENGTH = 160

export interface UserAttributes {
  email: string
  passwordHash: string
  fullName: string
}

export class User {
  private constructor(
    public readonly id: string | null,
    public readonly email: string,
    public readonly passwordHash: string,
    public readonly fullName: string,
    public readonly role: UserRole,
    public readonly customerId: string | null,
    public readonly emailVerifiedAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  static create(attributes: UserAttributes): User {
    User.validate(attributes)
    const now = new Date()

    return new User(
      null,
      normalizeEmail(attributes.email),
      attributes.passwordHash,
      attributes.fullName.trim(),
      UserRole.CUSTOMER,
      null,
      null,
      now,
    )
  }

  static reconstitute(input: {
    id: string
    email: string
    passwordHash: string
    fullName: string
    role: UserRole
    customerId: string | null
    emailVerifiedAt: Date | null
    createdAt: Date
  }): User {
    return new User(
      input.id,
      input.email,
      input.passwordHash,
      input.fullName,
      input.role,
      input.customerId,
      input.emailVerifiedAt,
      input.createdAt,
    )
  }

  // El vinculo con el customer se cierra al verificar el correo, no al registrarse:
  // hasta entonces no hay prueba de que quien se registro sea quien dice ser.
  linkToCustomer(customerId: string): User {
    return User.reconstitute({
      id: this.requireId(),
      email: this.email,
      passwordHash: this.passwordHash,
      fullName: this.fullName,
      role: this.role,
      customerId,
      emailVerifiedAt: this.emailVerifiedAt,
      createdAt: this.createdAt,
    })
  }

  verifyEmail(at: Date): User {
    return User.reconstitute({
      id: this.requireId(),
      email: this.email,
      passwordHash: this.passwordHash,
      fullName: this.fullName,
      role: this.role,
      customerId: this.customerId,
      emailVerifiedAt: at,
      createdAt: this.createdAt,
    })
  }

  isEmailVerified(): boolean {
    return this.emailVerifiedAt !== null
  }

  isAdmin(): boolean {
    return this.role === UserRole.ADMIN
  }

  // Vincular o verificar a un user que no tiene id no tiene sentido: ese user
  // todavia no existe en la base.
  private requireId(): string {
    if (this.id === null) {
      throw new DomainError('El usuario todavía no ha sido guardado')
    }

    return this.id
  }

  private static validate(attributes: UserAttributes): void {
    const email = normalizeEmail(attributes.email)

    if (email === '' || !email.includes('@')) {
      throw new DomainError('El correo es obligatorio y debe tener formato de correo')
    }

    if (email.length > MAX_EMAIL_LENGTH) {
      throw new DomainError(`El correo no puede superar ${MAX_EMAIL_LENGTH} caracteres`)
    }

    if (attributes.passwordHash === '') {
      throw new DomainError('La contraseña es obligatoria')
    }

    if (attributes.fullName.trim() === '') {
      throw new DomainError('El nombre es obligatorio')
    }

    if (attributes.fullName.trim().length > MAX_FULL_NAME_LENGTH) {
      throw new DomainError(`El nombre no puede superar ${MAX_FULL_NAME_LENGTH} caracteres`)
    }
  }
}
