import { GetOrdersUseCase } from './get-orders.use-case'
import { FakeOrderRepository } from '../../testing/fakes/fake-order.repository'
import { Order, type OrderItem } from '../../domain/entities/order.entity'
import { randomUUID } from 'node:crypto'

const YO = '11111111-1111-1111-1111-111111111111'
const OTRO = '22222222-2222-2222-2222-222222222222'

const linea = (variantId: string): OrderItem => ({
  variantId,
  coffeeName: 'Caturra',
  weightGrams: 250,
  unitPrice: 42000,
  quantity: 1,
  lineTotal: 42000,
})

const orden = (userId: string, orderNumber: string, creada: string): Order => {
  const base = Order.create({
    id: randomUUID(),
    orderNumber,
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
    items: [linea(`v-${orderNumber}`)],
    subtotal: 42000,
    taxAmount: 7980,
    shippingAmount: 10000,
    total: 59980,
    createdAt: new Date(creada),
  })

  return base
}

const montar = async () => {
  const orders = new FakeOrderRepository()
  await orders.save(orden(YO, 'BC-20260901-0001', '2026-09-01T10:00:00.000Z'))
  await orders.save(orden(OTRO, 'BC-20260902-0001', '2026-09-02T10:00:00.000Z'))
  await orders.save(orden(YO, 'BC-20260903-0001', '2026-09-03T10:00:00.000Z'))

  return { orders, useCase: new GetOrdersUseCase(orders) }
}

describe('GetOrdersUseCase', () => {
  it('devuelve solo las órdenes de quien pregunta', async () => {
    // El historial es la pantalla donde más se nota un fallo de aislamiento: un número
    // de orden ajeno y un total que no es el suyo son datos de otra persona.
    const { useCase } = await montar()

    const resultado = await useCase.execute(YO)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) {
      return
    }
    expect(resultado.value.map((o) => o.orderNumber)).toEqual([
      'BC-20260903-0001',
      'BC-20260901-0001',
    ])
  })

  it('las trae de la más reciente a la más antigua', async () => {
    const { useCase } = await montar()

    const resultado = await useCase.execute(YO)

    expect(resultado.ok && resultado.value[0]?.orderNumber).toBe('BC-20260903-0001')
  })

  it('devuelve una lista vacía, y no un error, cuando no hay compras', async () => {
    const orders = new FakeOrderRepository()
    const useCase = new GetOrdersUseCase(orders)

    const resultado = await useCase.execute('usuario-sin-compras')

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.value).toEqual([])
    }
  })

  it('cada orden lleva lo justo para identificarla: número, estado, total y fecha', async () => {
    const { useCase } = await montar()

    const resultado = await useCase.execute(YO)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) {
      return
    }
    const primera = resultado.value[0]
    expect(primera?.orderNumber).toBe('BC-20260903-0001')
    expect(primera?.status).toBe('PENDING')
    expect(primera?.total).toBe(59980)
    expect(primera?.items).toHaveLength(1)
    // Y nada más: la lista no lleva dirección ni documento, que no hacen falta para
    // saber qué se pidió y no tiene sentido volver a exponerlos en otra pantalla.
    expect(Object.keys(primera ?? {}).sort()).toEqual([
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
