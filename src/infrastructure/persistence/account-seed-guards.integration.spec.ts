import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import { resetTestDatabase } from '../../testing/test-database'
import { SeedAccounts1759000001000 } from '../../migrations/1759000001000-SeedAccounts'

// Una migracion corre una sola vez, asi que repetir up() sobre una base ya
// sembrada no es un escenario real. Los tests que lo hacen vacian antes.
const vaciarCuentas = async (dataSource: DataSource): Promise<void> => {
  await dataSource.query('TRUNCATE refresh_tokens, users, customers RESTART IDENTITY CASCADE')
}

/**
 * La semilla tiene una condición de aborto, y una condición de aborto sin probar
 * es una condición que nadie sabe si funciona. Estos tests la ejecutan de verdad.
 */
describe('la semilla se niega a arrancar en produccion con la contrasena de desarrollo', () => {
  let dataSource: DataSource
  const nodeEnvOriginal = process.env.NODE_ENV

  beforeAll(async () => {
    dataSource = await resetTestDatabase()
  })

  afterAll(async () => {
    process.env.NODE_ENV = nodeEnvOriginal
    await dataSource.destroy()
  })

  it('lanza si NODE_ENV es produccion y no hay contrasena propia', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.SEED_ADMIN_PASSWORD
    delete process.env.SEED_CUSTOMER_PASSWORD

    await expect(
      new SeedAccounts1759000001000().up(dataSource.createQueryRunner()),
    ).rejects.toThrow(/SEED_ADMIN_PASSWORD/)
  })

  it('no lanza en desarrollo', async () => {
    process.env.NODE_ENV = 'development'
    delete process.env.SEED_ADMIN_PASSWORD
    delete process.env.SEED_CUSTOMER_PASSWORD

    await vaciarCuentas(dataSource)
    const queryRunner = dataSource.createQueryRunner()

    try {
      await new SeedAccounts1759000001000().up(queryRunner)
    } finally {
      await queryRunner.release()
    }
  })

  it('no lanza en produccion si las contrasenas son propias', async () => {
    process.env.NODE_ENV = 'production'
    process.env.SEED_ADMIN_PASSWORD = 'otra-cosa-que-no-es-la-de-desarrollo'
    process.env.SEED_CUSTOMER_PASSWORD = 'otra-cosa-distinta'

    await vaciarCuentas(dataSource)
    const queryRunner = dataSource.createQueryRunner()

    try {
      await expect(new SeedAccounts1759000001000().up(queryRunner)).resolves.toBeUndefined()
    } finally {
      delete process.env.SEED_ADMIN_PASSWORD
      delete process.env.SEED_CUSTOMER_PASSWORD
      await queryRunner.release()
    }
  })
})

describe('deshacer la semilla de cuentas', () => {
  let dataSource: DataSource

  beforeAll(async () => {
    dataSource = await resetTestDatabase()
  })

  afterAll(async () => {
    await dataSource.destroy()
  })

  it('down borra las cuentas de la semilla, users y customers', async () => {
    const down = new SeedAccounts1759000001000()
    const queryRunner = dataSource.createQueryRunner()

    await queryRunner.connect()

    try {
      await down.down(queryRunner)

      const [{ total }] = await queryRunner.query('SELECT COUNT(*)::int AS total FROM users')
      expect(total).toBe(0)
    } finally {
      await queryRunner.release()
    }
  })
})
