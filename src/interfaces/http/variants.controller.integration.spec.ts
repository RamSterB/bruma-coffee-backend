import { INestApplication } from '@nestjs/common'
import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import type { DataSource } from 'typeorm'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { GetVariantsByIdsUseCase } from '../../application/use-cases/get-variants-by-ids.use-case'
import { configureApp } from '../../app.setup'
import { readAllowedOrigins } from '../../config/allowed-origins'
import { CoffeeRepositoryPort } from '../../domain/ports/coffee.repository'
import { CoffeeTypeOrmEntity } from '../../infrastructure/persistence/coffee.typeorm.entity'
import { CoffeeVariantTypeOrmEntity } from '../../infrastructure/persistence/coffee-variant.typeorm.entity'
import { CoffeeTypeOrmRepository } from '../../infrastructure/persistence/coffee.typeorm.repository'
import { DomainExceptionFilter } from './filters/domain-exception.filter'
import { aVisibleCoffee, seedCoffee, withStock } from '../../testing/catalog.fixtures'
import { resetTestDatabase, truncateCatalog } from '../../testing/test-database'
import { VariantsController } from './variants.controller'

const DESCONOCIDO = '11111111-1111-4111-8111-111111111111'

/**
 * El módulo de la app no se puede importar aquí: arrastra la configuración de
 * migraciones, que usa `__dirname` y revienta bajo el ESM de Jest. Se monta uno
 * mínimo con el mismo repositorio real, la misma tubería de validación y el
 * mismo filtro de errores, que es lo que este test mide.
 */
@Module({})
class VariantsTestModule {}

describe('GET /api/variants contra PostgreSQL', () => {
  let app: INestApplication
  let dataSource: DataSource

  beforeAll(async () => {
    dataSource = await resetTestDatabase()
    const moduleRef = await Test.createTestingModule({
      imports: [VariantsTestModule],
      controllers: [VariantsController],
      providers: [
        GetVariantsByIdsUseCase,
        {
          provide: CoffeeRepositoryPort,
          useFactory: () =>
            new CoffeeTypeOrmRepository(
              dataSource.getRepository(CoffeeTypeOrmEntity),
              dataSource.getRepository(CoffeeVariantTypeOrmEntity),
            ),
        },
        { provide: APP_FILTER, useClass: DomainExceptionFilter },
      ],
    }).compile()
    app = moduleRef.createNestApplication()
    configureApp(app, { allowedOrigins: readAllowedOrigins('') })
    await app.init()
  })

  afterAll(async () => {
    await app?.close()
    if (dataSource?.isInitialized) {
      await dataSource.destroy()
    }
  })

  beforeEach(async () => {
    await truncateCatalog(dataSource)
  })

  const idDeVariante = async (coffee: Parameters<typeof seedCoffee>[1]): Promise<string> => {
    const guardado = await seedCoffee(dataSource, coffee)
    const variante = await dataSource
      .getRepository(CoffeeVariantTypeOrmEntity)
      .findOneOrFail({ where: { coffeeId: guardado.id } })

    return variante.id
  }

  it('devuelve la línea de cada variante pedida', async () => {
    const id = await idDeVariante(aVisibleCoffee({ name: 'Nariño' }))

    const response = await request(app.getHttpServer()).get('/api/variants').query({
      variantIds: id,
    })

    expect(response.status).toBe(200)
    expect(response.body).toEqual([
      {
        variantId: id,
        coffeeId: expect.any(String),
        coffeeName: 'Nariño',
        weightGrams: 250,
        price: 40000,
        stock: 10,
        isActive: true,
      },
    ])
  })

  it('acepta varios ids separados por comas', async () => {
    const primero = await idDeVariante(aVisibleCoffee({ name: 'Nariño' }))
    const segundo = await idDeVariante(
      aVisibleCoffee({ name: 'Huila', variants: [withStock({ price: 55000, stock: 3 })] }),
    )

    const response = await request(app.getHttpServer())
      .get('/api/variants')
      .query({ variantIds: `${primero},${segundo}` })

    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(2)
    expect(response.body.map((linea: { coffeeName: string }) => linea.coffeeName).sort()).toEqual([
      'Huila',
      'Nariño',
    ])
  })

  it('no confunde la ruta con la de café por id', async () => {
    const respuesta = await request(app.getHttpServer()).get(
      `/api/variants?variantIds=${DESCONOCIDO}`,
    )

    expect(respuesta.status).toBe(200)
    expect(respuesta.body).toEqual([])
  })

  it('omite los ids desconocidos sin fallar', async () => {
    const id = await idDeVariante(aVisibleCoffee({ name: 'Existe' }))

    const response = await request(app.getHttpServer())
      .get('/api/variants')
      .query({ variantIds: `${id},${DESCONOCIDO}` })

    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(1)
  })

  it('rechaza un id que no es un uuid', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/variants')
      .query({ variantIds: 'no-es-un-uuid' })

    expect(response.status).toBe(400)
  })

  it('rechaza más ids del permitido', async () => {
    const demasiados = Array.from({ length: 51 }, () => DESCONOCIDO).join(',')

    const response = await request(app.getHttpServer()).get('/api/variants').query({
      variantIds: demasiados,
    })

    expect(response.status).toBe(400)
  })

  it('rechaza la petición sin ids', async () => {
    const response = await request(app.getHttpServer()).get('/api/variants')

    expect(response.status).toBe(400)
  })

  it('no acepta parámetros que no conoce', async () => {
    const id = await idDeVariante(aVisibleCoffee())

    const response = await request(app.getHttpServer())
      .get('/api/variants')
      .query({ variantIds: id, precio: 1 })

    expect(response.status).toBe(400)
  })
})
