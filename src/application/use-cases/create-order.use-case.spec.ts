import { CreateOrderUseCase, type CreateOrderInput } from './create-order.use-case'
import { GetOrderSummaryUseCase } from './get-order-summary.use-case'
import { FakeCartRepository } from '../../testing/fakes/fake-cart.repository'
import { FakeOrderRepository } from '../../testing/fakes/fake-order.repository'
import { FakePaymentRepository } from '../../testing/fakes/fake-payment.repository'
import { FakeCustomerRepository } from '../../testing/fakes/fake-customer.repository'
import { buildCoffeeVariant } from '../../testing/coffee.fixtures'
import { CardGateway } from '../../domain/ports/card-gateway.port'
import { cardGatewayConfig } from '../../config/card-gateway.config'
import { err, ok, type Result } from '../../domain/result'
import { gatewayUnavailableError, gatewayDeclinedError } from '../../domain/errors/payment.errors'
import type { AppError } from '../../domain/errors/app-error'
import type { GatewayTransaction } from '../../domain/ports/card-gateway.port'

const CONFIG = { taxRate: 0.19, shippingFlatRate: 10000, freeShippingThreshold: 150000 }

const entrega = {
  fullName: 'Persona Compradora',
  documentNumber: '1098765434',
  phone: '3001234567',
  address: 'Carrera 7 con Calle 72',
  city: 'Bogotá',
  department: 'Cundinamarca',
}

class GatewayQueAprueba extends CardGateway {
  public readonly llamadas: { amountInCents: number; cardToken: string }[] = []

  constructor(private readonly referencia = 'ref-gateway-1') {
    super()
  }

  async createTransaction(input: {
    amountInCents: number
    cardToken: string
  }): Promise<Result<GatewayTransaction, AppError>> {
    this.llamadas.push({ amountInCents: input.amountInCents, cardToken: input.cardToken })

    return ok({ reference: this.referencia, status: 'PENDING', amount: input.amountInCents })
  }

  async getTransactionStatus(): Promise<Result<GatewayTransaction, AppError>> {
    return ok({ reference: 'tx-1', status: 'PENDING', amount: 0 })
  }

  verifySignature(): Result<void, AppError> {
    return ok(undefined)
  }
}

const montar = (gateway: CardGateway = new GatewayQueAprueba(), conLinea = true) => {
  const carrito = new FakeCartRepository()
  const orders = new FakeOrderRepository()
  const payments = new FakePaymentRepository()
  const customers = new FakeCustomerRepository()
  carrito.catalogo.set('v1', buildCoffeeVariant('v1', { price: 42000, stock: 10 }))
  carrito.nombresDeCafe.set('v1', 'Caturra')
  if (conLinea) {
    carrito.registrar('usuario-1', [{ variantId: 'v1', quantity: 1 }])
  }
  const resumen = new GetOrderSummaryUseCase(carrito, CONFIG)
  const useCase = new CreateOrderUseCase(
    orders,
    payments,
    customers,
    gateway,
    resumen,
    cardGatewayConfig(),
  )

  return { carrito, orders, payments, customers, gateway, useCase }
}

const entrada = (over: Partial<CreateOrderInput> = {}): CreateOrderInput => ({
  userId: 'usuario-1',
  cardToken: 'tok_test_123',
  email: 'comprador@ejemplo.co',
  shipping: entrega,
  ...over,
})

