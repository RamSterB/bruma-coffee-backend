import { describe, expect, it, beforeEach, afterEach } from '@jest/globals'
import request from 'supertest'
import { Test } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { configureApp, type AppSecurityOptions } from '../app.setup'
import { CoffeeController } from '../interfaces/http/coffee.controller'
import { GetCoffeeByIdUseCase } from '../application/use-cases/get-coffee-by-id.use-case'
import { CoffeeNotFoundError } from '../domain/errors/coffee-not-found.error'
import { GetCoffeesUseCase } from '../application/use-cases/get-coffees.use-case'

/**
 * Lo que el navegador hace con una respuesta, y por que importa.
 *
 * **Una API con datos de una persona no se puede cachear.** Sin `Cache-Control`, el
 * framework manda su `ETag` igualmente, el navegador guarda la respuesta y en la
 * siguiente peticion manda `If-None-Match`. El servidor contesta **304** y lo hace sin
 * cuerpo, porque no hace falta: el navegador ya tiene la copia.
 *
 * Y aqui esta el fallo: un 304 **no es un error de red**, asi que `fetch` lo resuelve
 * como una respuesta mas. Pero `response.ok` solo es cierto de 200 a 299, asi que el
 * cliente lo toma por un fallo y lanza. En local no se cachea nada y nunca pasa; en
 * produccion, con la primera visita hecha, la segunda falla siempre.
 *
 * Por eso la cabecera va en la respuesta y no en el manejador del fallo: la peticion
 * correcta es la que no se cachea.
 */
const OPCIONES: AppSecurityOptions = {
  allowedOrigins: ['http://localhost:5173'],
}

describe('la cache de las respuestas de la API', () => {
  let app: INestApplication

  beforeEach(async () => {
    const coffees = {
      items: [],
      total: 0,
      page: 1,
      limit: 12,
      totalPages: 0,
    }

    const modulo = await Test.createTestingModule({
      controllers: [CoffeeController],
      providers: [
        { provide: GetCoffeesUseCase, useValue: { execute: async () => coffees } },
        {
          provide: GetCoffeeByIdUseCase,
          useValue: {
            execute: async () => {
              throw new CoffeeNotFoundError('cd9bbd02-07ba-433c-9fbe-44305a880214')
            },
          },
        },
      ],
    }).compile()

    app = modulo.createNestApplication()
    configureApp(app, OPCIONES)
    await app.init()
  })

  afterEach(async () => {
    await app.close()
  })

  it('dice que no se guarde, en todas las respuestas', async () => {
    const respuesta = await request(app.getHttpServer()).get('/api/coffee').expect(200)

    expect(respuesta.headers['cache-control']).toContain('no-store')
  })

  it('no revalida nunca, porque si no la segunda peticion sale con 304', async () => {
    const primera = await request(app.getHttpServer()).get('/api/coffee').expect(200)

    // Con la cabecera de arriba, el navegador ni guarda ni revalida. La prueba no
    // comprueba que falte el ETag: comprueba lo que importa, que la respuesta no se
    // pueda revalidar.
    expect(primera.headers['cache-control']).toContain('no-store')
    expect(primera.headers['cache-control']).toContain('no-cache')
  })

  it('tambien en un error, que un fallo guardado es peor que un acierto guardado', async () => {
    const respuesta = await request(app.getHttpServer()).get(
      '/api/coffee/cd9bbd02-07ba-433c-9fbe-44305a880214',
    )

    // Un error guardado se repite en cada visita aunque el problema ya no exista, y hace
    // creer que la tienda no tiene el cafe cuando lo que hay es una copia vieja.
    //
    // No se mira el codigo de estado: aqui el filtro de errores de la aplicacion no esta
    // registrado, asi que sale 500 en vez del 404 que dara en el de verdad. Lo que se
    // comprueba es que la cabecera llega tambien cuando la respuesta no es la buena, y
    // llega porque el middleware se ejecuta antes de que la ruta decida nada.
    expect(respuesta.headers['cache-control']).toContain('no-store')
  })
})
