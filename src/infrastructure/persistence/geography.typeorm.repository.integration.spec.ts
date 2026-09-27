import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import { resetTestDatabase } from '../../testing/test-database'
import { TypeOrmGeographyRepository } from './geography.typeorm.repository'
import { DepartmentTypeOrmEntity } from './department.typeorm.entity'

/**
 * El repositorio de geografía se mide con su propio umbral, y los endpoints
 * públicos que lo usan solo se ejercitan en la suite de extremo a extremo, que no
 * cuenta para ese umbral. Aquí se comprueba contra la base de verdad: con
 * acentos, sin acentos y con nombres que se repiten en el país.
 */
describe('TypeOrmGeographyRepository', () => {
  let dataSource: DataSource
  let repository: TypeOrmGeographyRepository

  beforeAll(async () => {
    dataSource = await resetTestDatabase()
    repository = new TypeOrmGeographyRepository(dataSource.getRepository(DepartmentTypeOrmEntity))
  })

  afterAll(async () => {
    // Sin esto la conexión se queda abierta y Jest avisa de que no salió limpio.
    await dataSource.destroy()
  })

  it('lista los departamentos ordenados por nombre', async () => {
    const departamentos = await repository.listDepartments()

    expect(departamentos).toHaveLength(32)
    expect(departamentos[0]?.name).toBe('Amazonas')
  })

  it('busca un departamento ignorando mayúsculas', async () => {
    const encontrado = await repository.findDepartmentByName('cundinamarca')

    expect(encontrado?.name).toBe('Cundinamarca')
  })

  it('busca un departamento ignorando los espacios alrededor', async () => {
    const encontrado = await repository.findDepartmentByName('  Antioquia  ')

    expect(encontrado?.name).toBe('Antioquia')
  })

  it('devuelve null con un departamento que no existe', async () => {
    expect(await repository.findDepartmentByName('Narnia')).toBeNull()
  })

  it('devuelve null con un nombre que lleva comillas, sin romper la consulta', async () => {
    expect(await repository.findDepartmentByName("Narn'; DROP TABLE departments; --")).toBeNull()
  })

  it('encuentra un departamento por su identificador', async () => {
    const departamentos = await repository.listDepartments()
    const antioquia = departamentos.find((d) => d.name === 'Antioquia')

    const encontrado = await repository.findDepartmentById((antioquia as { id: string }).id)

    expect(encontrado?.name).toBe('Antioquia')
  })

  it('devuelve null con un identificador que no existe', async () => {
    expect(await repository.findDepartmentById('11111111-1111-4111-8111-111111111111')).toBeNull()
  })

  it('lista las ciudades de un departamento ordenadas', async () => {
    const departamentos = await repository.listDepartments()
    const antioquia = departamentos.find((d) => d.name === 'Antioquia')

    const ciudades = await repository.listCitiesByDepartment((antioquia as { id: string }).id)

    expect(ciudades.map((c) => c.name)).toEqual([...ciudades.map((c) => c.name)].sort())
    expect(ciudades.map((c) => c.name)).toContain('Medellín')
  })

  it('devuelve una lista vacía para un departamento sin ciudades sembradas', async () => {
    expect(await repository.listCitiesByDepartment('11111111-1111-4111-8111-111111111111')).toEqual(
      [],
    )
  })

  it('busca una ciudad ignorando mayúsculas y tildes', async () => {
    const departamentos = await repository.listDepartments()
    const cundinamarca = departamentos.find((d) => d.name === 'Cundinamarca')

    const encontrada = await repository.findCityInDepartment(
      'BOGOTA',
      (cundinamarca as { id: string }).id,
    )

    expect(encontrada?.name).toBe('Bogotá')
  })

  it('devuelve null con una ciudad que no existe en ese departamento', async () => {
    const departamentos = await repository.listDepartments()
    const cundinamarca = departamentos.find((d) => d.name === 'Cundinamarca')

    const encontrada = await repository.findCityInDepartment(
      'Medellín',
      (cundinamarca as { id: string }).id,
    )

    expect(encontrada).toBeNull()
  })
})
