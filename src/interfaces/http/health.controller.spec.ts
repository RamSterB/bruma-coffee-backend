import { describe, expect, it, beforeEach } from '@jest/globals'
import request from 'supertest'
import { Test } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { DatabaseHealthPort } from '../../domain/ports/database-health.port'

/** El mismo prefijo que pone la aplicación real; duplicado a propósito, no se exporta. */
const API_PREFIX = 'api'
import { HealthController } from './health.controller'

/**
 * El port con la respuesta que se le quiera dar.
 *
 * Un doble y no PostgreSQL a propósito: lo que importa es **qué contesta el servicio
 * cuando la base no responde**, y eso con la base real solo se consigue rompiéndola,
 * que no es una prueba que se pueda dejar escrita. El adaptador contra la base real sí
 * tiene su propia prueba de integración.
 */
class BaseDeDatosFalsa extends DatabaseHealthPort {
  constructor(private readonly responde: boolean) {
    super()
  }

  async isAlive(): Promise<boolean> {
    return this.responde
  }
}

const montar = async (responde: boolean): Promise<INestApplication> => {
  const modulo = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: DatabaseHealthPort, useValue: new BaseDeDatosFalsa(responde) }],
  }).compile()

  const app = modulo.createNestApplication()
  // El prefijo global lo pone la aplicación real; sin él la ruta no es la misma que
  // la que va a llamar el balanceador, y la prueba pasaría sin comprobar nada real.
  app.setGlobalPrefix(API_PREFIX)

  await app.init()

  return app
}

describe('el chequeo de salud', () => {
  let app: INestApplication

  beforeEach(async () => {
    app = await montar(true)
  })

  it('contesta 200 sin pedir sesion, que a el balanceador no se le da una', async () => {
    // El balanceador lo llama sin cabeceras de autorizacion. Si exigiera token, el
    // contenedor se daria por malo y dejaria de recibir trafico, sin que nadie sepa
    // por que: un 401 aqui es indistinguible de "la aplicacion esta caida".
    const respuesta = await request(app.getHttpServer()).get('/api/health').expect(200)

    expect(respuesta.body).toEqual({ status: 'ok' })
  })

  it('contesta 200 tambien con la base de datos contestando', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200)
  })

  it('contesta 503 si la base de datos no responde', async () => {
    const caido = await montar(false)

    const respuesta = await request(caido.getHttpServer()).get('/api/health').expect(503)

    // Que diga que es la base de datos y no "algo ha fallado": quien mira la consola
    // del contenedor tiene que poder distinction de una vistazo.
    expect(respuesta.body).toEqual({ status: 'degradado', causa: 'base-de-datos' })

    await caido.close()
  })

  it('el 503 sale rapido, porque un chequeo lento no sirve de nada', async () => {
    const caido = await montar(false)
    const empieza = Date.now()

    await request(caido.getHttpServer()).get('/api/health').expect(503)

    // Si la consulta se queda colgada, el balanceador agota su tiempo de espera y da
    // el contenedor por malo igualmente, pero sin saber por que. Y cada comprobacion
    // se queda una conexion abierta.
    expect(Date.now() - empieza).toBeLessThan(3000)

    await caido.close()
  })
})
