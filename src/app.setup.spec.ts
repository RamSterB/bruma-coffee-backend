import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { IsNumber, IsString, Min } from 'class-validator'
import { configureApp } from './app.setup'
import { Body, Controller, Get, Module, Post } from '@nestjs/common'

class CreateProbeDto {
  @IsString()
  name!: string

  @IsNumber()
  @Min(0)
  price!: number
}

@Controller('coffee')
class ProbeController {
  @Get()
  findAll(): { ok: true } {
    return { ok: true }
  }

  @Post()
  create(@Body() body: CreateProbeDto): { ok: true; received: unknown } {
    return { ok: true, received: body }
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('configureApp (seguridad)', () => {
  let app: INestApplication

  const buildApp = async (): Promise<INestApplication> => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile()
    const instance = moduleRef.createNestApplication()
    configureApp(instance, { allowedOrigins: ['https://tienda.example.co'] })
    await instance.init()
    return instance
  }

  beforeEach(async () => {
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
  })

  describe('security headers', () => {
    it('envía Content-Security-Policy restrictiva sin unsafe-eval', async () => {
      const response = await request(app.getHttpServer()).get('/api/coffee')

      expect(response.headers['content-security-policy']).toBeDefined()
      expect(response.headers['content-security-policy']).toContain("default-src 'self'")
      expect(response.headers['content-security-policy']).not.toContain('unsafe-eval')
    })

    it('envía Strict-Transport-Security con includeSubDomains', async () => {
      const response = await request(app.getHttpServer()).get('/api/coffee')

      expect(response.headers['strict-transport-security']).toContain('max-age=15552000')
      expect(response.headers['strict-transport-security']).toContain('includeSubDomains')
    })

    it('envía X-Content-Type-Options nosniff', async () => {
      const response = await request(app.getHttpServer()).get('/api/coffee')

      expect(response.headers['x-content-type-options']).toBe('nosniff')
    })

    it('envía X-Frame-Options para evitar clickjacking', async () => {
      const response = await request(app.getHttpServer()).get('/api/coffee')

      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN')
    })

    it('envía Referrer-Policy restrictiva', async () => {
      const response = await request(app.getHttpServer()).get('/api/coffee')

      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    })
  })

  describe('CORS', () => {
    it('permite un origen de la lista explícita', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/coffee')
        .set('Origin', 'https://tienda.example.co')

      expect(response.headers['access-control-allow-origin']).toBe('https://tienda.example.co')
    })

    it('NO refleja un origen no permitido', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/coffee')
        .set('Origin', 'https://atacante.example.com')

      expect(response.headers['access-control-allow-origin']).toBeUndefined()
    })

    it('no acepta el comodín como origen', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/coffee')
        .set('Origin', 'https://cualquiera.example.com')

      expect(response.headers['access-control-allow-origin']).not.toBe('*')
    })
  })

  describe('configuración general', () => {
    it('expone las rutas bajo el prefijo /api', async () => {
      await request(app.getHttpServer()).get('/api/coffee').expect(200)
    })

    it('rechaza campos no declarados en el body (whitelist estricta)', async () => {
      await request(app.getHttpServer())
        .post('/api/coffee')
        .set('Origin', 'https://tienda.example.co')
        .send({ name: 'X', price: 1, campoInesperado: true })
        .expect(400)
    })

    it('acepta un body válido', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/coffee')
        .set('Origin', 'https://tienda.example.co')
        .send({ name: 'Geisha', price: 28.5 })

      expect(response.status).toBe(201)
      expect(response.body.received).toEqual({ name: 'Geisha', price: 28.5 })
    })
  })
})