describe('CreateOrderUseCase', () => {
  it('crea la orden en PENDING y con el pago en PENDING', async () => {
    const { useCase } = montar()

    const resultado = await useCase.execute(entrada({}))

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) {
      return
    }
    expect(resultado.value.status).toBe('PENDING')
    expect(resultado.value.paymentStatus).toBe('PENDING')
  })

  it('devuelve un número de orden legible', async () => {
    const { useCase } = montar()

    const resultado = await useCase.execute(entrada({}))

    expect(resultado.ok && resultado.value.orderNumber).toMatch(/^BC-\d{8}-\d{4}$/)
  })

  it('copia el total que calculó el servidor y no acepta otro del cliente', async () => {
    const { useCase } = montar()

    const resultado = await useCase.execute(entrada({ total: 1 }))

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) {
      return
    }
    // 42.000 de café, 7.980 de IVA (19 %) y 10.000 de envío: por debajo del
    // umbral de envío gratis, así que la tarifa se paga entera.
    expect(resultado.value.total).toBe(59980)
    expect(resultado.value.total).not.toBe(1)
  })

  it('congela el precio y el nombre del café en la línea de la orden', async () => {
    const { useCase } = montar()

    const resultado = await useCase.execute(entrada({}))

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) {
      return
    }
    const linea = resultado.value.items[0]
    expect(linea?.coffeeName).toBe('Caturra')
    expect(linea?.unitPrice).toBe(42000)
    expect(linea?.lineTotal).toBe(42000)
  })

  it('copia los datos de entrega del cliente en la orden', async () => {
    const { useCase } = montar()

    const resultado = await useCase.execute(entrada({}))

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) {
      return
    }
    expect(resultado.value.shippingCity).toBe('Bogotá')
    expect(resultado.value.shippingDepartment).toBe('Cundinamarca')
    expect(resultado.value.customerDocument).toBe('1098765434')
  })

  it('pide el cobro en centavos, que es lo que espera la pasarela', async () => {
    const gateway = new GatewayQueAprueba()
    const { useCase } = montar(gateway)

    await useCase.execute(entrada({}))

    // 59.980 pesos son 5.998.000 centavos. Mandar 59.980 cobraría la centésima
    // parte, y el error no se vería hasta la conciliación.
    expect(gateway.llamadas[0]?.amountInCents).toBe(5998000)
  })

  it('manda el token de la tarjeta, y el número no aparece por ninguna parte', async () => {
    const gateway = new GatewayQueAprueba()
    const { orders, payments, useCase } = montar(gateway)

    await useCase.execute(entrada({ cardToken: 'tok_test_123' }))

    expect(gateway.llamadas[0]?.cardToken).toBe('tok_test_123')
    expect(payments.all()[0]?.token).toBe('tok_test_123')
    expect(JSON.stringify(orders)).not.toMatch(/\d{13,19}/)
  })

  it('guarda la referencia de la pasarela, que es lo que después casa el evento', async () => {
    const { payments, useCase } = montar(new GatewayQueAprueba('ref-abc-123'))

    await useCase.execute(entrada({}))

    expect(payments.all()[0]?.providerReference).toBe('ref-abc-123')
  })

  it('el importe guardado es el mismo que se le pide a la pasarela', async () => {
    const gateway = new GatewayQueAprueba()
    const { payments, useCase } = montar(gateway)

    await useCase.execute(entrada({}))

    expect(payments.all()[0]?.amount).toBe(gateway.llamadas[0]?.amountInCents)
  })

  it('no llama a la pasarela si el carrito está vacío', async () => {
    const gateway = new GatewayQueAprueba()
    const { useCase } = montar(gateway, false)

    const resultado = await useCase.execute(entrada({}))

    expect(resultado.ok).toBe(false)
    if (resultado.ok) {
      return
    }
    expect(resultado.error.code).toBe('EMPTY_CART')
    expect(gateway.llamadas).toHaveLength(0)
  })

  it('no llama a la pasarela si no viene el token de la tarjeta', async () => {
    const gateway = new GatewayQueAprueba()
    const { useCase } = montar(gateway)

    const resultado = await useCase.execute(entrada({ cardToken: '' }))

    expect(resultado.ok).toBe(false)
    expect(gateway.llamadas).toHaveLength(0)
  })

  it('deja la orden en PENDING si la pasarela no responde, y lo dice', async () => {
    const caida = new GatewayQueAprueba()
    caida.createTransaction = async (): Promise<Result<GatewayTransaction, AppError>> =>
      err(gatewayUnavailableError('tiempo de espera agotado'))
    const { orders, useCase } = montar(caida)

    const resultado = await useCase.execute(entrada({}))

    expect(resultado.ok).toBe(false)
    expect(orders.all()).toHaveLength(1)
    expect(orders.all()[0]?.status).toBe('PENDING')
  })

  it('traduce el rechazo de la pasarela a un error de negocio, no a una caída', async () => {
    const rechaza = new GatewayQueAprueba()
    rechaza.createTransaction = async (): Promise<Result<GatewayTransaction, AppError>> =>
      err(gatewayDeclinedError('la tarjeta fue rechazada'))
    const { useCase } = montar(rechaza)

    const resultado = await useCase.execute(entrada({}))

    expect(resultado.ok).toBe(false)
    if (resultado.ok) {
      return
    }
    expect(resultado.error.status).toBe(402)
  })

  it('rechaza un importe de la pasarela que no es el que se pidió cobrar', async () => {
    // Una pasarela que devuelve un importe distinto del pedido es el momento de
    // parar: si se acepta, el cliente paga una cifra y el pedido dice otra.
    const deshonesto = new GatewayQueAprueba()
    deshonesto.createTransaction = async (input): Promise<Result<GatewayTransaction, AppError>> =>
      ok({ reference: 'ref-1', status: 'PENDING', amount: input.amountInCents + 1 })
    const { useCase } = montar(deshonesto)

    const resultado = await useCase.execute(entrada({}))

    expect(resultado.ok).toBe(false)
  })

  it('crea la fila de cliente si no existe, porque la orden la necesita siempre', async () => {
    const { customers, useCase } = montar()

    await useCase.execute(entrada({ email: 'nuevo@ejemplo.co' }))

    expect(customers.todos).toHaveLength(1)
    expect(customers.todos[0]?.email).toBe('nuevo@ejemplo.co')
  })

  it('reutiliza la fila de cliente si el correo ya existe, en vez de duplicarla', async () => {
    const { customers, useCase } = montar()

    await useCase.execute(entrada({ email: 'mismo@ejemplo.co' }))
    await useCase.execute(entrada({ email: 'Mismo@Ejemplo.co' }))

    // El correo se normaliza a minúsculas, así que las dos compras son de la misma
    // persona y por eso: dos filas serían dos personas con el mismo correo.
    expect(customers.todos).toHaveLength(1)
  })
})

