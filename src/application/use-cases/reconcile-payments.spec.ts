import { ReconcilePendingPaymentsUseCase } from './confirm-payment.use-case'
import { SettlePaymentService } from './settle-payment.service'
import { CreateOrderUseCase } from './create-order.use-case'
import { GetOrderSummaryUseCase } from './get-order-summary.use-case'
import { FakeCartRepository } from '../../testing/fakes/fake-cart.repository'
import { FakeOrderRepository } from '../../testing/fakes/fake-order.repository'
import { FakePaymentRepository } from '../../testing/fakes/fake-payment.repository'
import { FakeCustomerRepository } from '../../testing/fakes/fake-customer.repository'
import { buildCoffeeVariant } from '../../testing/coffee.fixtures'
import { CardGateway } from '../../domain/ports/card-gateway.port'
import { err, ok, type Result } from '../../domain/result'
import { cardGatewayConfig } from '../../config/card-gateway.config'
import type { AppError } from '../../domain/errors/app-error'
import type { GatewayTransaction } from '../../domain/ports/card-gateway.port'
import type { GatewayPaymentStatus } from '../../domain/entities/payment.entity'
import { gatewayUnavailableError } from '../../domain/errors/payment.errors'

const CONFIG = { taxRate: 0.19, shippingFlatRate: 10000, freeShippingThreshold: 150000 }

class GatewayQueResponde extends CardGateway {
  public consulta: { reference: string }[] = []
  public estadoEnLaPasarela: GatewayPaymentStatus = 'APPROVED'
  /** Simula que la pasarela no responde a la consulta. */
  public consultaCaida = false

  async createTransaction(input: {
    amountInCents: number
  }): Promise<Result<GatewayTransaction, AppError>> {
    return ok({ reference: 'ref-1', status: 'PENDING', amount: input.amountInCents })
  }

  async getTransactionStatus(reference: string): Promise<Result<GatewayTransaction, AppError>> {
    this.consulta.push({ reference })

    if (this.consultaCaida) {
      return err(gatewayUnavailableError('la pasarela no responde'))
    }

    return ok({ reference, status: this.estadoEnLaPasarela, amount: 1000 })
  }

  verifySignature(): Result<void, AppError> {
    return ok(undefined)
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
  const gateway = new GatewayQueResponde()
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
  const creada = await crear.execute({
    userId: 'usuario-1',
    cardToken: 'tok_test_123',
    email: 'comprador@ejemplo.co',
    shipping: entrega,
  })

  if (!creada.ok) {
    throw creada.error
  }

  return {
    orders,
    payments,
    gateway,
    reconciliar: new ReconcilePendingPaymentsUseCase(
      payments,
      gateway,
      new SettlePaymentService(orders, payments),
    ),
  }
}

describe('ReconcilePendingPaymentsUseCase', () => {
  it('pregunta por un pago pendiente y lo paga si la pasarela dice que se aprobó', async () => {
    const { orders, payments, gateway, reconciliar } = await montar()
    orders.stock.set('v1', 10)
    // El pago es antiguo, que es la condición para mirarlo: uno recién creado puede
    // que la pasarela todavía no haya decidido.
    const viejo = payments.all()[0]
    if (viejo !== undefined) {
      viejo.createdAt = new Date('2026-09-27T10:00:00.000Z')
    }

    const resultado = await reconciliar.execute({ olderThan: new Date('2026-09-27T12:00:00.000Z') })

    expect(gateway.consulta).toEqual([{ reference: 'ref-1' }])
    expect(resultado.ok && resultado.value.aplicados).toBe(1)
    expect(orders.stock.get('v1')).toBe(8)
  })

  it('no pregunta por un pago que aún no tiene edad, porque la pasarela puede no saber', async () => {
    const { gateway, reconciliar } = await montar()

    await reconciliar.execute({ olderThan: new Date('2020-01-01T00:00:00.000Z') })

    expect(gateway.consulta).toHaveLength(0)
  })

  it('deja el pago como estaba si la pasarela todavía dice PENDING', async () => {
    const { orders, payments, gateway, reconciliar } = await montar()
    orders.stock.set('v1', 10)
    gateway.estadoEnLaPasarela = 'PENDING'
    const viejo = payments.all()[0]
    if (viejo !== undefined) {
      viejo.createdAt = new Date('2026-09-27T10:00:00.000Z')
    }

    const resultado = await reconciliar.execute({ olderThan: new Date('2026-09-27T12:00:00.000Z') })

    expect(resultado.ok && resultado.value.aplicados).toBe(0)
    expect(orders.stock.get('v1')).toBe(10)
  })

  it('corregir el estado no toca el stock dos veces si se repite', async () => {
    const { orders, payments, reconciliar } = await montar()
    orders.stock.set('v1', 10)
    const viejo = payments.all()[0]
    if (viejo !== undefined) {
      viejo.createdAt = new Date('2026-09-27T10:00:00.000Z')
    }
    const corte = { olderThan: new Date('2026-09-27T12:00:00.000Z') }

    const primero = await reconciliar.execute(corte)
    const segundo = await reconciliar.execute(corte)

    expect(primero.ok && primero.value.aplicados).toBe(1)
    // La segunda pasada ya no lo encuentra pendiente, porque el pago quedó APPROVED.
    expect(segundo.ok && segundo.value.revisados).toBe(0)
    expect(orders.stock.get('v1')).toBe(8)
  })

  it('cuenta los que no pudo consultar sin abandonar el resto', async () => {
    const { orders, payments, gateway, reconciliar } = await montar()
    // El caso que de verdad importa: la caida de la pasarela al consultar no puede
    // ser un error de este pago ni abortar el resto de la lista.
    orders.stock.set('v1', 10)
    gateway.consultaCaida = true
    const viejo = payments.all()[0]
    if (viejo !== undefined) {
      viejo.createdAt = new Date('2026-09-27T10:00:00.000Z')
    }

    const resultado = await reconciliar.execute({ olderThan: new Date('2026-09-27T12:00:00.000Z') })

    // Sin la pasarela no hay nada que reconciliar, y eso no es un fallo del pago.
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) {
      return
    }
    expect(resultado.value.sinRespuesta).toEqual(['ref-1'])
    expect(resultado.value.aplicados).toBe(0)
  })
})
