import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import { resetTestDatabase } from '../../testing/test-database'
import { DepartmentTypeOrmEntity } from './department.typeorm.entity'
import { CityTypeOrmEntity } from './city.typeorm.entity'

/**
 * La lista de departamentos y ciudades no puede estar en el codigo ni en un
 * JSON suelto: para que "Bogotá es de Cundinamarca" se pueda comprobar, tiene que
 * estar en la base y con la clave foranea que lo une. Estos tests se ejecutan
 * contra PostgreSQL de verdad porque lo que se comprueba son las restricciones.
 */
describe('departamentos y ciudades', () => {
  let dataSource: DataSource

  const departamentos = () => dataSource.getRepository(DepartmentTypeOrmEntity)
  const ciudades = () => dataSource.getRepository(CityTypeOrmEntity)

  beforeAll(async () => {
    dataSource = await resetTestDatabase()
  })

  afterAll(async () => {
    await dataSource.destroy()
  })

  it('están sembrados los 32 departamentos', async () => {
    expect(await departamentos().count()).toBe(32)
  })

  it('Bogotá D. C. está como departamento, aunque no sea departamento', async () => {
    const bogota = await departamentos().findOneBy({ name: 'Bogotá D. C.' })

    expect(bogota).not.toBeNull()
  })

  it('hay una Bogotá en Cundinamarca y otra en Bogotá D. C., que es como es', async () => {
    // Las dos son verdad: Bogotá D. C. es el distrito capital y el municipio de
    // Bogotá pertenece a Cundinamarca. Por eso el UNIQUE es sobre el par y no
    // sobre el nombre, y por eso una búsqueda por nombre devuelve más de una.
    const cundinamarca = await departamentos().findOneByOrFail({ name: 'Cundinamarca' })
    const distrito = await departamentos().findOneByOrFail({ name: 'Bogotá D. C.' })
    const bogotas = await ciudades().findBy({ name: 'Bogotá' })
    const departamentosDeBogota = bogotas.map((ciudad) => ciudad.departmentId).sort()

    expect(departamentosDeBogota).toEqual([cundinamarca.id, distrito.id].sort())
  })

  it('Medellín queda en Antioquia', async () => {
    const antioquia = await departamentos().findOneByOrFail({ name: 'Antioquia' })
    const medellin = await ciudades().findOneByOrFail({ name: 'Medellín' })

    expect(medellin.departmentId).toBe(antioquia.id)
  })

  it('no admite una ciudad con un departamento que no existe', async () => {
    await expect(
      ciudades().save(
        ciudades().create({
          name: 'Inventada',
          departmentId: '11111111-1111-4111-8111-111111111111',
        }),
      ),
    ).rejects.toThrow()
  })

  it('no admite dos ciudades con el mismo nombre en el mismo departamento', async () => {
    const cundinamarca = await departamentos().findOneByOrFail({ name: 'Cundinamarca' })

    // Soacha ya viene sembrada, así que insertarla otra vez es el caso repetido.
    await expect(
      ciudades().save(ciudades().create({ name: 'Soacha', departmentId: cundinamarca.id })),
    ).rejects.toThrow()
  })

  it('no admite dos departamentos con el mismo nombre', async () => {
    const cundinamarca = await departamentos().findOneByOrFail({ name: 'Cundinamarca' })
    await departamentos().update({ id: cundinamarca.id }, { name: 'Cundinamarca' })

    await expect(
      departamentos().save(departamentos().create({ name: 'Cundinamarca' })),
    ).rejects.toThrow()
  })

  it('el UNIQUE es sobre el par y no sobre el nombre, porque hay nombres repetidos', async () => {
    // "Armenia" es una ciudad de Quindío y también de Risaralda en la realidad, y
    // con un UNIQUE sobre el nombre solo se podría sembrar una de las dos.
    const conEseNombre = await ciudades().findBy({ name: 'Armenia' })
    const departamentosDistintos = new Set(conEseNombre.map((ciudad) => ciudad.departmentId))

    expect(departamentosDistintos.size).toBeGreaterThan(1)
  })
})
