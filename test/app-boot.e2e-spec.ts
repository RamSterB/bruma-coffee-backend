import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import { DataSource } from 'typeorm'
import { Test } from '@nestjs/testing'
import { resetTestDatabase } from '../src/testing/test-database'
import { AppModule } from '../src/app.module'

/**
 * La aplicación arranca con `autoLoadEntities`, que solo conoce las entidades que
 * algún módulo registró. Una entidad usada en una relación pero no registrada
 * **no falla en los tests de extremo a extremo**: esos sustituyen la conexión por
 * una que trae la lista completa a mano, y ahí sí funciona. Falla al levantar el
 * servicio, con un error de metadatos que no dice qué entidad falta.
 *
 * Este test no sustituye la conexión. Arranca la aplicación entera, con su
 * cableado y su lista de entidades, para que ese fallo aparezca aquí.
 */
describe('arranque de la aplicación', () => {
  let dataSource: DataSource

  beforeAll(async () => {
    await resetTestDatabase()

    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile()

    dataSource = modulo.get(DataSource)
  }, 60_000)

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy()
    }
  })

  it('construye los metadatos de todas las entidades, incluidas las que están en relación', () => {
    const nombres = dataSource.entityMetadatas.map((metadata) => metadata.name)

    for (const esperada of [
      'CoffeeTypeOrmEntity',
      'CoffeeVariantTypeOrmEntity',
      'CustomerTypeOrmEntity',
      'UserTypeOrmEntity',
      'RefreshTokenTypeOrmEntity',
      'CartTypeOrmEntity',
      'CartItemTypeOrmEntity',
      'DepartmentTypeOrmEntity',
      'CityTypeOrmEntity',
    ]) {
      expect(nombres).toContain(esperada)
    }
  })

  it('la entidad de ciudades está registrada, que es la que faltaba', () => {
    expect(dataSource.hasMetadata('CityTypeOrmEntity')).toBe(true)
  })
})
