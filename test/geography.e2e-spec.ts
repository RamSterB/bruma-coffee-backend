import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { resetTestDatabase } from '../src/testing/test-database'

/**
 * El formulario de envío necesita la lista de departamentos y ciudades, y esa
 * lista no puede estar escrita en el frontend: es la misma que usa el backend
 * para validar, y tener dos copias significa que un día una no cuadra con la otra
 * y el formulario rechaza lo que el servidor aceptaba.
 *
 * Estos endpoints son públicos a propósito: se consultan antes de entrar y no
 * enseñan nada de nadie.
 */
describe('geografía pública', () => {
  let app: INestApplication
  let dataSource: DataSource
  let server: ReturnType<INestApplication['getHttpServer']>

  beforeAll(async () => {
    dataSource = await resetTestDatabase()

    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(dataSource)
      .compile()

    app = modulo.createNestApplication()
    app.setGlobalPrefix('api')
    await app.init()
    server = app.getHttpServer()
  }, 60_000)

  afterAll(async () => {
    await app.close()
  })

  it('lista los 32 departamentos sin pedir sesión', async () => {
    const respuesta = await request(server).get('/api/geography/departments').expect(200)

    expect(respuesta.body).toHaveLength(32)
  })

  it('cada departamento trae su identificador y su nombre', async () => {
    const respuesta = await request(server).get('/api/geography/departments').expect(200)
    const cundinamarca = respuesta.body.find(
      (d: { name: string }) => d.name === 'Cundinamarca',
    )

    expect(cundinamarca.id).toEqual(expect.any(String))
  })

  it('lista las ciudades de un departamento', async () => {
    const departamentos = await request(server).get('/api/geography/departments')
    const antioquia = departamentos.body.find((d: { name: string }) => d.name === 'Antioquia')

    const respuesta = await request(server)
      .get(`/api/geography/departments/${antioquia.id}/cities`)
      .expect(200)

    expect(respuesta.body.map((c: { name: string }) => c.name)).toContain('Medellín')
  })

  it('Bogotá sale en los dos departamentos que la tienen, porque hay dos', async () => {
    const departamentos = await request(server).get('/api/geography/departments')
    const conBogota: string[] = []

    for (const departamento of departamentos.body as { id: string; name: string }[]) {
      const ciudades = await request(server).get(
        `/api/geography/departments/${departamento.id}/cities`,
      )

      if ((ciudades.body as { name: string }[]).some((c) => c.name === 'Bogotá')) {
        conBogota.push(departamento.name)
      }
    }

    expect(conBogota).toEqual(expect.arrayContaining(['Bogotá D. C.', 'Cundinamarca']))
  })

  it('responde 404 con un departamento que no existe', async () => {
    await request(server)
      .get('/api/geography/departments/11111111-1111-4111-8111-111111111111/cities')
      .expect(404)
  })
})
