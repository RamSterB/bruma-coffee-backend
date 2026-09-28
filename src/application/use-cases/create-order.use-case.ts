import { Inject, Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { CardGateway } from '../../domain/ports/card-gateway.port'
import { OrderRepositoryPort } from '../../domain/ports/order.repository'
import { PaymentRepositoryPort } from '../../domain/ports/payment.repository'
import { CustomerRepositoryPort } from '../../domain/ports/customer.repository'
import { Customer } from '../../domain/entities/customer.entity'
import { Order, type OrderItem } from '../../domain/entities/order.entity'
import type { Payment } from '../../domain/entities/payment.entity'
import { err, ok, type Result } from '../../domain/result'
import type { AppError } from '../../domain/errors/app-error'
import {
  emptyCartError,
  gatewayUnavailableError,
  missingCardTokenError,
} from '../../domain/errors/payment.errors'
import { GetOrderSummaryUseCase } from './get-order-summary.use-case'
import { CARD_GATEWAY_CONFIG, type CardGatewayConfig } from '../../config/card-gateway.config'

/** El proveedor se persiste con nombre neutro, para no filtrarlo en las migraciones. */
export const PROVEEDOR = 'card_gateway'

const PESOS_POR_CENTIMO = 100

export interface CreateOrderInput {
  userId: string
  /** Token de la tarjeta devuelto por la tokenización del navegador. Nunca el número. */
  cardToken: string
  email: string
  shipping: {
    fullName: string
    documentNumber: string
    phone: string
    address: string
    city: string
    department: string
  }
  /**
   * Lo ignora a propósito. El total lo calcula el servidor (RF-06.5) y si el
   * cliente pudiera mandarlo, el único trabajo de la validación sería compararlo
   * con lo que ya se sabe, que no vale la pena.
   */
  total?: number
}

export interface CreatedOrder {
  id: string
  orderNumber: string
  status: Order['status']
  paymentStatus: Order['paymentStatus']
  customerName: string
  customerDocument: string
  customerPhone: string
  shippingAddress: string
  shippingCity: string
  shippingDepartment: string
  items: OrderItem[]
  subtotal: number
  taxAmount: number
  shippingAmount: number
  total: number
  /** Referencia de la pasarela: con ella se consulta el estado y se casa el evento. */
  paymentReference: string
}

/**
 * Crea la orden en PENDING y pide el cobro.
 *
 * El orden es el que dicta el enunciado y el que evita el problema de las dos
 * tiendas: la orden existe antes de que se cobre, y si el cobro falla queda
 * registrada como pendiente en vez de desaparecer. Lo que **no** se hace aquí es
 * confirmar el pago: eso lo hace el evento de la pasarela, que es quien sabe si
 * el dinero se movió.
 */
@Injectable()
export class CreateOrderUseCase {
  constructor(
    private readonly orders: OrderRepositoryPort,
    private readonly payments: PaymentRepositoryPort,
    private readonly customers: CustomerRepositoryPort,
    private readonly gateway: CardGateway,
    private readonly summary: GetOrderSummaryUseCase,
    @Inject(CARD_GATEWAY_CONFIG) private readonly config: CardGatewayConfig,
  ) {}

  async execute(input: CreateOrderInput): Promise<Result<CreatedOrder, AppError>> {
    if (input.cardToken.trim().length === 0) {
      return err(missingCardTokenError())
    }

    const resumen = await this.summary.execute(input.userId)

    if (resumen.lines.length === 0) {
      return err(emptyCartError())
    }

    // La orden apunta siempre a una fila de clientes, también la de quien ya tenía
    // cuenta. Por eso la fila se resuelve o se crea aquí y no al registrarse: el
    // registro es un trámite y esto es una compra, y atarlos haría que una compra
    // fallara por algo que pasó (o no pasó) en el registro.
    const cliente = await this.resolverCliente(input.email, input.shipping.fullName)

    const ahora = new Date()
    const orderNumber = await this.orders.nextOrderNumber(ahora)
    const order = Order.create({
      id: randomUUID(),
      orderNumber,
      userId: input.userId,
      customerId: cliente.id ?? input.userId,
      customer: {
        name: input.shipping.fullName,
        documentNumber: input.shipping.documentNumber,
        phone: input.shipping.phone,
      },
      shipping: input.shipping,
      items: resumen.lines.map((linea) => ({
        variantId: linea.variantId,
        coffeeName: linea.coffeeName,
        weightGrams: linea.weightGrams,
        unitPrice: linea.unitPrice,
        quantity: linea.quantity,
        lineTotal: linea.unitPrice * linea.quantity,
      })),
      subtotal: resumen.subtotal,
      taxAmount: resumen.tax,
      shippingAmount: resumen.shipping,
      total: resumen.total,
      createdAt: ahora,
    })

    await this.orders.save(order)

    const importeEnCentavos = order.total * PESOS_POR_CENTIMO
    const cobro = await this.gateway.createTransaction({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amountInCents: importeEnCentavos,
      cardToken: input.cardToken,
      customerEmail: input.email,
      customerName: order.customerName,
      customerDocument: order.customerDocument,
      customerPhone: order.customerPhone,
      shippingAddress: [order.shippingAddress, order.shippingCity, order.shippingDepartment].join(
        ', ',
      ),
      shippingCity: order.shippingCity,
      shippingDepartment: order.shippingDepartment,
    })

    if (!cobro.ok) {
      // Rechazo y caída no son lo mismo. Un rechazo no se reintenta: la orden se
      // marca FAILED, porque no hay pago que consultar después y en PENDING se
      // quedaría colgando para siempre. Una caída sí se reintenta, y la orden se
      // queda pendiente por si el siguiente intento funciona.
      if (cobro.error.code === 'PAYMENT_DECLINED') {
        await this.orders.markAsFailed(order.id, new Date())
      }

      return err(cobro.error)
    }

    if (cobro.value.amount !== importeEnCentavos) {
      return err(
        gatewayUnavailableError(
          `la pasarela devolvio ${cobro.value.amount} y se le pidieron ${importeEnCentavos}`,
        ),
      )
    }

    const payment: Payment = {
      id: randomUUID(),
      orderId: order.id,
      provider: PROVEEDOR,
      providerReference: cobro.value.reference,
      token: input.cardToken,
      status: cobro.value.status,
      amount: importeEnCentavos,
      rawEvent: null,
      createdAt: ahora,
      updatedAt: ahora,
    }
    await this.payments.save(payment)

    return ok({ ...this.aOrder(order), paymentReference: cobro.value.reference })
  }

  private async resolverCliente(email: string, fullName: string): Promise<Customer> {
    const existente = await this.customers.findByEmail(email)

    if (existente !== null) {
      return existente
    }

    return this.customers.save(Customer.create({ email, fullName }))
  }

  private aOrder(order: Order): Omit<CreatedOrder, 'paymentReference'> {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      customerName: order.customerName,
      customerDocument: order.customerDocument,
      customerPhone: order.customerPhone,
      shippingAddress: order.shippingAddress,
      shippingCity: order.shippingCity,
      shippingDepartment: order.shippingDepartment,
      items: order.items,
      subtotal: order.subtotal,
      taxAmount: order.taxAmount,
      shippingAmount: order.shippingAmount,
      total: order.total,
    }
  }
}
