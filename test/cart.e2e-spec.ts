import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { AppModule } from '../src/app.module'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { resetTestDatabase } from '../src/testing/test-database'
import { CoffeeTypeOrmEntity } from '../src/infrastructure/persistence/coffee.typeorm.entity'
import { CoffeeVariantTypeOrmEntity } from '../src/infrastructure/persistence/coffee-variant.typeorm.entity'

type Respuesta = { body: Record<string, unknown> }

const CONTRASENA = 'BrumaCafe2026!'

/**
 * El carrito contra la aplicación real. Lo que importa aquí es lo que un doble
 * no puede comprobar: que el precio viene del catálogo, que el stock manda sobre
 * la cantidad, y sobre todo que el carrito de una persona no es el de otra.
 */
describe('/cart e2e', () => {
  let app: INestApplication
  let dataSource: DataSource
  let server: ReturnType<INestApplication['getHttpServer']>
  let variantId: string
  let otraVariantId: string

  const crearSesion = async (email: string): Promise<string> => {
    await request(server)
      .post('/api/auth/register')
      .send({ email, password: CONTRASENA, fullName: 'Persona Registrada' })
      .expect(201)

    const login = await request(server)
      .post('/api/auth/login')
      .send({ email, password: CONTRASENA })
      .expect(200)

    return (login.body as { accessToken: string }).accessToken
  }

  const crearVariante = async (nombre: string, price: string, stock: number): Promise<string> => {
    const coffees = dataSource.getRepository(CoffeeTypeOrmEntity)
    const coffee = await coffees.save(
      coffees.create({
        name: nombre,
        description: 'Descripción del café',
        roastLevel: 'medium' as never,
        process: 'washed' as never,
        region: 'huila' as never,
        tastingNotes: ['cacao'],
        isActive: true,
      }),
    )
    const variants = dataSource.getRepository(CoffeeVariantTypeOrmEntity)
    const variant = await variants.save(
      variants.create({ coffeeId: coffee.id, weightGrams: 250, price, stock }),
    )

    return variant.id
  }

  const carrito = async (token: string) =>
    (await request(server).get('/api/cart').set('Authorization', `Bearer ${token}`).expect(200))
      .body as Respuesta['body']

  beforeAll(async () => {
    dataSource = await resetTestDatabase()

    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(dataSource)
      .compile()

    app = modulo.createNestApplication()
    app.use(cookieParser())
    app.setGlobalPrefix('api')
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    )
    await app.init()
    server = app.getHttpServer()
  }, 60_000)

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE cart_items, carts, refresh_tokens, users, customers RESTART IDENTITY CASCADE',
    )
    variantId = await crearVariante('Café del Carrito', '42000', 10)
    otraVariantId = await crearVariante('Café Cortado', '35000', 3)
  })

  describe('GET /api/cart', () => {
    it('devuelve un carrito vacío a quien no tiene ninguno', async () => {
      const token = await crearSesion('persona@ejemplo.com')

      expect(await carrito(token)).toEqual({
        items: [],
        subtotal: 0,
        totalItems: 0,
        purchasableItems: 0,
      })
    })

    it('exige token: sin el no hay carrito de nadie', async () => {
      await request(server).get('/api/cart').expect(401)
    })

    it('rechaza un token inventado', async () => {
      await request(server).get('/api/cart').set('Authorization', 'Bearer inventado').expect(401)
    })
  })

  describe('POST /api/cart/items', () => {
    it('agrega una línea y la devuelve con el precio del catálogo', async () => {
      const token = await crearSesion('persona@ejemplo.com')

      const respuesta = await request(server)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ variantId, quantity: 2 })
        .expect(201)

      expect(respuesta.body).toEqual({
        items: [
          {
            variantId,
            coffeeId: expect.any(String),
            coffeeName: 'Café del Carrito',
            weightGrams: 250,
            price: 42000,
            stock: 10,
            quantity: 2,
            subtotal: 84000,
            isPurchasable: true,
          },
        ],
        subtotal: 84000,
        totalItems: 1,
        purchasableItems: 1,
      })
    })

    it('suma a la cantidad que ya había', async () => {
      const token = await crearSesion('persona@ejemplo.com')
      const agregar = (quantity: number) =>
        request(server)
          .post('/api/cart/items')
          .set('Authorization', `Bearer ${token}`)
          .send({ variantId, quantity })

      await agregar(2).expect(201)
      const respuesta = await agregar(3).expect(201)

      expect((respuesta.body.items as { quantity: number }[])[0].quantity).toBe(5)
    })

    it('recorta al stock en vez de guardar más de lo que hay', async () => {
      const token = await crearSesion('persona@ejemplo.com')

      const respuesta = await request(server)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ variantId: otraVariantId, quantity: 9 })
        .expect(201)

      expect((respuesta.body.items as { quantity: number }[])[0].quantity).toBe(3)
    })

    it('el precio del carrito es el del catálogo aunque cambie después de añadir', async () => {
      const token = await crearSesion('persona@ejemplo.com')
      await request(server)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ variantId, quantity: 2 })
        .expect(201)

      await dataSource.query('UPDATE coffee_variants SET price = 50000 WHERE id = $1', [variantId])

      const tras = await carrito(token)

      expect((tras.items as { price: number }[])[0].price).toBe(50000)
      expect(tras.subtotal).toBe(100000)
    })

    it('rechaza una variante que no existe con 404', async () => {
      const token = await crearSesion('persona@ejemplo.com')

      await request(server)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ variantId: '11111111-1111-4111-8111-111111111111', quantity: 1 })
        .expect(404)
    })

    it('rechaza una variante sin stock con 409, en vez de guardar una línea a cero', async () => {
      const token = await crearSesion('persona@ejemplo.com')
      const sinStock = await crearVariante('Café Agotado', '42000', 0)

      await request(server)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ variantId: sinStock, quantity: 1 })
        .expect(409)
    })

    it('rechaza una cantidad cero con 400', async () => {
      const token = await crearSesion('persona@ejemplo.com')

      await request(server)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ variantId, quantity: 0 })
        .expect(400)
    })

    it('rechaza un identificador que no es uuid con 400', async () => {
      const token = await crearSesion('persona@ejemplo.com')

      await request(server)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ variantId: 'no-es-un-uuid', quantity: 1 })
        .expect(400)
    })
  })

  describe('PATCH /api/cart/items/:variantId', () => {
    it('deja la línea en la cantidad pedida', async () => {
      const token = await crearSesion('persona@ejemplo.com')
      await request(server)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ variantId, quantity: 2 })
        .expect(201)

      const respuesta = await request(server)
        .patch(`/api/cart/items/${variantId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 5 })
        .expect(200)

      expect((respuesta.body.items as { quantity: number }[])[0].quantity).toBe(5)
    })

    it('recorta al stock si piden más de lo que hay', async () => {
      const token = await crearSesion('persona@ejemplo.com')
      await request(server)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ variantId: otraVariantId, quantity: 1 })
        .expect(201)

      const respuesta = await request(server)
        .patch(`/api/cart/items/${otraVariantId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 99 })
        .expect(200)

      expect((respuesta.body.items as { quantity: number }[])[0].quantity).toBe(3)
    })

    it('falla con 404 si la variante no está en el carrito, en vez de crearla', async () => {
      const token = await crearSesion('persona@ejemplo.com')

      await request(server)
        .patch(`/api/cart/items/${variantId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 3 })
        .expect(404)
    })

    it('rechaza mandar 0, porque quitar una línea es otra operación', async () => {
      const token = await crearSesion('persona@ejemplo.com')
      await request(server)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ variantId, quantity: 2 })
        .expect(201)

      await request(server)
        .patch(`/api/cart/items/${variantId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 0 })
        .expect(400)
    })
  })

  describe('DELETE /api/cart/items/:variantId', () => {
    it('quita la línea y deja el resto', async () => {
      const token = await crearSesion('persona@ejemplo.com')
      for (const id of [variantId, otraVariantId]) {
        await request(server)
          .post('/api/cart/items')
          .set('Authorization', `Bearer ${token}`)
          .send({ variantId: id, quantity: 1 })
          .expect(201)
      }

      const respuesta = await request(server)
        .delete(`/api/cart/items/${variantId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      expect(respuesta.body.totalItems).toBe(1)
      expect((respuesta.body.items as { variantId: string }[])[0].variantId).toBe(otraVariantId)
    })

    it('falla con 404 si la variante no está en el carrito', async () => {
      const token = await crearSesion('persona@ejemplo.com')

      await request(server)
        .delete(`/api/cart/items/${variantId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404)
    })
  })

  describe('DELETE /api/cart', () => {
    it('vacía el carrito entero', async () => {
      const token = await crearSesion('persona@ejemplo.com')
      await request(server)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ variantId, quantity: 2 })
        .expect(201)

      const respuesta = await request(server)
        .delete('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      expect(respuesta.body).toEqual({
        items: [],
        subtotal: 0,
        totalItems: 0,
        purchasableItems: 0,
      })
    })
  })

  describe('POST /api/cart/merge', () => {
    it('sube el carrito del navegador si el servidor está vacío', async () => {
      const token = await crearSesion('persona@ejemplo.com')

      const respuesta = await request(server)
        .post('/api/cart/merge')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ variantId, quantity: 2 }] })
        .expect(200)

      expect(respuesta.body.totalItems).toBe(1)
      expect((respuesta.body.items as { quantity: number }[])[0].quantity).toBe(2)
    })

    it('gana el servidor si ya tenía carrito, y el local se descarta entero', async () => {
      const token = await crearSesion('persona@ejemplo.com')
      await request(server)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ variantId, quantity: 7 })
        .expect(201)

      const respuesta = await request(server)
        .post('/api/cart/merge')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ variantId: otraVariantId, quantity: 3 }] })
        .expect(200)

      expect(respuesta.body.totalItems).toBe(1)
      expect((respuesta.body.items as { variantId: string }[])[0].variantId).toBe(variantId)
      expect((respuesta.body.items as { quantity: number }[])[0].quantity).toBe(7)
    })

    it('descarta las líneas cuya variante ya no existe', async () => {
      const token = await crearSesion('persona@ejemplo.com')

      const respuesta = await request(server)
        .post('/api/cart/merge')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [
            { variantId, quantity: 1 },
            { variantId: '11111111-1111-4111-8111-111111111111', quantity: 2 },
          ],
        })
        .expect(200)

      expect(respuesta.body.totalItems).toBe(1)
    })

    it('rechaza más de 50 líneas con 400', async () => {
      const token = await crearSesion('persona@ejemplo.com')
      const items = Array.from({ length: 51 }, () => ({ variantId, quantity: 1 }))

      await request(server)
        .post('/api/cart/merge')
        .set('Authorization', `Bearer ${token}`)
        .send({ items })
        .expect(400)
    })
  })

  describe('aislamiento entre carritos', () => {
    it('una persona no ve el carrito de otra', async () => {
      const tokenA = await crearSesion('primera@ejemplo.com')
      const tokenB = await crearSesion('segunda@ejemplo.com')
      await request(server)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ variantId, quantity: 2 })
        .expect(201)

      expect(await carrito(tokenB)).toEqual({
        items: [],
        subtotal: 0,
        totalItems: 0,
        purchasableItems: 0,
      })
    })

    it('una persona no puede vaciar el carrito de otra, porque el identificador no va en la petición', async () => {
      const tokenA = await crearSesion('primera@ejemplo.com')
      const tokenB = await crearSesion('segunda@ejemplo.com')
      await request(server)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ variantId, quantity: 2 })
        .expect(201)

      await request(server)
        .delete('/api/cart')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200)

      expect((await carrito(tokenA)).totalItems).toBe(1)
    })

    it('la subida del carrito local tampoco toca el carrito de otro', async () => {
      const tokenA = await crearSesion('primera@ejemplo.com')
      const tokenB = await crearSesion('segunda@ejemplo.com')
      await request(server)
        .post('/api/cart/merge')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ items: [{ variantId, quantity: 2 }] })
        .expect(200)

      expect((await carrito(tokenA)).totalItems).toBe(0)
    })
  })

  describe('GET /api/cart/summary', () => {
    const resumen = async (token: string) =>
      (
        await request(server)
          .get('/api/cart/summary')
          .set('Authorization', `Bearer ${token}`)
          .expect(200)
      ).body as Record<string, unknown>

    it('devuelve un resumen a cero para quien no tiene carrito', async () => {
      const token = await crearSesion('persona@ejemplo.com')

      expect(await resumen(token)).toEqual({
        lines: [],
        subtotal: 0,
        tax: 0,
        shipping: 0,
        total: 0,
        isFreeShipping: false,
      })
    })

    it('devuelve el desglose completo con los precios del servidor', async () => {
      const token = await crearSesion('persona@ejemplo.com')
      await request(server)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ variantId, quantity: 2 })
        .expect(201)

      const cuerpo = await resumen(token)

      expect(cuerpo.subtotal).toBe(84000)
      expect(cuerpo.tax).toBe(15960)
      expect(cuerpo.shipping).toBe(10000)
      expect(cuerpo.total).toBe(109960)
    })

    it('el total es exactamente la suma de lo que muestra el desglose', async () => {
      const token = await crearSesion('persona@ejemplo.com')
      await request(server)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ variantId, quantity: 1 })
        .expect(201)

      const cuerpo = await resumen(token)

      expect(cuerpo.total).toBe(
        (cuerpo.subtotal as number) + (cuerpo.tax as number) + (cuerpo.shipping as number),
      )
    })

    it('marca el envio gratis cuando el subtotal alcanza el umbral', async () => {
      const token = await crearSesion('persona@ejemplo.com')
      await request(server)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ variantId, quantity: 4 })
        .expect(201)

      const cuerpo = await resumen(token)

      expect(cuerpo.isFreeShipping).toBe(true)
      expect(cuerpo.shipping).toBe(0)
      expect(cuerpo.total).toBe(199920)
    })

    it('lista las lineas con su nombre de cafe y su importe', async () => {
      const token = await crearSesion('persona@ejemplo.com')
      await request(server)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ variantId, quantity: 2 })
        .expect(201)

      const cuerpo = await resumen(token)

      expect(cuerpo.lines).toEqual([
        {
          variantId,
          coffeeName: 'Café del Carrito',
          unitPrice: 42000,
          quantity: 2,
          subtotal: 84000,
        },
      ])
    })

    it('exige token, porque el resumen es el carrito de alguien', async () => {
      await request(server).get('/api/cart/summary').expect(401)
    })
  })
})
