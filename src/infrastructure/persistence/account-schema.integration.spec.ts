import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { resetTestDatabase } from '../../testing/test-database'
import { CreateAccountTables1759000000000 } from '../../migrations/1759000000000-CreateAccountTables'
import { CreateCartTables1759100000000 } from '../../migrations/1759100000000-CreateCartTables'
import { CreateOrderTables1759300000000 } from '../../migrations/1759300000000-CreateOrderTables'
import { UserRole } from '../../domain/enums/user-role.enum'
import { CustomerTypeOrmEntity } from './customer.typeorm.entity'
import { UserTypeOrmEntity } from './user.typeorm.entity'
import { RefreshTokenTypeOrmEntity } from './refresh-token.typeorm.entity'

/**
 * Las restricciones de las cuentas viven en la migración, no en el código, así que
 * solo se pueden comprobar ejecutándolas. Si una migración se regenera o se edita a mano,
 * esto es lo que se entera.
 */
describe('restricciones del esquema de cuentas', () => {
  let dataSource: DataSource

  const insertCustomer = async (
    values: Partial<CustomerTypeOrmEntity> = {},
  ): Promise<CustomerTypeOrmEntity> => {
    const customers = dataSource.getRepository(CustomerTypeOrmEntity)

    return customers.save(
      customers.create({
        email: 'invitado@ejemplo.com',
        fullName: 'Persona Invitada',
        ...values,
      }),
    )
  }

  const insertUser = async (
    values: Partial<UserTypeOrmEntity> = {},
  ): Promise<UserTypeOrmEntity> => {
    const users = dataSource.getRepository(UserTypeOrmEntity)

    return users.save(
      users.create({
        email: 'persona@ejemplo.com',
        passwordHash: 'hash-de-prueba',
        fullName: 'Persona Registrada',
        role: UserRole.CUSTOMER,
        ...values,
      }),
    )
  }

  beforeAll(async () => {
    dataSource = await resetTestDatabase()
  })

  afterAll(async () => {
    await dataSource.destroy()
  })

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE deliveries, payments, order_items, orders, refresh_tokens, users, customers RESTART IDENTITY CASCADE',
    )
  })

  describe('customers', () => {
    it('acepta dos customers con correos distintos', async () => {
      await insertCustomer({ email: 'uno@ejemplo.com' })
      await insertCustomer({ email: 'dos@ejemplo.com' })

      const total = await dataSource.getRepository(CustomerTypeOrmEntity).count()

      expect(total).toBe(2)
    })

    it('rechaza dos customers con el mismo correo', async () => {
      await insertCustomer({ email: 'mismo@ejemplo.com' })

      await expect(insertCustomer({ email: 'mismo@ejemplo.com' })).rejects.toThrow()
    })

    it('trata el correo como case-insensitive', async () => {
      await insertCustomer({ email: 'Persona@Ejemplo.com' })

      await expect(insertCustomer({ email: 'persona@ejemplo.com' })).rejects.toThrow()
    })
  })

  describe('users', () => {
    it('rechaza un role inventado', async () => {
      await expect(insertUser({ role: 'SUPERUSER' as UserRole })).rejects.toThrow()
    })

    it('acepta CUSTOMER y ADMIN', async () => {
      const customer = await insertUser({ role: UserRole.CUSTOMER })
      const admin = await insertUser({
        role: UserRole.ADMIN,
        email: 'admin@ejemplo.com',
      })

      expect(customer.role).toBe(UserRole.CUSTOMER)
      expect(admin.role).toBe(UserRole.ADMIN)
    })

    it('nace sin customer_id, porque la vinculación hay que verificarla', async () => {
      const user = await insertUser()

      expect(user.customerId).toBeNull()
    })

    it('no deja que dos users apunten al mismo customer', async () => {
      const customer = await insertCustomer()
      await insertUser({ customerId: customer.id })

      await expect(
        insertUser({ customerId: customer.id, email: 'otro@ejemplo.com' }),
      ).rejects.toThrow()
    })

    it('exige que el customer exista al referenciarlo', async () => {
      await expect(
        insertUser({ customerId: '11111111-1111-4111-8111-111111111111' }),
      ).rejects.toThrow()
    })
  })

  describe('refresh_tokens', () => {
    it('rechaza dos tokens con el mismo hash', async () => {
      const user = await insertUser()
      const tokens = dataSource.getRepository(RefreshTokenTypeOrmEntity)
      const values = {
        userId: user.id,
        tokenHash: 'hash-repetido',
        expiresAt: new Date(Date.now() + 60_000),
      }

      await tokens.save(tokens.create(values))

      await expect(tokens.save(tokens.create(values))).rejects.toThrow()
    })

    it('no guarda el token en claro, solo su hash', async () => {
      const user = await insertUser()
      await dataSource.getRepository(RefreshTokenTypeOrmEntity).save({
        userId: user.id,
        tokenHash: 'hash-del-refresh',
        expiresAt: new Date(Date.now() + 60_000),
      })

      const guardado = await dataSource
        .getRepository(RefreshTokenTypeOrmEntity)
        .findOneOrFail({ where: { userId: user.id } })

      expect(guardado.tokenHash).toBe('hash-del-refresh')
      expect(Object.keys(guardado)).not.toContain('token')
    })

    it('arranca sin revocar', async () => {
      const user = await insertUser()
      const token = await dataSource.getRepository(RefreshTokenTypeOrmEntity).save({
        userId: user.id,
        tokenHash: 'hash-vigente',
        expiresAt: new Date(Date.now() + 60_000),
      })

      expect(token.revokedAt).toBeNull()
    })
  })
})

describe('deshacer el esquema de cuentas', () => {
  let dataSource: DataSource

  beforeAll(async () => {
    dataSource = await resetTestDatabase()
  })

  afterAll(async () => {
    await dataSource.destroy()
  })

  it('down borra las tres tablas y up las vuelve a crear', async () => {
    const down = new CreateAccountTables1759000000000()
    const up = new CreateAccountTables1759000000000()
    const queryRunner = dataSource.createQueryRunner()

    await queryRunner.connect()

    try {
      // El carrito se deshace antes que las cuentas porque su marca de tiempo es
      // posterior, y TypeORM deshace en orden inverso. Sin este paso, carts
      // seguiría apuntando a users y el DROP de users fallaría: el test tiene que
      // reproducir el orden real de un rollback, no uno inventado.
      await new CreateCartTables1759100000000().down(queryRunner)
      // Las órdenes van después del carrito en el historial y también apuntan a
      // users y a coffee_variants, así que un rollback real las deshace antes. Sin
      // este paso, el DROP de customers fallaría por ellas.
      await new CreateOrderTables1759300000000().down(queryRunner)

      await down.down(queryRunner)

      const tras = await queryRunner.query(
        "SELECT table_name FROM information_schema.tables WHERE table_name IN ('customers', 'users', 'refresh_tokens')",
      )
      expect(tras).toHaveLength(0)

      await up.up(queryRunner)

      const deNuevo = await queryRunner.query(
        "SELECT table_name FROM information_schema.tables WHERE table_name IN ('customers', 'users', 'refresh_tokens')",
      )
      expect(deNuevo).toHaveLength(3)
    } finally {
      await queryRunner.release()
    }
  })
})
