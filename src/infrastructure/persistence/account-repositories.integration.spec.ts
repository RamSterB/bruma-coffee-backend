import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { resetTestDatabase } from '../../testing/test-database'
import { UserRole } from '../../domain/enums/user-role.enum'
import { UserTypeOrmRepository } from './user.typeorm.repository'
import { CustomerTypeOrmRepository } from './customer.typeorm.repository'
import { RefreshTokenTypeOrmRepository } from './refresh-token.typeorm.repository'
import { CustomerTypeOrmEntity } from './customer.typeorm.entity'
import { UserTypeOrmEntity } from './user.typeorm.entity'
import { Customer } from '../../domain/entities/customer.entity'
import { User } from '../../domain/entities/user.entity'

describe('repositorios de cuentas contra PostgreSQL', () => {
  let dataSource: DataSource

  const users = () => new UserTypeOrmRepository(dataSource.getRepository(UserTypeOrmEntity))
  const customers = () =>
    new CustomerTypeOrmRepository(dataSource.getRepository(CustomerTypeOrmEntity))
  const tokens = () =>
    new RefreshTokenTypeOrmRepository(dataSource.getRepository(UserTypeOrmEntity))

  beforeAll(async () => {
    dataSource = await resetTestDatabase()
  })

  afterAll(async () => {
    await dataSource.destroy()
  })

  beforeEach(async () => {
    await dataSource.query('TRUNCATE refresh_tokens, users, customers RESTART IDENTITY CASCADE')
  })

  describe('UserTypeOrmRepository', () => {
    it('guarda y lee por correo normalizado, ignorando mayusculas', async () => {
      await users().save(
        User.create({
          email: 'Persona@Ejemplo.COM',
          passwordHash: 'hash-de-prueba',
          fullName: 'Persona Registrada',
        }),
      )

      const encontrado = await users().findByEmail('  persona@ejemplo.com  ')

      expect(encontrado).not.toBeNull()
      expect(encontrado?.email).toBe('persona@ejemplo.com')
    })

    it('devuelve null si el correo no existe', async () => {
      expect(await users().findByEmail('nadie@ejemplo.com')).toBeNull()
    })

    it('lee por id', async () => {
      const guardado = await users().save(
        User.create({
          email: 'persona@ejemplo.com',
          passwordHash: 'hash-de-prueba',
          fullName: 'Persona Registrada',
        }),
      )

      const encontrado = await users().findById(guardado.id as string)

      expect(encontrado?.email).toBe('persona@ejemplo.com')
    })

    it('devuelve null si el id no existe', async () => {
      expect(await users().findById('99999999-9999-4999-8999-999999999999')).toBeNull()
    })

    it('normaliza el correo antes de buscar, con espacios alrededor', async () => {
      await users().save(
        User.create({
          email: 'espacios@ejemplo.com',
          passwordHash: 'hash-de-prueba',
          fullName: 'Con Espacios',
        }),
      )

      expect(await users().findByEmail('\n  ESPACIOS@ejemplo.com  ')).not.toBeNull()
    })

    it('actualiza una cuenta existente en vez de duplicarla', async () => {
      const guardado = await users().save(
        User.create({
          email: 'persona@ejemplo.com',
          passwordHash: 'hash-de-prueba',
          fullName: 'Persona Registrada',
        }),
      )

      await users().save(
        User.reconstitute({
          id: guardado.id as string,
          email: guardado.email,
          passwordHash: 'hash-sustituido',
          fullName: 'Nombre Nuevo',
          role: guardado.role,
          customerId: guardado.customerId,
          emailVerifiedAt: guardado.emailVerifiedAt,
          createdAt: guardado.createdAt,
        }),
      )

      expect(await users().findById(guardado.id as string)).toMatchObject({
        passwordHash: 'hash-sustituido',
        fullName: 'Nombre Nuevo',
      })
      expect(await dataSource.getRepository(UserTypeOrmEntity).count()).toBe(1)
    })
  })

  describe('CustomerTypeOrmRepository', () => {
    it('guarda y lee por correo', async () => {
      await customers().save(Customer.create({ email: 'Ana@Ejemplo.com', fullName: 'Ana Gómez' }))

      expect((await customers().findByEmail('ana@ejemplo.com'))?.fullName).toBe('Ana Gómez')
    })

    it('lee por id', async () => {
      const guardado = await customers().save(
        Customer.create({ email: 'ana@ejemplo.com', fullName: 'Ana Gómez' }),
      )

      const encontrado = await customers().findById(guardado.id as string)

      expect(encontrado?.email).toBe('ana@ejemplo.com')
    })

    it('devuelve null si el correo no existe', async () => {
      expect(await customers().findByEmail('nadie@ejemplo.com')).toBeNull()
    })

    it('devuelve null si el id no existe', async () => {
      expect(await customers().findById('11111111-1111-4111-8111-111111111111')).toBeNull()
    })
  })

  describe('RefreshTokenTypeOrmRepository', () => {
    const guardar = async () => {
      const user = await users().save(
        User.create({
          email: 'persona@ejemplo.com',
          passwordHash: 'hash-de-prueba',
          fullName: 'Persona Registrada',
        }),
      )

      return user
    }

    it('guarda el hash y lo encuentra por el, no por el token', async () => {
      const user = await guardar()

      const guardado = await tokens().save({
        userId: user.id as string,
        tokenHash: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 604800000),
        revokedAt: null,
      })

      expect((await tokens().findByHash('a'.repeat(64)))?.id).toBe(guardado.id)
      expect(await tokens().findByHash('b'.repeat(64))).toBeNull()
    })

    it('revoca un token concreto', async () => {
      const user = await guardar()
      const guardado = await tokens().save({
        userId: user.id as string,
        tokenHash: 'c'.repeat(64),
        expiresAt: new Date(Date.now() + 604800000),
        revokedAt: null,
      })

      await tokens().revoke(guardado.id, new Date())

      expect((await tokens().findByHash('c'.repeat(64)))?.revokedAt).not.toBeNull()
    })

    it('revoca todos los tokens de una cuenta, que es lo del logout en todas las pestanas', async () => {
      const user = await guardar()

      for (const letra of ['d', 'e', 'f']) {
        await tokens().save({
          userId: user.id as string,
          tokenHash: letra.repeat(64),
          expiresAt: new Date(Date.now() + 604800000),
          revokedAt: null,
        })
      }

      await tokens().revokeAllForUser(user.id as string, new Date())

      const [{ total }] = await dataSource.query(
        'SELECT COUNT(*)::int AS total FROM refresh_tokens WHERE revoked_at IS NULL',
      )
      expect(total).toBe(0)
    })

    it('no toca los tokens de otra cuenta', async () => {
      const una = await guardar()
      const otra = await users().save(
        User.create({
          email: 'otra@ejemplo.com',
          passwordHash: 'hash-de-prueba',
          fullName: 'Otra Persona',
        }),
      )
      await tokens().save({
        userId: una.id as string,
        tokenHash: '1'.repeat(64),
        expiresAt: new Date(Date.now() + 604800000),
        revokedAt: null,
      })
      await tokens().save({
        userId: otra.id as string,
        tokenHash: '2'.repeat(64),
        expiresAt: new Date(Date.now() + 604800000),
        revokedAt: null,
      })

      await tokens().revokeAllForUser(una.id as string, new Date())

      expect((await tokens().findByHash('2'.repeat(64)))?.revokedAt).toBeNull()
    })

    it('borra los tokens cuando se borra la cuenta', async () => {
      const user = await guardar()
      await tokens().save({
        userId: user.id as string,
        tokenHash: '3'.repeat(64),
        expiresAt: new Date(Date.now() + 604800000),
        revokedAt: null,
      })

      await dataSource.getRepository(UserTypeOrmEntity).delete({ id: user.id as string })

      const [{ total }] = await dataSource.query(
        'SELECT COUNT(*)::int AS total FROM refresh_tokens',
      )
      expect(total).toBe(0)
    })
  })

  it('lee un admin con su role, que es lo que necesita el guard', async () => {
    const customer = await customers().save(
      Customer.create({ email: 'admin@ejemplo.com', fullName: 'Administracion' }),
    )
    const admin = await users().save(
      User.create({
        email: 'admin@ejemplo.com',
        passwordHash: 'hash-de-prueba',
        fullName: 'Administracion',
      }),
    )

    // El role lo concede la semilla por SQL, no por el dominio: User.create siempre
    // nace en CUSTOMER y no hay ninguna via de codigo que eleve a alguien.
    await dataSource.query(
      `UPDATE users SET role = $1, customer_id = $2, email_verified_at = now() WHERE id = $3`,
      [UserRole.ADMIN, customer.id, admin.id],
    )

    const leido = await users().findByEmail('admin@ejemplo.com')

    expect(leido?.role).toBe(UserRole.ADMIN)
    expect(leido?.isAdmin()).toBe(true)
    expect(leido?.isEmailVerified()).toBe(true)
  })
})
