import { hashSync } from 'bcrypt'
import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Dos cuentas de arranque: una administracion y un cliente, las dos con su
 * customer y el correo verificado.
 *
 * La contrasena NO esta escrita en el codigo. Viene de SEED_ADMIN_PASSWORD y
 * SEED_CUSTOMER_PASSWORD, y en produccion se aborta si se deja el valor de
 * desarrollo. Una contrasena de administrador escrita en una migracion queda en
 * el historico de git para siempre, y ahi no se puede cambiar.
 */

const DEV_ADMIN_PASSWORD = 'BrumaCafe2026!'
const DEV_CUSTOMER_PASSWORD = 'BrumaCafe2026!'

const BCRYPT_ROUNDS = 10

interface SeededAccount {
  email: string
  password: string
  fullName: string
  role: 'ADMIN' | 'CUSTOMER'
}

const readEnv = (name: string, fallback: string): string => {
  const value = process.env[name]

  return value === undefined || value === '' ? fallback : value
}

const accounts = (): SeededAccount[] => [
  {
    email: readEnv('SEED_ADMIN_EMAIL', 'admin@bruma-coffee.test'),
    password: readEnv('SEED_ADMIN_PASSWORD', DEV_ADMIN_PASSWORD),
    fullName: readEnv('SEED_ADMIN_NAME', 'Administración Bruma'),
    role: 'ADMIN',
  },
  {
    email: readEnv('SEED_CUSTOMER_EMAIL', 'cliente@bruma-coffee.test'),
    password: readEnv('SEED_CUSTOMER_PASSWORD', DEV_CUSTOMER_PASSWORD),
    fullName: readEnv('SEED_CUSTOMER_NAME', 'Cliente de Ejemplo'),
    role: 'CUSTOMER',
  },
]

const assertNoDevelopmentPasswords = (): void => {
  if (process.env.NODE_ENV !== 'production') {
    return
  }

  for (const account of accounts()) {
    if (account.password === DEV_ADMIN_PASSWORD || account.password === DEV_CUSTOMER_PASSWORD) {
      throw new Error(
        `La cuenta ${account.email} usaria la contrasena de desarrollo en produccion. ` +
          'Define SEED_ADMIN_PASSWORD y SEED_CUSTOMER_PASSWORD con valores propios.',
      )
    }
  }
}

export class SeedAccounts1759000001000 implements MigrationInterface {
  name = 'SeedAccounts1759000001000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    assertNoDevelopmentPasswords()

    for (const account of accounts()) {
      const passwordHash = hashSync(account.password, BCRYPT_ROUNDS)
      const [{ id: customerId }] = await queryRunner.query(
        'INSERT INTO customers (email, full_name) VALUES ($1, $2) RETURNING id',
        [account.email, account.fullName],
      )

      await queryRunner.query(
        `INSERT INTO users (email, password_hash, full_name, role, customer_id, email_verified_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [account.email, passwordHash, account.fullName, account.role, customerId],
      )
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Los users primero: customers.customer_id usa ON DELETE SET NULL, asi que
    // borrar solo el customer dejaria una cuenta viva sin historial, que es peor
    // que no haber sembrado nada.
    const rows = await queryRunner.query(
      "SELECT id, customer_id FROM users WHERE email LIKE '%@bruma-coffee.test'",
    )

    for (const row of rows) {
      await queryRunner.query('DELETE FROM users WHERE id = $1', [row.id])

      if (row.customer_id !== null) {
        await queryRunner.query('DELETE FROM customers WHERE id = $1', [row.customer_id])
      }
    }
  }
}
