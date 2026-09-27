import { Customer } from './customer.entity'
import { User } from './user.entity'
import { UserRole } from '../enums/user-role.enum'

const validUser = () => ({
  email: 'persona@ejemplo.com',
  passwordHash: 'hash-de-prueba',
  fullName: 'Persona Registrada',
})

// Vincular o verificar es una transicion sobre un user que ya esta en la base,
// asi que se parte de uno reconstituido con id.
const savedUser = (values: Partial<Parameters<typeof User.reconstitute>[0]> = {}) =>
  User.reconstitute({
    id: '11111111-1111-4111-8111-111111111111',
    email: 'persona@ejemplo.com',
    passwordHash: 'hash-de-prueba',
    fullName: 'Persona Registrada',
    role: UserRole.CUSTOMER,
    customerId: null,
    emailVerifiedAt: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    ...values,
  })

describe('Customer', () => {
  it('normaliza el correo a minúsculas', () => {
    const customer = Customer.create({
      email: '  Ana@Ejemplo.COM ',
      fullName: 'Ana Gómez',
    })

    expect(customer.email).toBe('ana@ejemplo.com')
  })

  it('rechaza un correo sin arroba', () => {
    expect(() => Customer.create({ email: 'anaejemplo.com', fullName: 'Ana Gómez' })).toThrow(
      /correo/i,
    )
  })

  it('rechaza un nombre vacío', () => {
    expect(() => Customer.create({ email: 'ana@ejemplo.com', fullName: '   ' })).toThrow(/nombre/i)
  })
})

describe('User', () => {
  it('nace como CUSTOMER, sin customer y sin verificar', () => {
    const user = User.create(validUser())

    expect(user.role).toBe(UserRole.CUSTOMER)
    expect(user.customerId).toBeNull()
    expect(user.isEmailVerified()).toBe(false)
  })

  it('normaliza el correo', () => {
    expect(User.create({ ...validUser(), email: 'Persona@Ejemplo.com' }).email).toBe(
      'persona@ejemplo.com',
    )
  })

  it('rechaza un hash de contraseña vacío', () => {
    expect(() => User.create({ ...validUser(), passwordHash: '' })).toThrow(/contraseña/i)
  })

  describe('linkToCustomer', () => {
    it('asocia el customer conservando el resto de datos', () => {
      const user = savedUser()

      const linked = user.linkToCustomer('11111111-1111-4111-8111-111111111111')

      expect(linked.customerId).toBe('11111111-1111-4111-8111-111111111111')
      expect(linked.email).toBe(user.email)
      expect(linked.passwordHash).toBe(user.passwordHash)
      expect(linked.role).toBe(user.role)
    })

    it('no muta el usuario original', () => {
      const user = savedUser()

      user.linkToCustomer('11111111-1111-4111-8111-111111111111')

      expect(user.customerId).toBeNull()
    })
  })

  describe('verifyEmail', () => {
    it('deja el correo verificado con la fecha recibida', () => {
      const user = savedUser()
      const momento = new Date('2026-09-26T12:00:00.000Z')

      const verified = user.verifyEmail(momento)

      expect(verified.isEmailVerified()).toBe(true)
      expect(verified.emailVerifiedAt).toBe(momento)
    })

    it('conserva el customer que ya tenia', () => {
      const linked = savedUser().linkToCustomer('22222222-2222-4222-8222-222222222222')

      expect(linked.verifyEmail(new Date()).customerId).toBe('22222222-2222-4222-8222-222222222222')
    })
  })

  it('isAdmin distingue el role ADMIN', () => {
    expect(savedUser({ role: UserRole.ADMIN }).isAdmin()).toBe(true)
    expect(savedUser().isAdmin()).toBe(false)
  })

  describe('un user sin guardar todavia no tiene id', () => {
    it('no se puede vincular a un customer', () => {
      expect(() => User.create(validUser()).linkToCustomer('2222')).toThrow(/guardado/i)
    })

    it('no se puede verificar el correo', () => {
      expect(() => User.create(validUser()).verifyEmail(new Date())).toThrow(/guardado/i)
    })
  })
})
