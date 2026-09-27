import { CustomerTypeOrmEntity } from './customer.typeorm.entity'
import { RefreshTokenTypeOrmEntity } from './refresh-token.typeorm.entity'
import { UserTypeOrmEntity } from './user.typeorm.entity'
import { Customer } from '../../domain/entities/customer.entity'
import { User } from '../../domain/entities/user.entity'
import { UserRole } from '../../domain/enums/user-role.enum'

const unaFecha = new Date('2026-09-26T10:00:00.000Z')

const customerGuardado = (): CustomerTypeOrmEntity => {
  const entity = new CustomerTypeOrmEntity()

  entity.id = '11111111-1111-4111-8111-111111111111'
  entity.email = 'ana@ejemplo.com'
  entity.fullName = 'Ana Gómez'
  entity.createdAt = unaFecha

  return entity
}

const userGuardado = (): UserTypeOrmEntity => {
  const entity = new UserTypeOrmEntity()

  entity.id = '22222222-2222-4222-8222-222222222222'
  entity.email = 'persona@ejemplo.com'
  entity.passwordHash = 'hash-de-prueba'
  entity.fullName = 'Persona Registrada'
  entity.role = UserRole.CUSTOMER
  entity.customerId = null
  entity.emailVerifiedAt = null
  entity.createdAt = unaFecha

  return entity
}

describe('CustomerTypeOrmEntity', () => {
  it('toDomain devuelve la entidad de dominio con el correo ya normalizado', () => {
    const entity = customerGuardado()
    entity.email = 'Ana@Ejemplo.COM'

    const customer = entity.toDomain()

    expect(customer).toBeInstanceOf(Customer)
    expect(customer.id).toBe(entity.id)
    expect(customer.email).toBe('ana@ejemplo.com')
    expect(customer.fullName).toBe('Ana Gómez')
    expect(customer.createdAt).toBe(unaFecha)
  })

  it('fromDomain normaliza el correo al escribir en la base', () => {
    const customer = Customer.create({ email: '  Ana@Ejemplo.COM ', fullName: 'Ana Gómez' })

    const entity = CustomerTypeOrmEntity.fromDomain(customer)

    expect(entity.email).toBe('ana@ejemplo.com')
    expect(entity.fullName).toBe('Ana Gómez')
    expect(entity.createdAt).toEqual(customer.createdAt)
  })

  it('fromDomain deja el id vacio cuando el customer es nuevo, para que lo genere la base', () => {
    const nuevo = Customer.create({ email: 'ana@ejemplo.com', fullName: 'Ana Gómez' })

    expect(nuevo.id).toBeNull()
    expect(CustomerTypeOrmEntity.fromDomain(nuevo).id).toBeUndefined()
  })

  it('fromDomain copia el id cuando el customer ya estaba guardado', () => {
    const guardado = Customer.reconstitute({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'ana@ejemplo.com',
      fullName: 'Ana Gómez',
      createdAt: unaFecha,
    })

    expect(CustomerTypeOrmEntity.fromDomain(guardado).id).toBe(
      '11111111-1111-4111-8111-111111111111',
    )
  })
})

describe('UserTypeOrmEntity', () => {
  it('toDomain conserva el customer sin vincular y el correo sin verificar', () => {
    const user = userGuardado().toDomain()

    expect(user).toBeInstanceOf(User)
    expect(user.id).toBe('22222222-2222-4222-8222-222222222222')
    expect(user.passwordHash).toBe('hash-de-prueba')
    expect(user.role).toBe(UserRole.CUSTOMER)
    expect(user.customerId).toBeNull()
    expect(user.emailVerifiedAt).toBeNull()
  })

  it('toDomain lee un admin con customer y correo verificado', () => {
    const entity = userGuardado()
    entity.role = UserRole.ADMIN
    entity.customerId = '11111111-1111-4111-8111-111111111111'
    entity.emailVerifiedAt = unaFecha

    const user = entity.toDomain()

    expect(user.isAdmin()).toBe(true)
    expect(user.isEmailVerified()).toBe(true)
    expect(user.customerId).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('fromDomain normaliza el correo y baja el role de un admin', () => {
    const admin = User.reconstitute({
      id: '22222222-2222-4222-8222-222222222222',
      email: 'Admin@Ejemplo.COM',
      passwordHash: 'hash-de-prueba',
      fullName: 'Administración',
      role: UserRole.ADMIN,
      customerId: '11111111-1111-4111-8111-111111111111',
      emailVerifiedAt: unaFecha,
      createdAt: unaFecha,
    })

    const entity = UserTypeOrmEntity.fromDomain(admin)

    expect(entity.email).toBe('admin@ejemplo.com')
    expect(entity.role).toBe(UserRole.ADMIN)
    expect(entity.customerId).toBe('11111111-1111-4111-8111-111111111111')
    expect(entity.emailVerifiedAt).toBe(unaFecha)
  })

  it('fromDomain deja el id vacio cuando el user es nuevo', () => {
    const nuevo = User.create({
      email: 'persona@ejemplo.com',
      passwordHash: 'hash-de-prueba',
      fullName: 'Persona Registrada',
    })

    expect(UserTypeOrmEntity.fromDomain(nuevo).id).toBeUndefined()
  })
})

describe('RefreshTokenTypeOrmEntity', () => {
  const token = (values: Partial<RefreshTokenTypeOrmEntity> = {}): RefreshTokenTypeOrmEntity => {
    const entity = new RefreshTokenTypeOrmEntity()

    entity.id = '33333333-3333-4333-8333-333333333333'
    entity.userId = '22222222-2222-4222-8222-222222222222'
    entity.tokenHash = 'hash-del-refresh'
    entity.expiresAt = new Date('2026-10-03T10:00:00.000Z')
    entity.revokedAt = null
    entity.createdAt = unaFecha

    return Object.assign(entity, values)
  }

  describe('isUsable', () => {
    it('acepta un token vigente y sin revocar', () => {
      expect(token().isUsable(new Date('2026-09-26T11:00:00.000Z'))).toBe(true)
    })

    it('rechaza un token revocado, aunque no haya caducado', () => {
      const revocado = token({ revokedAt: new Date('2026-09-26T10:30:00.000Z') })

      expect(revocado.isUsable(new Date('2026-09-26T11:00:00.000Z'))).toBe(false)
    })

    it('rechaza un token caducado aunque siga sin revocar', () => {
      expect(token().isUsable(new Date('2026-10-04T00:00:00.000Z'))).toBe(false)
    })

    it('rechaza justo en el instante de caducidad', () => {
      expect(token().isUsable(new Date('2026-10-03T10:00:00.000Z'))).toBe(false)
    })
  })
})
