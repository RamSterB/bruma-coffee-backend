import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { AppModule } from '../src/app.module'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { resetTestDatabase } from '../src/testing/test-database'
import { CSRF_COOKIE, REFRESH_COOKIE } from '../src/interfaces/http/auth/auth-cookie'
import { LoginRateLimiter } from '../src/interfaces/http/auth/login-rate-limit.guard'

/**
 * Estos tests van contra la aplicación real y contra PostgreSQL de verdad. Los
 * guards, el CSRF, la rotación de cookies y el limitador no se pueden comprobar
 * con dobles: un doble de cookie siempre pasa la prueba y en el navegador no.
 */
describe('/auth e2e', () => {
  let app: INestApplication
  let dataSource: DataSource
  let server: ReturnType<INestApplication['getHttpServer']>

  const cookieValor = (cookies: string[], nombre: string): string | undefined =>
  cookies
    .find((cookie) => cookie.startsWith(`${nombre}=`))
    ?.split(';')[0]
    ?.split('=')
    .slice(1)
    .join('=')

const cuenta = { email: 'persona@ejemplo.com', password: 'BrumaCafe2026!', fullName: 'Persona Registrada' }

  beforeAll(async () => {
    dataSource = await resetTestDatabase()

    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(dataSource)
      .compile()

    app = modulo.createNestApplication()
    app.use(cookieParser())
    app.setGlobalPrefix('api')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    await app.init()
    server = app.getHttpServer()
  }, 60_000)

  afterAll(async () => {
    // app.close() ya cierra la conexion que le inyectamos, porque es la misma
    // instancia de DataSource. Destruirla otra vez revienta.
    await app.close()
  })

  beforeEach(async () => {
    await dataSource.query('TRUNCATE refresh_tokens, users, customers RESTART IDENTITY CASCADE')
    // El limitador cuenta en memoria: si no se limpia, el test que prueba el
    // bloqueo deja llena la cuota y falla el siguiente test sin motivo apparent.
    app.get(LoginRateLimiter).limpiarContadores()
  })

  /**
   * El navegador solo manda las cookies cuyo Path sea prefijo de la ruta que se
   * pide. Los tests de abajomontean la cabecera `Cookie` a mano, y al hacerlo se
   * saltan esa regla: por eso los errores de path pasaron inadvertidos y la sesion
   * se cerraba sola al recargar. Este helper reconstruye el comportamiento real.
   */
  const navegadorManda = (setCookie: string[] | undefined, ruta: string): string[] => {
    const aplicables = (setCookie ?? []).filter((cookie) => {
      const camino = cookie.split(';')[0]?.split('=')[0]?.trim()
      const atributos = cookie.split(';').map((parte) => parte.trim())
      const path = atributos.find((parte) => parte.startsWith('Path='))?.slice(5) ?? '/'

      return camino !== undefined && camino !== '' && ruta.startsWith(path)
    })

    return aplicables.map((cookie) => cookie.split(';')[0] as string)
  }

  const registrar = async () => {
    const respuesta = await request(server)
      .post('/api/auth/register')
      .send(cuenta)
      .expect(201)

    return respuesta.body as { message: string }
  }

  const entrar = async () => {
    await registrar()
    const respuesta = await request(server)
      .post('/api/auth/login')
      .send({ email: cuenta.email, password: cuenta.password })
      .expect(200)

    return respuesta
  }

  describe('POST /api/auth/register', () => {
    it('crea la cuenta y responde 201', async () => {
      const cuerpo = await registrar()

      expect(typeof cuerpo.message).toBe('string')
      expect(cuerpo.message.length).toBeGreaterThan(0)
    })

    it('no devuelve ninguna sesion: hay que entrar con login', async () => {
      const respuesta = await request(server).post('/api/auth/register').send(cuenta).expect(201)

      expect(respuesta.body).not.toHaveProperty('accessToken')
      expect(respuesta.headers['set-cookie']).toBeUndefined()
    })

    it('responde lo mismo si el correo ya existe, para no revelar que correos hay', async () => {
      const primera = await registrar()
      const segunda = await registrar()

      expect(segunda.message).toBe(primera.message)
    })

    it('rechaza un correo que no es correo con 400', async () => {
      await request(server)
        .post('/api/auth/register')
        .send({ ...cuenta, email: 'no-es-correo' })
        .expect(400)
    })

    it('rechaza una contrasena de menos de ocho caracteres con 400', async () => {
      await request(server)
        .post('/api/auth/register')
        .send({ ...cuenta, password: 'corta' })
        .expect(400)
    })

    it('rechaza campos que no existen, para que no se cuele nada por descuido', async () => {
      await request(server)
        .post('/api/auth/register')
        .send({ ...cuenta, role: 'ADMIN' })
        .expect(400)
    })
  })

  describe('POST /api/auth/login', () => {
    it('devuelve el access token en el cuerpo y no en cookie', async () => {
      await registrar()
      const respuesta = await request(server)
        .post('/api/auth/login')
        .send({ email: cuenta.email, password: cuenta.password })
        .expect(200)

      expect(respuesta.body.accessToken).toEqual(expect.any(String))
      expect(respuesta.body.csrfToken).toEqual(expect.any(String))
      expect(respuesta.body.accessTokenExpiresIn).toBe(900)
    })

    it('pone el refresh en cookie httpOnly y el CSRF en una que si puede leer', async () => {
      await registrar()
      const respuesta = await request(server)
        .post('/api/auth/login')
        .send({ email: cuenta.email, password: cuenta.password })
        .expect(200)

      const cookies = respuesta.headers['set-cookie'] as unknown as string[]
      const refresh = cookies.find((c) => c.startsWith(REFRESH_COOKIE))
      const csrf = cookies.find((c) => c.startsWith(CSRF_COOKIE))

      expect(refresh).toMatch(/HttpOnly/i)
      expect(refresh).toMatch(/Path=\/api\/auth/i)
      expect(refresh).toMatch(/SameSite=Lax/i)
      expect(csrf).not.toMatch(/HttpOnly/i)
    })

    it('el token de refresh nunca aparece en el cuerpo de la respuesta', async () => {
      await registrar()
      const respuesta = await request(server)
        .post('/api/auth/login')
        .send({ email: cuenta.email, password: cuenta.password })
        .expect(200)

      expect(JSON.stringify(respuesta.body)).not.toContain(cuenta.password)
      expect(respuesta.body).not.toHaveProperty('refreshToken')
    })

    it('responde 401 con la contraseña equivocada', async () => {
      await registrar()

      await request(server)
        .post('/api/auth/login')
        .send({ email: cuenta.email, password: 'no-es-la-contrasena' })
        .expect(401)
    })

    it('responde el mismo 401 si el correo no existe, sin confirmar nada', async () => {
      const respuesta = await request(server)
        .post('/api/auth/login')
        .send({ email: 'nadie@ejemplo.com', password: 'BrumaCafe2026!' })
        .expect(401)

      expect(respuesta.body.message).toMatch(/credenciales/i)
    })

    it('deja entrar seis veces seguidas a quien acierta, porque el contador se borra al acertar', async () => {
      await registrar()

      for (let intento = 0; intento < 6; intento += 1) {
        await request(server)
          .post('/api/auth/login')
          .send({ email: cuenta.email, password: cuenta.password })
          .expect(200)
      }
    })

    it('bloquea a los seis intentos seguidos con 429', async () => {
      await registrar()

      for (let intento = 0; intento < 5; intento += 1) {
        await request(server)
          .post('/api/auth/login')
          .send({ email: cuenta.email, password: 'equivocada' })
      }

      await request(server)
        .post('/api/auth/login')
        .send({ email: cuenta.email, password: 'equivocada' })
        .expect(429)
    })
  })

  describe('GET /api/auth/me', () => {
    it('devuelve el perfil con el access token en la cabecera', async () => {
      const login = await entrar()

      const respuesta = await request(server)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200)

      expect(respuesta.body.email).toBe(cuenta.email)
      expect(respuesta.body).not.toHaveProperty('passwordHash')
    })

    it('responde 401 sin cabecera de autorizacion', async () => {
      await request(server).get('/api/auth/me').expect(401)
    })

    it('responde 401 con un token inventado', async () => {
      await request(server).get('/api/auth/me').set('Authorization', 'Bearer inventado').expect(401)
    })

    it('no acepta el token de refresh en el sitio del access', async () => {
      const login = await entrar()
      const refresh = (login.headers['set-cookie'] as unknown as string[])
        .find((c) => c.startsWith(REFRESH_COOKIE))!
        .split(';')[0]!
        .split('=')[1]!

      await request(server).get('/api/auth/me').set('Authorization', `Bearer ${refresh}`).expect(401)
    })
  })

  describe('POST /api/auth/refresh', () => {
    it('funciona con las reglas de cookie del navegador, sin montar la cabecera a mano', async () => {
      // Esta es la prueba que faltaba. Reproduce lo que pasa al recargar: el
      // login devuelve las cookies y el navegador decide si las envia a
      // /api/auth/refresh segun su Path.
      const login = await entrar()
      const conPath = login.headers['set-cookie'] as unknown as string[]

      await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', navegadorManda(conPath, '/api/auth/refresh'))
        .set('x-csrf-token', cookieValor(conPath, CSRF_COOKIE) as string)
        .expect(200)
    })

    it('las cookies de sesion sedirname a /api/auth, donde esta el refresh', async () => {
      const login = await entrar()
      const conPath = login.headers['set-cookie'] as unknown as string[]

      expect(navegadorManda(conPath, '/api/auth/refresh')).toHaveLength(2)
    })

    it('la cookie de CSRF se ve desde la pagina, que es lo que permite el doble envio', async () => {
      const login = await entrar()
      const conPath = login.headers['set-cookie'] as unknown as string[]

      // La pagina de la tienda esta en /, no en /api/auth.
      expect(navegadorManda(conPath, '/')).toContain(`${CSRF_COOKIE}=${cookieValor(conPath, CSRF_COOKIE)}`)
    })

    it('rota la cookie y devuelve un access token nuevo', async () => {
      const login = await entrar()
      const antes = (login.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith(REFRESH_COOKIE),
      )!
      const csrf = (login.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith(CSRF_COOKIE),
      )!
      const refreshValue = antes.split(';')[0]!.split('=')[1]!
      const csrfValue = csrf.split(';')[0]!.split('=')[1]!

      const respuesta = await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', [`${REFRESH_COOKIE}=${refreshValue}`, `${CSRF_COOKIE}=${csrfValue}`])
        .set('x-csrf-token', csrfValue)
        .expect(200)

      expect(respuesta.body.accessToken).toEqual(expect.any(String))

      const despues = (respuesta.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith(REFRESH_COOKIE),
      )!
      expect(despues.split(';')[0]!.split('=')[1]).not.toBe(refreshValue)
    })

    it('revoca el refresh viejo, de modo que no sirve dos veces', async () => {
      const login = await entrar()
      const cookies = login.headers['set-cookie'] as unknown as string[]
      const refreshValue = cookies.find((c) => c.startsWith(REFRESH_COOKIE))!.split(';')[0]!.split('=')[1]!
      const csrfValue = cookies.find((c) => c.startsWith(CSRF_COOKIE))!.split(';')[0]!.split('=')[1]!

      await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', [`${REFRESH_COOKIE}=${refreshValue}`, `${CSRF_COOKIE}=${csrfValue}`])
        .set('x-csrf-token', csrfValue)
        .expect(200)

      await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', [`${REFRESH_COOKIE}=${refreshValue}`, `${CSRF_COOKIE}=${csrfValue}`])
        .set('x-csrf-token', csrfValue)
        .expect(401)
    })

    it('en la base solo queda el hash del token, nunca el token', async () => {
      const login = await entrar()
      const cookies = login.headers['set-cookie'] as unknown as string[]
      const refreshValue = cookies.find((c) => c.startsWith(REFRESH_COOKIE))!.split(';')[0]!.split('=')[1]!

      const [{ total }] = await dataSource.query(
        'SELECT COUNT(*)::int AS total FROM refresh_tokens WHERE token_hash = $1',
        [refreshValue],
      )

      expect(total).toBe(0)
    })

    it('rechaza sin cabecera x-csrf-token, que es el CSRF de verdad', async () => {
      const login = await entrar()
      const cookies = login.headers['set-cookie'] as unknown as string[]
      const refreshValue = cookies.find((c) => c.startsWith(REFRESH_COOKIE))!.split(';')[0]!.split('=')[1]!

      await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', [`${REFRESH_COOKIE}=${refreshValue}`, `${CSRF_COOKIE}=inventado`])
        .expect(403)
    })

    it('rechaza si la cabecera y la cookie no coinciden', async () => {
      const login = await entrar()
      const cookies = login.headers['set-cookie'] as unknown as string[]
      const refreshValue = cookies.find((c) => c.startsWith(REFRESH_COOKIE))!.split(';')[0]!.split('=')[1]!
      const csrfValue = cookies.find((c) => c.startsWith(CSRF_COOKIE))!.split(';')[0]!.split('=')[1]!

      await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', [`${REFRESH_COOKIE}=${refreshValue}`, `${CSRF_COOKIE}=${csrfValue}`])
        .set('x-csrf-token', 'otro-valor')
        .expect(403)
    })

    it('responde 401 sin cookie de refresh', async () => {
      await request(server).post('/api/auth/refresh').expect(401)
    })

    it('borra las cookies cuando el refresh ya no vale, para no repetir el fallo', async () => {
      const respuesta = await request(server).post('/api/auth/refresh').expect(401)

      const cookies = (respuesta.headers['set-cookie'] ?? []) as unknown as string[]

      expect(cookies.some((c) => c.startsWith(REFRESH_COOKIE))).toBe(true)
    })
  })

  describe('POST /api/auth/logout', () => {
    it('revoca el refresh en la base, no solo borra la cookie', async () => {
      const login = await entrar()
      const cookies = login.headers['set-cookie'] as unknown as string[]
      const refreshValue = cookies.find((c) => c.startsWith(REFRESH_COOKIE))!.split(';')[0]!.split('=')[1]!
      const csrfValue = cookies.find((c) => c.startsWith(CSRF_COOKIE))!.split(';')[0]!.split('=')[1]!

      await request(server)
        .post('/api/auth/logout')
        .set('Cookie', [`${REFRESH_COOKIE}=${refreshValue}`, `${CSRF_COOKIE}=${csrfValue}`])
        .set('x-csrf-token', csrfValue)
        .expect(200)

      const [{ total: activos }] = await dataSource.query(
        'SELECT COUNT(*)::int AS total FROM refresh_tokens WHERE revoked_at IS NULL',
      )
      expect(activos).toBe(0)
    })

    it('el refresh deja de servir despues del logout', async () => {
      const login = await entrar()
      const cookies = login.headers['set-cookie'] as unknown as string[]
      const refreshValue = cookies.find((c) => c.startsWith(REFRESH_COOKIE))!.split(';')[0]!.split('=')[1]!
      const csrfValue = cookies.find((c) => c.startsWith(CSRF_COOKIE))!.split(';')[0]!.split('=')[1]!
      const cabecera = [`${REFRESH_COOKIE}=${refreshValue}`, `${CSRF_COOKIE}=${csrfValue}`]

      await request(server).post('/api/auth/logout').set('Cookie', cabecera).set('x-csrf-token', csrfValue)
      await request(server).post('/api/auth/refresh').set('Cookie', cabecera).set('x-csrf-token', csrfValue).expect(401)
    })

    it('responde 200 aunque no haya cookie, para que cerrar sesion siempre funcione', async () => {
      await request(server).post('/api/auth/logout').expect(200)
    })

    it('exige el token CSRF cuando hay cookie de refresh', async () => {
      const login = await entrar()
      const cookies = login.headers['set-cookie'] as unknown as string[]
      const refreshValue = cookies.find((c) => c.startsWith(REFRESH_COOKIE))!.split(';')[0]!.split('=')[1]!

      await request(server)
        .post('/api/auth/logout')
        .set('Cookie', `${REFRESH_COOKIE}=${refreshValue}`)
        .expect(403)
    })
  })
})
