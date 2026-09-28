import type { DataSource } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { resetTestDatabase } from '../../testing/test-database'
import { TypeOrmOrderRepository } from './order.typeorm.repository'
import { TypeOrmPaymentRepository } from './payment.typeorm.repository'
import { PaymentTypeOrmEntity } from './payment.typeorm.entity'
import { CoffeeTypeOrmEntity } from './coffee.typeorm.entity'
import { CoffeeVariantTypeOrmEntity } from './coffee-variant.typeorm.entity'
import { CustomerTypeOrmEntity } from './customer.typeorm.entity'
import { UserTypeOrmEntity } from './user.typeorm.entity'
import { UserRole } from '../../domain/enums/user-role.enum'
import { Order, type OrderItem } from '../../domain/entities/order.entity'
import type { Payment } from '../../domain/entities/payment.entity'

/**
 * El repositorio de órdenes contra PostgreSQL de verdad, sin supertest y sin HTTP.
 *
 * Lo que se comprueba aquí es lo que ningún doble puede: el bloqueo de la fila, la
 * resta condicionada del stock y el UNIQUE de la referencia. Son las tres cosas de
 * las que depende que un cobro no descuente stock dos veces, y las tres son
 * comportamiento de la base de datos.
 */
describe('persistencia de órdenes', () => {
  let dataSource: DataSource
  let orders: TypeOrmOrderRepository
  let payments: TypeOrmPaymentRepository
  let customerId: string
  let userId: string
  let variantId: string

  const crearOrden = (cantidad = 2): Order => {
    const items: OrderItem[] = [
      {
        variantId,
        coffeeName: 'Caturra',
        weightGrams: 250,
        unitPrice: 42000,
        quantity: cantidad,
        lineTotal: 42000 * cantidad,
      },
    ]

    return Order.create({
      id: randomUUID(),
      orderNumber: 'BC-20260927-0001',
      userId,
      customerId,
      customer: { name: 'Persona Compradora', documentNumber: '1098765434', phone: '3001234567' },
      shipping: {
        fullName: 'Persona Compradora',
        documentNumber: '1098765434',
        phone: '3001234567',
        address: 'Carrera 7 con Calle 72',
        city: 'Bogotá',
        department: 'Cundinamarca',
      },
      items,
      subtotal: 42000 * cantidad,
      taxAmount: Math.round(42000 * cantidad * 0.19),
      shippingAmount: 10000,
      total: 42000 * cantidad + Math.round(42000 * cantidad * 0.19) + 10000,
      createdAt: new Date('2026-09-27T10:00:00.000Z'),
    })
  }

  const guardarOrden = async (cantidad = 2, stock = 10): Promise<Order> => {
    await dataSource.getRepository(CoffeeVariantTypeOrmEntity).update(variantId, { stock })
    const order = crearOrden(cantidad)

    return orders.save(order)
  }

  const stockActual = async (): Promise<number> => {
    const variante = await dataSource
      .getRepository(CoffeeVariantTypeOrmEntity)
      .findOneByOrFail({ id: variantId })

    return variante.stock
  }

  const pago = (orderId: string, referencia = 'tx-1'): Payment => ({
    id: randomUUID(),
    orderId,
    provider: 'card_gateway',
    providerReference: referencia,
    token: 'tok_test_123',
    status: 'PENDING',
    amount: 10996000,
    rawEvent: null,
    createdAt: new Date('2026-09-27T10:00:01.000Z'),
    updatedAt: new Date('2026-09-27T10:00:01.000Z'),
  })

  const aprobar = (orderId: string) =>
    orders.applyPaymentOutcome({
      orderId,
      paymentStatus: 'APPROVED',
      rawEvent: { event: 'transaction.updated' },
      receivedAt: new Date('2026-09-27T10:05:00.000Z'),
    })

  beforeAll(async () => {
    dataSource = await resetTestDatabase()
    orders = new TypeOrmOrderRepository(dataSource)
    payments = new TypeOrmPaymentRepository(dataSource.getRepository(PaymentTypeOrmEntity))
  })

  afterAll(async () => {
    await dataSource.destroy()
  })

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE deliveries, payments, order_items, orders, coffee_variants, coffees, customers RESTART IDENTITY CASCADE',
    )

    // Usuario y cliente son dos filas distintas, y por eso `orders` tiene dos claves:
    // el usuario es la cuenta desde la que se compró y el cliente es la persona a la
    // que se entrega. Aquí se crean las dos porque las dos las exige el esquema.
    const clientes = dataSource.getRepository(CustomerTypeOrmEntity)
    const cliente = await clientes.save(
      clientes.create({ email: `comprador-${Date.now()}@ejemplo.co`, fullName: 'Compradora' }),
    )
    customerId = cliente.id

    const usuarios = dataSource.getRepository(UserTypeOrmEntity)
    const usuario = await usuarios.save(
      usuarios.create({
        email: `comprador-${Date.now()}@ejemplo.co`,
        passwordHash: 'hash-de-prueba',
        fullName: 'Compradora',
        role: UserRole.CUSTOMER,
      }),
    )
    userId = usuario.id

    const cafes = dataSource.getRepository(CoffeeTypeOrmEntity)
    const cafe = await cafes.save(
      cafes.create({
        name: `Caturra ${Date.now()}`,
        description: 'Notas de cata',
        // Los tres son enums del dominio y la entidad los tipa: sin el `as never`
        // el `create` no encuentra sobrecarga, que es un ruido de tipos, no un error.
        roastLevel: 'medium' as never,
        process: 'washed' as never,
        region: 'huila' as never,
        tastingNotes: ['cacao'],
        isActive: true,
      }),
    )
    const variantes = dataSource.getRepository(CoffeeVariantTypeOrmEntity)
    const variante = await variantes.save(
      variantes.create({ coffeeId: cafe.id, weightGrams: 250, price: '42000', stock: 10 }),
    )
    variantId = variante.id
  })

  describe('guardar y leer', () => {
    it('guarda la orden con sus líneas y la vuelve a leer igual', async () => {
      const guardada = await guardarOrden()

      const leida = await orders.findById(guardada.id)

      expect(leida?.orderNumber).toBe('BC-20260927-0001')
      expect(leida?.items).toHaveLength(1)
      expect(leida?.items[0]?.coffeeName).toBe('Caturra')
      expect(leida?.items[0]?.unitPrice).toBe(42000)
    })

    it('la encuentra por su número de orden, que es lo que ve la persona', async () => {
      const guardada = await guardarOrden()

      const porNumero = await orders.findByOrderNumber(guardada.orderNumber)

      expect(porNumero?.id).toBe(guardada.id)
    })

    it('devuelve null en vez de fallar cuando no existe', async () => {
      expect(await orders.findById(randomUUID())).toBeNull()
      expect(await orders.findByOrderNumber('BC-19990101-0001')).toBeNull()
    })

    it('da números de orden distintos a dos llamadas seguidas', async () => {
      const primero = await orders.nextOrderNumber(new Date('2026-09-27T10:00:00.000Z'))
      const segundo = await orders.nextOrderNumber(new Date('2026-09-27T10:00:00.000Z'))

      expect(primero).not.toBe(segundo)
      expect(primero).toMatch(/^BC-20260927-\d{4}$/)
    })

    it('no admite dos órdenes con el mismo número, que es la garantía del UNIQUE', async () => {
      await guardarOrden()

      const repetida: Order = Order.create({
        id: randomUUID(),
        orderNumber: 'BC-20260927-0001',
        userId,
        customerId,
        customer: { name: 'Otra', documentNumber: '1098765434', phone: '3001234567' },
        shipping: {
          fullName: 'Otra',
          documentNumber: '1098765434',
          phone: '3001234567',
          address: 'Otra calle',
          city: 'Bogotá',
          department: 'Cundinamarca',
        },
        items: [
          {
            variantId,
            coffeeName: 'Caturra',
            weightGrams: 250,
            unitPrice: 100,
            quantity: 1,
            lineTotal: 100,
          },
        ],
        subtotal: 100,
        taxAmount: 19,
        shippingAmount: 0,
        total: 119,
        createdAt: new Date(),
      })

      await expect(orders.save(repetida)).rejects.toThrow()
    })
  })

  describe('cobro aprobado', () => {
    it('paga la orden, descuenta el stock y crea el envío en la misma pasada', async () => {
      const guardada = await guardarOrden(2, 10)

      const resultado = await aprobar(guardada.id)

      expect(resultado.applied).toBe(true)
      expect(resultado.order.status).toBe('PAID')
      expect(resultado.order.paymentStatus).toBe('APPROVED')
      expect(resultado.delivery?.status).toBe('PENDING')
      expect(await stockActual()).toBe(8)
    })

    it('aplicarlo dos veces no descuenta el stock dos veces', async () => {
      const guardada = await guardarOrden(2, 10)
      await aprobar(guardada.id)

      const segundo = await aprobar(guardada.id)

      expect(segundo.applied).toBe(false)
      expect(await stockActual()).toBe(8)
      const envios = await dataSource.query('SELECT count(*)::int AS total FROM deliveries')
      expect(envios[0]?.total).toBe(1)
    })

    it('no toca nada y avisa cuando no queda stock', async () => {
      const guardada = await guardarOrden(5, 3)

      const resultado = await aprobar(guardada.id)

      expect(resultado.applied).toBe(false)
      expect(resultado.shortage[0]?.coffeeName).toBe('Caturra')
      expect(await stockActual()).toBe(3)
      const leida = await orders.findById(guardada.id)
      expect(leida?.status).toBe('PENDING')
    })

    it('el stock nunca queda en negativo', async () => {
      const guardada = await guardarOrden(5, 3)
      await aprobar(guardada.id)

      expect(await stockActual()).toBe(3)
    })
  })

  describe('cobro rechazado', () => {
    it('deja la orden fallida sin descontar stock y sin envío', async () => {
      const guardada = await guardarOrden(2, 10)

      const resultado = await orders.applyPaymentOutcome({
        orderId: guardada.id,
        paymentStatus: 'DECLINED',
        rawEvent: null,
        receivedAt: new Date(),
      })

      expect(resultado.order.status).toBe('FAILED')
      expect(resultado.delivery).toBeNull()
      expect(await stockActual()).toBe(10)
    })
  })

  describe('markAsFailed', () => {
    it('deja la orden en FAILED sin tocar el stock, porque no se cobró', async () => {
      const guardada = await guardarOrden(2, 10)

      await orders.markAsFailed(guardada.id, new Date())

      const leida = await orders.findById(guardada.id)
      expect(leida?.status).toBe('FAILED')
      expect(await stockActual()).toBe(10)
    })

    it('no falla si la orden no existe', async () => {
      await expect(orders.markAsFailed(randomUUID(), new Date())).resolves.toBeUndefined()
    })
  })

  describe('envíos', () => {
    it('no hay envío hasta que el pago se aprueba', async () => {
      const guardada = await guardarOrden()

      expect(await orders.findDeliveryByOrderId(guardada.id)).toBeNull()

      await aprobar(guardada.id)

      const envio = await orders.findDeliveryByOrderId(guardada.id)
      expect(envio?.status).toBe('PENDING')
      expect(envio?.orderId).toBe(guardada.id)
    })
  })

  describe('pagos', () => {
    it('guarda el pago y lo encuentra por la referencia de la pasarela', async () => {
      const guardada = await guardarOrden()
      const guardado = await payments.save(pago(guardada.id))

      const encontrado = await payments.findByProviderReference('tx-1')

      expect(guardado.token).toBe('tok_test_123')
      expect(encontrado?.orderId).toBe(guardada.id)
      expect(encontrado?.amount).toBe(10996000)
    })

    it('devuelve null si la referencia no existe', async () => {
      expect(await payments.findByProviderReference('tx-que-no-existe')).toBeNull()
    })

    it('la misma referencia dos veces choca contra el índice único', async () => {
      const guardada = await guardarOrden()
      await payments.save(pago(guardada.id, 'tx-repetida'))

      // El UNIQUE es la idempotencia: el código no puede saber que dos peticiones
      // del mismo evento llegaron a la vez, la base sí.
      await expect(payments.save(pago(guardada.id, 'tx-repetida'))).rejects.toThrow()
    })

    it('lista los pagos de una orden', async () => {
      const guardada = await guardarOrden()
      await payments.save(pago(guardada.id, 'tx-1'))
      await payments.save(pago(guardada.id, 'tx-2'))

      const delPedido = await payments.findByOrderId(guardada.id)

      expect(delPedido.map((p) => p.providerReference).sort()).toEqual(['tx-1', 'tx-2'])
    })

    it('solo devuelve los pendientes que ya tienen edad', async () => {
      const guardada = await guardarOrden()
      // El reciente nace ahora, que es lo que lo hace reciente. El helper pone una
      // hora fija, asi que hay que sobreescribirla o los dos saldrian antiguos.
      const reciente = { ...pago(guardada.id, 'tx-reciente'), createdAt: new Date() }
      const viejo = {
        ...pago(guardada.id, 'tx-viejo'),
        createdAt: new Date('2026-09-27T10:00:00.000Z'),
      }
      await payments.save(reciente)
      await payments.save(viejo)

      const pendientes = await payments.findPendingOlderThan(
        new Date('2026-09-27T12:00:00.000Z'),
        10,
      )

      expect(pendientes.map((p) => p.providerReference)).toEqual(['tx-viejo'])
    })

    it('un pago ya resuelto no sale como pendiente, que es lo que evita repetir el descuento', async () => {
      const guardada = await guardarOrden()
      const pagado = { ...pago(guardada.id), status: 'APPROVED' as const }
      await payments.save(pagado)

      expect(
        await payments.findPendingOlderThan(new Date('2030-01-01T00:00:00.000Z'), 10),
      ).toHaveLength(0)
    })
  })

  describe('el historial de una persona', () => {
    it('devuelve solo las suyas, de la más reciente a la más antigua', async () => {
      await guardarOrden(2, 10)
      const otra = await orders.nextOrderNumber(new Date('2026-09-26T10:00:00.000Z'))
      await orders.save(
        Order.create({
          id: randomUUID(),
          orderNumber: otra,
          userId,
          customerId,
          customer: { name: 'Compradora', documentNumber: '1098765434', phone: '3001234567' },
          shipping: {
            fullName: 'Compradora',
            documentNumber: '1098765434',
            phone: '3001234567',
            address: 'Otra calle',
            city: 'Bogotá',
            department: 'Cundinamarca',
          },
          items: [
            {
              variantId,
              coffeeName: 'Caturra',
              weightGrams: 250,
              unitPrice: 42000,
              quantity: 1,
              lineTotal: 42000,
            },
          ],
          subtotal: 42000,
          taxAmount: 7980,
          shippingAmount: 10000,
          total: 59980,
          createdAt: new Date('2026-09-26T10:00:00.000Z'),
        }),
      )

      const suyas = await orders.findByUserId(userId, 50)

      expect(suyas).toHaveLength(2)
      expect(suyas[0]?.orderNumber).toBe(otra)
    })

    it('no devuelve ni una orden de otra persona', async () => {
      await guardarOrden(2, 10)
      // El aislamiento se comprueba con datos de verdad en la base, no con un doble:
      // el filtro va en el WHERE y eso es justo lo que hay que verificar.
      const intrusion = await orders.findByUserId('99999999-9999-9999-9999-999999999999', 50)

      expect(intrusion).toHaveLength(0)
    })

    it('respeta el límite pedido', async () => {
      await guardarOrden(2, 10)

      const una = await orders.findByUserId(userId, 1)

      expect(una).toHaveLength(1)
    })
  })
})
