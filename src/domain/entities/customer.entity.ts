import { DomainError } from '../enums/assert-enum'
import { normalizeEmail } from '../validation/normalize-email'

const MAX_EMAIL_LENGTH = 320
const MAX_FULL_NAME_LENGTH = 160

export interface CustomerAttributes {
  email: string
  fullName: string
}

export class Customer {
  private constructor(
    public readonly id: string | null,
    public readonly email: string,
    public readonly fullName: string,
    public readonly createdAt: Date,
  ) {}

  static create(attributes: CustomerAttributes): Customer {
    Customer.validate(attributes)
    const now = new Date()

    return new Customer(null, normalizeEmail(attributes.email), attributes.fullName.trim(), now)
  }

  static reconstitute(input: {
    id: string
    email: string
    fullName: string
    createdAt: Date
  }): Customer {
    return new Customer(input.id, input.email, input.fullName, input.createdAt)
  }

  private static validate(attributes: CustomerAttributes): void {
    const email = normalizeEmail(attributes.email)

    if (email === '' || !email.includes('@')) {
      throw new DomainError('El correo es obligatorio y debe tener formato de correo')
    }

    if (email.length > MAX_EMAIL_LENGTH) {
      throw new DomainError(`El correo no puede superar ${MAX_EMAIL_LENGTH} caracteres`)
    }

    if (attributes.fullName.trim() === '') {
      throw new DomainError('El nombre es obligatorio')
    }

    if (attributes.fullName.trim().length > MAX_FULL_NAME_LENGTH) {
      throw new DomainError(`El nombre no puede superar ${MAX_FULL_NAME_LENGTH} caracteres`)
    }
  }
}
