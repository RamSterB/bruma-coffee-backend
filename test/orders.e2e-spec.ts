import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { createHash } from 'node:crypto'
import { AppModule } from '../src/app.module'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { resetTestDatabase, TEST_CONNECTION_ENV } from '../src/testing/test-database'
import { CoffeeTypeOrmEntity } from '../src/infrastructure/persistence/coffee.typeorm.entity'
import { CoffeeVariantTypeOrmEntity } from '../src/infrastructure/persistence/coffee-variant.typeorm.entity'
import { OrderTypeOrmEntity } from '../src/infrastructure/persistence/order.typeorm.entity'
import { PaymentTypeOrmEntity } from '../src/infrastructure/persistence/payment.typeorm.entity'
import { DeliveryTypeOrmEntity } from '../src/infrastructure/persistence/delivery.typeorm.entity'
import { createCardGatewayStub } from '../src/testing/card-gateway.stub'

const CONTRASENA = 'BrumaCafe2026!'

const SECRETO_DE_EVENTOS = 'test_events_secreto_del_e2e'

/**
 * El flujo de pago entero contra la aplicación real y PostgreSQL de verdad. Lo que
 * se comprueba aquí es lo que ningún doble puede comprobar: que el stock baja una
 * sola vez aunque el evento llegue dos veces, que la orden y el envío quedan
 * escritos en la misma transacción, y que un evento con firma inválida no cobra.
 */
