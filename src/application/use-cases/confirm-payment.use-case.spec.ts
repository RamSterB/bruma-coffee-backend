import { ConfirmPaymentUseCase, type ConfirmPaymentInput } from './confirm-payment.use-case'
import { CreateOrderUseCase } from './create-order.use-case'
import { SettlePaymentService } from './settle-payment.service'
import { GetOrderSummaryUseCase } from './get-order-summary.use-case'
import { FakeCartRepository } from '../../testing/fakes/fake-cart.repository'
import { FakeOrderRepository } from '../../testing/fakes/fake-order.repository'
import { FakePaymentRepository } from '../../testing/fakes/fake-payment.repository'
import { FakeCustomerRepository } from '../../testing/fakes/fake-customer.repository'
import { buildCoffeeVariant } from '../../testing/coffee.fixtures'
import { CardGateway } from '../../domain/ports/card-gateway.port'
import { ok, err, type Result } from '../../domain/result'
import { invalidWebhookSignatureError } from '../../domain/errors/payment.errors'
import type { AppError } from '../../domain/errors/app-error'
import type {
  GatewayTransaction,
  CreateTransactionInput,
} from '../../domain/ports/card-gateway.port'
import { cardGatewayConfig } from '../../config/card-gateway.config'

const CONFIG = { taxRate: 0.19, shippingFlatRate: 10000, freeShippingThreshold: 150000 }

class GatewayFirmado extends CardGateway {
  public firmaValida = true

  async createTransaction(
    input: CreateTransactionInput,
  ): Promise<Result<GatewayTransaction, AppError>> {
    return ok({ reference: 'ref-1', status: 'PENDING', amount: input.amountInCents })
  }

  async getTransactionStatus(): Promise<Result<GatewayTransaction, AppError>> {
    return ok({ reference: 'ref-1', status: 'PENDING', amount: 0 })
  }

  verifySignature(): Result<void, AppError> {
    return this.firmaValida ? ok(undefined) : err(invalidWebhookSignatureError())
  }
}

const entrega = {
  fullName: 'Persona Compradora',
  documentNumber: '1098765434',
  phone: '3001234567',
  address: 'Carrera 7 con Calle 72',
  city: 'Bogotá',
  department: 'Cundinamarca',
}

const montar = async () => {
  const carrito = new FakeCartRepository()
  const orders = new FakeOrderRepository()
  const payments = new FakePaymentRepository()
  const gateway = new GatewayFirmado()
  carrito.catalogo.set('v1', buildCoffeeVariant('v1', { price: 42000, stock: 10 }))
  carrito.nombresDeCafe.set('v1', 'Caturra')
  carrito.registrar('usuario-1', [{ variantId: 'v1', quantity: 2 }])

  const crear = new CreateOrderUseCase(
    orders,
    payments,
    new FakeCustomerRepository(),
    gateway,
    new GetOrderSummaryUseCase(carrito, CONFIG),
    cardGatewayConfig(),
  )
  const confirmar = new ConfirmPaymentUseCase(gateway, new SettlePaymentService(orders, payments))
  const creada = await crear.execute({
    userId: 'usuario-1',
    cardToken: 'tok_test_123',
    email: 'comprador@ejemplo.co',
    shipping: entrega,
  })

  if (!creada.ok) {
    throw creada.error
  }

  return { carrito, orders, payments, gateway, confirmar, orden: creada.value }
}

const evento = (over: Partial<ConfirmPaymentInput> = {}): ConfirmPaymentInput => ({
  providerReference: 'ref-1',
  status: 'APPROVED',
  rawEvent: { event: 'transaction.updated' },
  receivedAt: new Date('2026-09-27T12:00:00.000Z'),
  ...over,
})

