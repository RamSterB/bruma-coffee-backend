import { GetOrderStatusUseCase } from './get-order-status.use-case'
import { FakeOrderRepository } from '../../testing/fakes/fake-order.repository'
import { FakePaymentRepository } from '../../testing/fakes/fake-payment.repository'
import { Order, type Order as OrdenCompleta } from '../../domain/entities/order.entity'
import type { Payment } from '../../domain/entities/payment.entity'
import { randomUUID } from 'node:crypto'

const COMPRADORA = '11111111-1111-1111-1111-111111111111'
const OTRA = '22222222-2222-2222-2222-222222222222'

const orden = (userId: string, cambios: Partial<OrdenCompleta> = {}): OrdenCompleta => {
  const base = Order.create({
    id: randomUUID(),
    orderNumber: 'BC-20260927-0001',
    userId,
    customerId: userId,
    customer: { name: 'Compradora', documentNumber: '1098765434', phone: '3001234567' },
    shipping: {
      fullName: 'Compradora',
      documentNumber: '1098765434',
      phone: '3001234567',
      address: 'Carrera 7 con Calle 72',
      city: 'Bogotá',
      department: 'Cundinamarca',
    },
    items: [
      {
        variantId: 'v1',
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
    createdAt: new Date('2026-09-27T10:00:00.000Z'),
  })

  return { ...base, ...cambios }
}

const pago = (orderId: string, over: Partial<Payment> = {}): Payment => ({
  id: randomUUID(),
  orderId,
  provider: 'card_gateway',
  providerReference: 'tx-1',
  token: 'tok_test_123',
  status: 'PENDING',
  amount: 5998000,
  rawEvent: null,
  createdAt: new Date('2026-09-27T10:00:01.000Z'),
  updatedAt: new Date('2026-09-27T10:00:01.000Z'),
  ...over,
})

const montar = async () => {
  const orders = new FakeOrderRepository()
  const payments = new FakePaymentRepository()
  const useCase = new GetOrderStatusUseCase(orders, payments)
  const guardada = await orders.save(orden(COMPRADORA))

  return { orders, payments, useCase, guardada }
}

describe('GetOrderStatusUseCase', () => {
  it('devuelve el estado de la orden de quien la pide', async () => {
    const { useCase, guardada } = await montar()

    const resultado = await useCase.execute(guardada.id, COMPRADORA)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) {
      return
    }
    expect(resultado.value.orderNumber).toBe('BC-20260927-0001')
    expect(resultado.value.total).toBe(59980)
  })

  it('da 404 para una orden de otra persona, y no 403', async () => {
    const { useCase, guardada } = await montar()

    const resultado = await useCase.execute(guardada.id, OTRA)

    expect(resultado.ok).toBe(false)
    if (resultado.ok) {
      return
    }
    // 403 confirmaría que ese identificador existe, y con eso basta para recorrer
    // los pedidos de la tienda probando ids.
    expect(resultado.error.status).toBe(404)
    expect(resultado.error.code).toBe('ORDER_NOT_FOUND')
  })

  it('da 404 también si la orden no existe', async () => {
    const { useCase } = await montar()

    const resultado = await useCase.execute(randomUUID(), COMPRADORA)

    expect(resultado.ok).toBe(false)
  })

  it('manda el estado del último pago, que es el que manda', async () => {
    const { payments, useCase, guardada } = await montar()
    await payments.save(pago(guardada.id, { providerReference: 'tx-1', status: 'PENDING' }))
    await payments.save(pago(guardada.id, { providerReference: 'tx-2', status: 'APPROVED' }))

    const resultado = await useCase.execute(guardada.id, COMPRADORA)

    expect(resultado.ok && resultado.value.paymentStatus).toBe('APPROVED')
  })

  it('sin pagos usa el estado que tiene la orden', async () => {
    const { useCase, guardada } = await montar()

    const resultado = await useCase.execute(guardada.id, COMPRADORA)

    expect(resultado.ok && resultado.value.paymentStatus).toBe('PENDING')
  })

  it('incluye el envío cuando ya existe', async () => {
    const { orders, useCase, guardada } = await montar()
    // El fake descuenta stock de verdad, así que sin stock la confirmación se queda
    // corta y la orden no se paga. Es el mismo comportamiento que el adaptador real.
    orders.stock.set('v1', 10)
    await orders.applyPaymentOutcome({
      orderId: guardada.id,
      paymentStatus: 'APPROVED',
      rawEvent: null,
      receivedAt: new Date('2026-09-27T10:05:00.000Z'),
    })

    const resultado = await useCase.execute(guardada.id, COMPRADORA)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) {
      return
    }
    expect(resultado.value.status).toBe('PAID')
    expect(resultado.value.delivery).toEqual({
      status: 'PENDING',
      carrier: null,
      trackingCode: null,
    })
  })

  it('sin envío devuelve null, que es distinto de un envío vacío', async () => {
    const { useCase, guardada } = await montar()

    const resultado = await useCase.execute(guardada.id, COMPRADORA)

    expect(resultado.ok && resultado.value.delivery).toBeNull()
  })
})