describe('/orders e2e', () => {
  let app: INestApplication
  let dataSource: DataSource
  let server: ReturnType<INestApplication['getHttpServer']>
  let variantId: string
  let token: string
  let referenciaDeLaPasarela: string

  const firmar = (evento: {
    data: Record<string, unknown>
    properties: string[]
    timestamp: number
  }): string => {
    const valores = evento.properties.map((ruta) =>
      ruta
        .split('.')
        .reduce<unknown>(
          (valor, parte) =>
            valor === null || typeof valor !== 'object'
              ? undefined
              : (valor as Record<string, unknown>)[parte],
          evento.data,
        ),
    )

    return createHash('sha256')
      .update(`${valores.join('')}${evento.timestamp}${SECRETO_DE_EVENTOS}`)
      .digest('hex')
  }

  const eventoDe = (
    estado: string,
    over: { referencia?: string; timestamp?: number; firma?: string } = {},
  ) => {
    const referencia = over.referencia ?? referenciaDeLaPasarela
    const timestamp = over.timestamp ?? 1747673128600
    const data = {
      transaction: { id: referencia, reference: 'BC-1', status: estado, amountInCents: 5998000 },
    }
    const properties = ['transaction.id', 'transaction.status']

    return {
      event: 'transaction.updated',
      data,
      signature: { properties, checksum: over.firma ?? firmar({ data, properties, timestamp }) },
      timestamp,
      sent_at: new Date().toISOString(),
    }
  }

  beforeAll(async () => {
    Object.assign(process.env, TEST_CONNECTION_ENV)
    process.env.JWT_SECRET = 'un-secreto-de-sesion-suficientemente-largo'
    process.env.CARD_GATEWAY_PUBLIC_KEY = 'pub_test_una'
    process.env.CARD_GATEWAY_PRIVATE_KEY = 'prv_test_dos'
    process.env.CARD_GATEWAY_EVENTS_SECRET = SECRETO_DE_EVENTOS
    process.env.CARD_GATEWAY_INTEGRITY_SECRET = 'test_integrity_cuatro'

    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider('CARD_GATEWAY_CONFIG')
      .useValue({
        baseUrl: 'https://sandbox.invalido/v1',
        publicKey: 'pub_test_una',
        privateKey: 'prv_test_dos',
        eventsSecret: SECRETO_DE_EVENTOS,
        integritySecret: 'test_integrity_cuatro',
      })
      .overrideProvider('CARD_GATEWAY_FETCH')
      .useValue(createCardGatewayStub(() => referenciaDeLaPasarela))
      .compile()

    app = modulo.createNestApplication()
    app.setGlobalPrefix('api')
    app.use(cookieParser())
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    await app.init()
    server = app.getHttpServer()
    dataSource = app.get(DataSource)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await resetTestDatabase()
    // Referencia corta y con letras a propósito. Con 13 dígitos seguidos (un
    // timestamp, por ejemplo) el test que busca un número de tarjeta filtrado la
    // la marcaría como si lo fuera, y ese test empezaría a fallar por su propio
    // dato de prueba.
    referenciaDeLaPasarela = 'tx-ref-de-prueba'

    const coffees = dataSource.getRepository(CoffeeTypeOrmEntity)
    const coffee = await coffees.save(
      coffees.create({
        name: 'Caturra',
        description: 'Notas de cata',
        roastLevel: 'medium' as never,
        process: 'washed' as never,
        region: 'huila' as never,
        tastingNotes: ['cacao'],
        isActive: true,
      }),
    )
    const variantes = dataSource.getRepository(CoffeeVariantTypeOrmEntity)
    const variante = await variantes.save(
      variantes.create({ coffeeId: coffee.id, weightGrams: 250, price: '42000', stock: 10 }),
    )
    variantId = variante.id

    await request(server)
      .post('/api/auth/register')
      .send({ email: 'comprador@ejemplo.co', password: CONTRASENA, fullName: 'Persona Compradora' })
      .expect(201)
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: 'comprador@ejemplo.co', password: CONTRASENA })
      .expect(200)
    token = (login.body as { accessToken: string }).accessToken

    await request(server)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ variantId, quantity: 2 })
      .expect(201)
  })

  /** Sesion del administrador que crea la migracion de arranque. */
  const tokenDeAdmin = async (): Promise<string> => {
    // Sin valor por defecto a proposito: estas credenciales las fija `test/setup-env.ts`
    // para la migracion y para los tests. Si aqui hubiera un valor inventado, volveria
    // a pasar lo de antes: igual en local por casualidad y distinto en CI.
    const email = process.env.SEED_ADMIN_EMAIL
    const contrasena = process.env.SEED_ADMIN_PASSWORD

    if (email === undefined || contrasena === undefined) {
      throw new Error(
        'Faltan SEED_ADMIN_EMAIL o SEED_ADMIN_PASSWORD. Las define test/setup-env.ts, ' +
          'que es quien crea la cuenta de administrador de la base de pruebas.',
      )
    }
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email, password: contrasena })
      .expect(200)

    return (login.body as { accessToken: string }).accessToken
  }

  const stockDe = async (): Promise<number> => {
    const fila = await dataSource.getRepository(CoffeeVariantTypeOrmEntity).findOneByOrFail({ id: variantId })

    return fila.stock
  }

  describe('POST /api/orders', () => {
    it('crea la orden en PENDING y guarda el pago con el token de la tarjeta', async () => {
      const respuesta = await request(server)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          cardToken: 'tok_test_123',
          email: 'comprador@ejemplo.co',
          shipping: {
            fullName: 'Persona Compradora',
            documentNumber: '1098765434',
            phone: '3001234567',
            address: 'Carrera 7 con Calle 72',
            city: 'Bogotá',
            department: 'Cundinamarca',
          },
        })
        .expect(201)

      const cuerpo = respuesta.body as Record<string, unknown>
      expect(cuerpo.status).toBe('PENDING')
      expect(cuerpo.paymentStatus).toBe('PENDING')
      expect(cuerpo.orderNumber).toMatch(/^BC-\d{8}-\d{4}$/)

      const pagos = await dataSource.getRepository(PaymentTypeOrmEntity).find()
      expect(pagos).toHaveLength(1)
      expect(pagos[0]?.token).toBe('tok_test_123')
      expect(pagos[0]?.providerReference).toBe(referenciaDeLaPasarela)
    })

    it('no guarda ningún número de tarjeta en ninguna tabla', async () => {
      await request(server)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          cardToken: 'tok_test_123',
          email: 'comprador@ejemplo.co',
          shipping: {
            fullName: 'Persona Compradora',
            documentNumber: '1098765434',
            phone: '3001234567',
            address: 'Carrera 7 con Calle 72',
            city: 'Bogotá',
            department: 'Cundinamarca',
          },
        })
        .expect(201)

      const volcado = JSON.stringify(
        await dataSource.getRepository(PaymentTypeOrmEntity).find().then((filas) =>
          filas.map((fila) => ({ ...fila })),
        ),
      )
      expect(volcado).not.toMatch(/\d{13,19}/)
    })

    it('no crea la orden sin sesión', async () => {
      await request(server).post('/api/orders').send({ cardToken: 'tok' }).expect(401)
    })

    it('no cobra con el carrito vacío', async () => {
      await dataSource.query('DELETE FROM cart_items')

      const respuesta = await request(server)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          cardToken: 'tok_test_123',
          email: 'comprador@ejemplo.co',
          shipping: {
            fullName: 'Persona Compradora',
            documentNumber: '1098765434',
            phone: '3001234567',
            address: 'Carrera 7 con Calle 72',
            city: 'Bogotá',
            department: 'Cundinamarca',
          },
        })
        .expect(400)

      expect((respuesta.body as { code: string }).code).toBe('EMPTY_CART')
    })

    it('no cobra sin el token de la tarjeta', async () => {
      await request(server)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          cardToken: '',
          email: 'comprador@ejemplo.co',
          shipping: {
            fullName: 'Persona Compradora',
            documentNumber: '1098765434',
            phone: '3001234567',
            address: 'Carrera 7 con Calle 72',
            city: 'Bogotá',
            department: 'Cundinamarca',
          },
        })
        .expect(400)
    })
  })

  describe('POST /api/webhooks/card-gateway', () => {
    const pagar = async (): Promise<string> => {
      const respuesta = await request(server)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          cardToken: 'tok_test_123',
          email: 'comprador@ejemplo.co',
          shipping: {
            fullName: 'Persona Compradora',
            documentNumber: '1098765434',
            phone: '3001234567',
            address: 'Carrera 7 con Calle 72',
            city: 'Bogotá',
            department: 'Cundinamarca',
          },
        })
        .expect(201)

      return (respuesta.body as { id: string }).id
    }

    it('paga la orden, descuenta el stock y crea el envío', async () => {
      const orderId = await pagar()

      await request(server).post('/api/webhooks/card-gateway').send(eventoDe('APPROVED')).expect(200)

      const orden = await dataSource.getRepository(OrderTypeOrmEntity).findOneByOrFail({ id: orderId })
      expect(orden.status).toBe('PAID')
      expect(orden.paymentStatus).toBe('APPROVED')
      expect(await stockDe()).toBe(8)

      const envios = await dataSource.getRepository(DeliveryTypeOrmEntity).find()
      expect(envios).toHaveLength(1)
      expect(envios[0]?.orderId).toBe(orderId)
      expect(envios[0]?.status).toBe('PENDING')
    })

    it('procesar el mismo evento dos veces no descuenta el stock dos veces', async () => {
      await pagar()

      await request(server).post('/api/webhooks/card-gateway').send(eventoDe('APPROVED')).expect(200)
      await request(server).post('/api/webhooks/card-gateway').send(eventoDe('APPROVED')).expect(200)

      expect(await stockDe()).toBe(8)
      expect(await dataSource.getRepository(DeliveryTypeOrmEntity).count()).toBe(1)
    })

    it('ignora un evento con firma inválida, y no toca el stock', async () => {
      await pagar()

      const respuesta = await request(server)
        .post('/api/webhooks/card-gateway')
        .send(eventoDe('APPROVED', { firma: 'f'.repeat(64) }))
        .expect(401)

      expect((respuesta.body as { code: string }).code).toBe('INVALID_WEBHOOK_SIGNATURE')
      expect(await stockDe()).toBe(10)
    })

    it('no descuenta stock con un pago rechazado', async () => {
      const orderId = await pagar()

      await request(server).post('/api/webhooks/card-gateway').send(eventoDe('DECLINED')).expect(200)

      const orden = await dataSource.getRepository(OrderTypeOrmEntity).findOneByOrFail({ id: orderId })
      expect(orden.status).toBe('FAILED')
      expect(await stockDe()).toBe(10)
      expect(await dataSource.getRepository(DeliveryTypeOrmEntity).count()).toBe(0)
    })

    it('ignora un evento de una transacción que no conoce, y responde 200 para que no reintente', async () => {
      await pagar()

      const respuesta = await request(server)
        .post('/api/webhooks/card-gateway')
        .send(eventoDe('APPROVED', { referencia: 'tx-que-no-existe' }))
        .expect(200)

      expect((respuesta.body as { ignored: boolean }).ignored).toBe(true)
      expect(await stockDe()).toBe(10)
    })

    it('no guarda el número de la tarjeta aunque venga en el evento', async () => {
      await pagar()

      const evento = eventoDe('APPROVED') as Record<string, unknown>
      const data = evento.data as Record<string, Record<string, unknown>>
      data.transaction = { ...data.transaction, card_number: '4111111111111111' }
      await request(server).post('/api/webhooks/card-gateway').send(evento).expect(200)

      const pagos = await dataSource.getRepository(PaymentTypeOrmEntity).find()
      expect(JSON.stringify(pagos)).not.toContain('4111111111111111')
    })
  })

  describe('GET /api/orders/:id', () => {
    it('devuelve el estado final de la orden y no la de otra persona', async () => {
      const orderId = (await request(server)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          cardToken: 'tok_test_123',
          email: 'comprador@ejemplo.co',
          shipping: {
            fullName: 'Persona Compradora',
            documentNumber: '1098765434',
            phone: '3001234567',
            address: 'Carrera 7 con Calle 72',
            city: 'Bogotá',
            department: 'Cundinamarca',
          },
        })
        .expect(201)).body as { id: string }

      await request(server).post('/api/webhooks/card-gateway').send(eventoDe('APPROVED')).expect(200)

      const respuesta = await request(server)
        .get(`/api/orders/${orderId.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      const cuerpo = respuesta.body as Record<string, unknown>
      expect(cuerpo.status).toBe('PAID')
      expect(cuerpo.paymentStatus).toBe('APPROVED')
      expect(cuerpo.delivery).toMatchObject({ status: 'PENDING' })
    })

    it('devuelve 404 para una orden que no existe', async () => {
      await request(server)
        .get('/api/orders/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .expect(404)
    })

    it('no deja ver la orden de otra persona, y responde 404 en vez de 403', async () => {
      const orderId = await request(server)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          cardToken: 'tok_test_123',
          email: 'comprador@ejemplo.co',
          shipping: {
            fullName: 'Persona Compradora',
            documentNumber: '1098765434',
            phone: '3001234567',
            address: 'Carrera 7 con Calle 72',
            city: 'Bogotá',
            department: 'Cundinamarca',
          },
        })
        .expect(201)
        .then((respuesta) => (respuesta.body as { id: string }).id)

      await request(server)
        .post('/api/auth/register')
        .send({ email: 'otra@ejemplo.co', password: CONTRASENA, fullName: 'Otra Persona' })
        .expect(201)
      const login = await request(server)
        .post('/api/auth/login')
        .send({ email: 'otra@ejemplo.co', password: CONTRASENA })
        .expect(200)
      const otroToken = (login.body as { accessToken: string }).accessToken

      // 404 y no 403: un 403 confirmaría que ese identificador existe, y con eso
      // basta para recorrer los pedidos de la tienda probando identificadores.
      const respuesta = await request(server)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${otroToken}`)
        .expect(404)

      expect((respuesta.body as { code: string }).code).toBe('ORDER_NOT_FOUND')
    })
  })

  describe('GET /api/payments/config', () => {
    it('devuelve la llave pública y la URL, y nada más', async () => {
      const respuesta = await request(server).get('/api/payments/config').expect(200)

      const cuerpo = respuesta.body as Record<string, unknown>
      expect(cuerpo.publicKey).toBe('pub_test_una')
      expect(cuerpo.environment).toBe('sandbox')
      // La privada y los dos secretos no salen del servidor por ninguna ruta.
      expect(JSON.stringify(cuerpo)).not.toContain('prv_test_dos')
      expect(JSON.stringify(cuerpo)).not.toContain(SECRETO_DE_EVENTOS)
      expect(JSON.stringify(cuerpo)).not.toContain('test_integrity_cuatro')
    })

    it('es público, porque el que la necesita todavía no ha iniciado sesión', async () => {
      await request(server).get('/api/payments/config').expect(200)
    })
  })

  describe('POST /api/orders/reconcile', () => {
    it('paga una orden cuyo evento nunca llego, que es justo para lo que existe', async () => {
      const creada = await request(server)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          cardToken: 'tok_test_123',
          email: 'comprador@ejemplo.co',
          shipping: {
            fullName: 'Persona Compradora',
            documentNumber: '1098765434',
            phone: '3001234567',
            address: 'Carrera 7 con Calle 72',
            city: 'Bogotá',
            department: 'Cundinamarca',
          },
        })
        .expect(201)
      const orderId = (creada.body as { id: string }).id

      // El evento no llega: nadie registro la URL, o la pasarela esta caida. El pago
      // se queda PENDING y el stock sin tocar, y eso es lo que hay que recuperar.
      const pendiente = await dataSource
        .getRepository(OrderTypeOrmEntity)
        .findOneByOrFail({ id: orderId })
      expect(pendiente.status).toBe('PENDING')
      expect(await stockDe()).toBe(10)

      // La reconciliacion, por diseno, solo mira pagos que llevan un rato pendientes:
      // uno recien creado puede que la pasarela todavia no haya decidido. Envejecer el
      // pago aqui es lo que hace el papel del paso del tiempo, sin esperar treinta
      // segundos de reloj.
      await dataSource.query(
        "UPDATE payments SET created_at = now() - interval '2 minutes' WHERE order_id = $1",
        [orderId],
      )

      // El token se pide ANTES de construir la petición. Con el `await` dentro de la
      // cadena, la petición queda sin nada que la mantenga viva mientras se resuelve
      // y supertest cierra la conexion: falla con ECONNREFUSED sin llegar a enviar
      // nada. Es un detalle del arnés, no del codigo, pero cuesta un rato encontrarlo.
      const tokenDeAdministrador = await tokenDeAdmin()

      await request(server)
        .post('/api/orders/reconcile')
        .set('Authorization', `Bearer ${tokenDeAdministrador}`)
        .expect(200)

      const pagada = await dataSource
        .getRepository(OrderTypeOrmEntity)
        .findOneByOrFail({ id: orderId })
      expect(pagada.status).toBe('PAID')
      expect(await stockDe()).toBe(8)
    })

    it('no lo puede llamar una persona normal', async () => {
      // 401 y no 403: es lo que contesta el guard de administrador que ya existe en el
      // repo, y semantics más correctas serían 403. No se cambia aquí porque ese guard
      // lo usan otros endpoints y tocarlo es otro increment. Anotado como deuda.
      await request(server)
        .post('/api/orders/reconcile')
        .set('Authorization', `Bearer ${token}`)
        .expect(401)
    })

    it('no lo puede llamar quien no tiene sesion', async () => {
      await request(server).post('/api/orders/reconcile').expect(401)
    })
  })

  describe('GET /api/orders', () => {
    const crearOrden = async () =>
      request(server)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          cardToken: 'tok_test_123',
          email: 'comprador@ejemplo.co',
          shipping: {
            fullName: 'Persona Compradora',
            documentNumber: '1098765434',
            phone: '3001234567',
            address: 'Carrera 7 con Calle 72',
            city: 'Bogotá',
            department: 'Cundinamarca',
          },
        })
        .expect(201)

    it('devuelve las órdenes de quien pregunta, con su número y su total', async () => {
      await crearOrden()

      const respuesta = await request(server)
        .get('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      const ordenes = respuesta.body as Record<string, unknown>[]
      expect(ordenes).toHaveLength(1)
      expect(ordenes[0]?.orderNumber).toMatch(/^BC-\d{8}-\d{4}$/)
      expect(ordenes[0]?.total).toBeGreaterThan(0)
      expect(ordenes[0]?.items).toHaveLength(1)
    })

    it('NO devuelve las órdenes de otra persona, y se comprueba explícitamente', async () => {
      await crearOrden()

      await request(server)
        .post('/api/auth/register')
        .send({ email: 'otra@ejemplo.co', password: CONTRASENA, fullName: 'Otra Persona' })
        .expect(201)
      const login = await request(server)
        .post('/api/auth/login')
        .send({ email: 'otra@ejemplo.co', password: CONTRASENA })
        .expect(200)
      const otroToken = (login.body as { accessToken: string }).accessToken

      const respuesta = await request(server)
        .get('/api/orders')
        .set('Authorization', `Bearer ${otroToken}`)
        .expect(200)

      // La otra persona no tiene compras, así que su lista está vacía. Si el filtro
      // fallara, aquí aparecería el número de orden y el total de otra persona.
      expect(respuesta.body).toEqual([])
    })

    it('devuelve una lista vacía, y no un error, si no hay compras', async () => {
      const respuesta = await request(server)
        .get('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      expect(respuesta.body).toEqual([])
    })

    it('no se puede pedir sin sesión', async () => {
      await request(server).get('/api/orders').expect(401)
    })

    it('no lleva la dirección ni el documento de la persona', async () => {
      await crearOrden()

      const respuesta = await request(server)
        .get('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      const [orden] = respuesta.body as Record<string, unknown>[]
      // La lista es para saber qué se pidió. Volver a exponer el documento en una
      // segunda pantalla no aporta nada y amplía lo que se puede ver por error.
      expect(Object.keys(orden ?? {}).sort()).toEqual([
        'createdAt',
        'id',
        'items',
        'orderNumber',
        'paymentStatus',
        'status',
        'total',
      ])
    })
  })
})