describe('CreateOrderUseCase cuando la pasarela rechaza el cobro', () => {
  it('deja la orden en FAILED, no en PENDING colgando para siempre', async () => {
    // La orden se crea antes de cobrar, a propósito. Pero si el cobro se rechaza en
    // el momento, esa orden ya no está pendiente de nada: no hay pago que
    // reconciliar, así que se quedaría en PENDING para siempre, con el stock
    // reservado en la cabeza de alguien a quien ya se le dijo que no.
    const rechaza = new GatewayQueAprueba()
    rechaza.createTransaction = async (): Promise<Result<GatewayTransaction, AppError>> =>
      err(gatewayDeclinedError('la tarjeta fue rechazada'))
    const { orders, useCase } = montar(rechaza)

    const resultado = await useCase.execute(entrada({}))

    expect(resultado.ok).toBe(false)
    expect(orders.all()[0]?.status).toBe('FAILED')
  })

  it('deja la orden en PENDING si la pasarela no responde, porque eso sí se puede reintentar', async () => {
    // Caída de red y rechazo no son lo mismo: una se reintenta y la otra no. Dejar
    // ambas igual obliga a alguien a distinguirlas leyendo el motivo del error.
    const caida = new GatewayQueAprueba()
    caida.createTransaction = async (): Promise<Result<GatewayTransaction, AppError>> =>
      err(gatewayUnavailableError('tiempo de espera agotado'))
    const { orders, useCase } = montar(caida)

    await useCase.execute(entrada({}))

    expect(orders.all()[0]?.status).toBe('PENDING')
  })
})
