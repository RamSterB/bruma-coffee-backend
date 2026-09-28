import { DataSource } from 'typeorm'
import { TypeOrmDatabaseHealthAdapter } from './database-health.typeorm.adapter'
import { resetTestDatabase } from '../../testing/test-database'

/**
 * El adaptador contra PostgreSQL de verdad.
 *
 * La prueba con un doble dice que el controlador responde bien cuando la base dice que
 * no. Esta dice lo otro, que es lo que no se puede simular: que `isAlive` devuelve
 * `true` **de verdad** contra una base con datos dentro, y no solo contra un doble que
 * contesta lo que le da la gana.
 *
 * La de 503 ya la cubre el doble, porque ahí lo que se prueba es la reacción del
 * servicio, no la consulta.
 */
describe('el chequeo de la base de datos contra PostgreSQL', () => {
  let dataSource: DataSource
  let adapter: TypeOrmDatabaseHealthAdapter

  beforeAll(async () => {
    dataSource = await resetTestDatabase()
    adapter = new TypeOrmDatabaseHealthAdapter(dataSource)
  })

  afterAll(async () => {
    await dataSource.destroy()
  })

  it('con la base viva responde que sí', async () => {
    expect(await adapter.isAlive()).toBe(true)
  })

  it('no depende de que haya datos: la consulta no toca ninguna tabla', async () => {
    // Una comprobación que contara filas empezaría a dar 503 el día que la tabla
    // creciera, o si se vaciara. `SELECT 1` no puede pasar por eso.
    await adapter.isAlive()
    await adapter.isAlive()

    expect(await adapter.isAlive()).toBe(true)
  })

  it('con la base caída responde que no, sin PROPAGAR el error', async () => {
    const conConexionMala = new TypeOrmDatabaseHealthAdapter({
      query: () => Promise.reject(new Error('ECONNREFUSED 10.0.1.20:5432')),
    } as unknown as DataSource)

    expect(await conConexionMala.isAlive()).toBe(false)
  })
})
