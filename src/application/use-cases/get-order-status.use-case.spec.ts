import { GetOrderStatusUseCase } from './get-order-status.use-case'
import { FakeOrderRepository } from '../../testing/fakes/fake-order.repository'
import { FakePaymentRepository } from '../../testing/fakes/fake-payment.repository'
import { Order, type Order as OrdenCompleta } from '../../domain/entities/order.entity'
import type { Payment } from '../../domain/entities/payment.entity'
import { randomUUID } from 'node:crypto'
import { CardGateway } from '../../domain/ports/card-gateway.port'
import type { Result } from '../../domain/result'
import type { AppError } from '../../domain/errors/app-error'
import type { GatewayPaymentStatus } from '../../domain/entities/payment.entity'
import { SettlePaymentService } from './settle-payment.service'
import { err, ok } from '../../domain/result'
import { gatewayUnavailableError } from '../../domain/errors/payment.errors'

/**
 * Doble de la pasarela a nivel de dominio. Se anota qué referencias se consultan porque
 * lo que importa aqui es justo eso: que se pregunte por el pago pendiente y no por otro.
 */
class FakeCardGateway extends CardGateway {
  consultadas: string[] = []
  estadoDeLaTransaccion: 'APPROVED' | 'DECLINED' | 'PENDING' = 'APPROVED'
  fallaLaConsulta = false

  async createTransaction(): Promise<never> {
    throw new Error('esta prueba no crea transacciones')
  }

  async getTransactionStatus(
    reference: string,
  ): Promise<
    Result<{ reference: string; status: GatewayPaymentStatus; amount: number }, AppError>
  > {
    this.consultadas.push(reference)

    if (this.fallaLaConsulta) {
      return err(gatewayUnavailableError('la pasarela no contesta'))
    }

    return ok({ reference, status: this.estadoDeLaTransaccion, amount: 5998000 })
  }

  verifySignature() {
    return ok(undefined)
  }
}

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
  const gateway = new FakeCardGateway()
  const settle = new SettlePaymentService(orders, payments)
  const useCase = new GetOrderStatusUseCase(orders, payments, gateway, settle)
  const pendiente = orden(COMPRADORA)
  const guardada = await orders.save(pendiente)
  // Sin stock la orden se queda en PENDING aunque el pago se apruebe, porque no se puede
  // descontar lo que no hay. Aqui no interesa el stock, asi que se da.
  orders.repartirStock(pendiente.items, 50)

  return { orders, payments, gateway, useCase, guardada }
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

  it('pregunta a la pasarela si el pago sigue pendiente, y aplica lo que conteste', async () => {
    // **El aviso de la pasarela no está registrado en el despliegue, así que el pago se
    // queda en PENDING para siempre** aunque la pasarela lo haya aprobado. Quien mira el
    // estado es quien pregunta: si al pedirle el estado se le consulta a la pasarela, el
    // pago se resuelve sin depender de que ese aviso llegue.
    const { payments, gateway, useCase, guardada } = await montar()
    await payments.save(
      pago(guardada.id, {
        providerReference: 'tx-pendiente',
        status: 'PENDING',
        createdAt: new Date(Date.now() - 60_000),
      }),
    )
    gateway.estadoDeLaTransaccion = 'APPROVED'

    const resultado = await useCase.execute(guardada.id, COMPRADORA)

    expect(gateway.consultadas).toEqual(['tx-pendiente'])
    expect(resultado.ok && resultado.value.paymentStatus).toBe('APPROVED')
  })

  it('no pregunta a la pasarela si el pago ya está resuelto', async () => {
    const { payments, gateway, useCase, guardada } = await montar()
    await payments.save(pago(guardada.id, { providerReference: 'tx-listo', status: 'APPROVED' }))
    gateway.estadoDeLaTransaccion = 'APPROVED'

    await useCase.execute(guardada.id, COMPRADORA)

    expect(gateway.consultadas).toEqual([])
  })

  it('no pregunta a la pasarela si el pago es muy reciente, para no molestarla en cada consulta', async () => {
    const { payments, gateway, useCase, guardada } = await montar()
    await payments.save(
      pago(guardada.id, {
        providerReference: 'tx-nuevo',
        status: 'PENDING',
        createdAt: new Date(),
      }),
    )
    gateway.estadoDeLaTransaccion = 'APPROVED'

    await useCase.execute(guardada.id, COMPRADORA)

    expect(gateway.consultadas).toEqual([])
  })

  it('si la pasarela contesta que sigue pendiente, la orden sigue pendiente', async () => {
    const { payments, gateway, useCase, guardada } = await montar()
    await payments.save(
      pago(guardada.id, {
        providerReference: 'tx-pendiente',
        status: 'PENDING',
        createdAt: new Date(Date.now() - 60_000),
      }),
    )
    gateway.estadoDeLaTransaccion = 'PENDING'

    const resultado = await useCase.execute(guardada.id, COMPRADORA)

    expect(resultado.ok && resultado.value.paymentStatus).toBe('PENDING')
  })

  it('si la pasarela no contesta, se responde con lo que hay, sin romper la consulta', async () => {
    const { payments, gateway, useCase, guardada } = await montar()
    await payments.save(
      pago(guardada.id, {
        providerReference: 'tx-pendiente',
        status: 'PENDING',
        createdAt: new Date(Date.now() - 60_000),
      }),
    )
    gateway.fallaLaConsulta = true

    const resultado = await useCase.execute(guardada.id, COMPRADORA)

    expect(resultado.ok && resultado.value.paymentStatus).toBe('PENDING')
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