describe('ConfirmPaymentUseCase', () => {
  it('rechaza el evento si la firma no cuadra, y no toca la orden', async () => {
    const { gateway, orders, confirmar } = await montar()
    gateway.firmaValida = false
    orders.stock.set('v1', 10)

    const resultado = await confirmar.execute(evento())

    expect(resultado.ok).toBe(false)
    expect(orders.all()[0]?.status).toBe('PENDING')
    expect(orders.stock.get('v1')).toBe(10)
  })

  it('paga la orden y descuenta el stock cuando el evento dice APPROVED', async () => {
    const { orders, confirmar, orden } = await montar()
    orders.stock.set('v1', 10)

    const resultado = await confirmar.execute(evento())

    expect(resultado.ok).toBe(true)
    await expect(orders.findById(orden.id)).resolves.toMatchObject({ status: 'PAID' })
    // Se piden 2 unidades de las 10 que había.
    expect(orders.stock.get('v1')).toBe(8)
  })

  it('crea el envío en el mismo momento que se paga, no antes', async () => {
    const { orders, confirmar, orden } = await montar()
    orders.stock.set('v1', 10)

    const resultado = await confirmar.execute(evento())

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) {
      return
    }
    expect(resultado.value.delivery?.orderId).toBe(orden.id)
    expect(resultado.value.delivery?.status).toBe('PENDING')
  })

  it('procesar el mismo evento dos veces no descuenta stock dos veces', async () => {
    const { orders, confirmar } = await montar()
    orders.stock.set('v1', 10)

    const primero = await confirmar.execute(evento())
    const segundo = await confirmar.execute(
      evento({ receivedAt: new Date('2026-09-27T12:05:00Z') }),
    )

    expect(primero.ok && primero.value.applied).toBe(true)
    expect(segundo.ok && segundo.value.applied).toBe(false)
    expect(orders.stock.get('v1')).toBe(8)
    expect(orders.pagosAplicados).toHaveLength(1)
  })

  it('no descuenta stock si el pago fue rechazado', async () => {
    const { orders, confirmar } = await montar()
    orders.stock.set('v1', 10)

    const resultado = await confirmar.execute(evento({ status: 'DECLINED' }))

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) {
      return
    }
    expect(resultado.value.order.status).toBe('FAILED')
    expect(orders.stock.get('v1')).toBe(10)
    expect(resultado.value.delivery).toBeNull()
  })

  it('trata ERROR y CANCELLED como fallo de la orden, igual que DECLINED', async () => {
    for (const estado of ['ERROR', 'CANCELLED'] as const) {
      const { orders, confirmar } = await montar()
      orders.stock.set('v1', 10)

      const resultado = await confirmar.execute(evento({ status: estado }))

      expect(resultado.ok && resultado.value.order.status).toBe('FAILED')
      expect(orders.stock.get('v1')).toBe(10)
    }
  })

  it('ignora un evento cuya referencia no conoce, sin descontar stock', async () => {
    const { orders, confirmar } = await montar()
    orders.stock.set('v1', 10)

    const resultado = await confirmar.execute(evento({ providerReference: 'ref-que-no-existe' }))

    expect(resultado.ok).toBe(false)
    if (resultado.ok) {
      return
    }
    expect(resultado.error.code).toBe('UNKNOWN_PAYMENT')
    expect(orders.stock.get('v1')).toBe(10)
  })

  it('deja la orden sin pagar si al confirmar ya no queda stock, y lo dice', async () => {
    const { orders, confirmar, orden } = await montar()
    orders.stock.set('v1', 1)

    const resultado = await confirmar.execute(evento())

    expect(resultado.ok).toBe(false)
    if (resultado.ok) {
      return
    }
    expect(resultado.error.code).toBe('INSUFFICIENT_STOCK')
    await expect(orders.findById(orden.id)).resolves.toMatchObject({ status: 'PENDING' })
  })

  it('guarda el evento tal cual llegó, para poder auditarlo', async () => {
    const { orders, payments, confirmar } = await montar()
    orders.stock.set('v1', 10)

    await confirmar.execute(
      evento({ rawEvent: { event: 'transaction.updated', data: { id: 'x' } } }),
    )

    const guardado = await payments.findByProviderReference('ref-1')
    expect(guardado?.rawEvent).toEqual({ event: 'transaction.updated', data: { id: 'x' } })
  })

  it('no guarda el número de la tarjeta aunque venga en el evento', async () => {
    const { orders, payments, confirmar } = await montar()
    orders.stock.set('v1', 10)

    await confirmar.execute(
      evento({
        rawEvent: {
          event: 'transaction.updated',
          data: { card_number: '4111111111111111', status: 'APPROVED' },
        },
      }),
    )

    const guardado = await payments.findByProviderReference('ref-1')
    // El evento se guarda para poder auditar, pero un PAN dentro de él se elimina
    // antes de tocar la base de datos: el requisito es que el número no se
    // persiste, y "la pasarela no lo manda" no es una garantía que se pueda dar.
    expect(JSON.stringify(guardado)).not.toContain('4111111111111111')
    expect(JSON.stringify(guardado)).toContain('APPROVED')
  })

  it('limpia el número de la tarjeta aunque venga anidado en un array', async () => {
    const { orders, payments, confirmar } = await montar()
    orders.stock.set('v1', 10)

    await confirmar.execute(
      evento({
        rawEvent: {
          data: { attempts: [{ card: { number: '5555555555554444' } }] },
        },
      }),
    )

    const guardado = await payments.findByProviderReference('ref-1')
    expect(JSON.stringify(guardado)).not.toContain('5555555555554444')
  })

  it('un evento PENDING no resuelve el pago ni toca el stock', async () => {
    const { orders, confirmar, orden } = await montar()
    orders.stock.set('v1', 10)

    const resultado = await confirmar.execute(evento({ status: 'PENDING' }))

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) {
      return
    }
    // La pasarela avisa en cuanto nace la transacción, antes de saber nada. Aplicar
    // ese estado como si fuera un veredicto cobraría sin que nadie haya pagado.
    expect(resultado.value.applied).toBe(false)
    expect(orders.stock.get('v1')).toBe(10)
    await expect(orders.findById(orden.id)).resolves.toMatchObject({ status: 'PENDING' })
  })

  it('si la orden de un evento PENDING ya no existe, no dice que el pago se comprobó', async () => {
    const { orders, confirmar } = await montar()
    orders.reiniciar()

    const resultado = await confirmar.execute(evento({ status: 'PENDING' }))

    expect(resultado.ok).toBe(false)
    if (resultado.ok) {
      return
    }
    expect(resultado.error.code).toBe('UNKNOWN_PAYMENT')
  })
})
