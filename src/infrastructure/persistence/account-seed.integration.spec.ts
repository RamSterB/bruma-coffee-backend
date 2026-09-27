import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import { resetTestDatabase } from '../../testing/test-database'

/**
 * La semilla de cuentas tiene que existir sin que nadie la pida: si el arranque
 * espera a que alguien cree el primer admin, la aplicacion queda con un hueco por
 * el que todavia no puede pasar nadie, y un despliegue limpio no tendria como
 * arrancar.
 */
describe('semilla de cuentas', () => {
  let dataSource: DataSource

  beforeAll(async () => {
    dataSource = await resetTestDatabase()
  })

  afterAll(async () => {
    await dataSource.destroy()
  })

  it('deja un administrador verificado', async () => {
    const [admin] = await dataSource.query("SELECT * FROM users WHERE role = 'ADMIN'")

    expect(admin).toBeDefined()
    expect(admin.email_verified_at).not.toBeNull()
  })

  it('deja el administrador con un customer asociado', async () => {
    const [admin] = await dataSource.query(`
      SELECT u.customer_id, c.email AS customer_email
      FROM users u
      JOIN customers c ON c.id = u.customer_id
      WHERE u.role = 'ADMIN'
    `)

    expect(admin.customer_id).not.toBeNull()
    expect(admin.customer_email).toBe(admin.customer_email.toLowerCase())
  })

  it('el administrador no guarda la contraseña en claro', async () => {
    const [admin] = await dataSource.query("SELECT password_hash FROM users WHERE role = 'ADMIN'")

    expect(admin.password_hash).not.toMatch(/bruma|admin|123|password/i)
  })

  it('deja un cliente de ejemplo verificado y con customer', async () => {
    const [cliente] = await dataSource.query(`
      SELECT u.email, u.role, u.email_verified_at, c.id AS customer_id
      FROM users u
      JOIN customers c ON c.id = u.customer_id
      WHERE u.role = 'CUSTOMER'
    `)

    expect(cliente).toBeDefined()
    expect(cliente.email_verified_at).not.toBeNull()
    expect(cliente.customer_id).not.toBeNull()
  })

  it('deja dos cuentas, no mas', async () => {
    const [{ total }] = await dataSource.query('SELECT COUNT(*)::int AS total FROM users')

    expect(total).toBe(2)
  })
})
