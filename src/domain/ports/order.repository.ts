import type { Order, OrderItem } from '../entities/order.entity'
import type { Delivery } from '../entities/delivery.entity'

export interface PaymentOutcome {
  orderId: string
  paymentStatus: 'APPROVED' | 'DECLINED' | 'ERROR' | 'CANCELLED'
  rawEvent: Record<string, unknown> | null
  receivedAt: Date
}

export interface StockShortage {
  coffeeName: string
}

/**
 * Confirmar un pago toca tres cosas a la vez: el estado de la orden, el del pago,
 * el stock de cada variante y la creación del envío. Si eso no va en una
 * transacción, un corte de luz a mitad deja stock descontado sin orden pagada, o
 * una orden pagada con stock que otro se llevó. Por eso el puerto expone una
 * operación y no cuatro: la frontera transaccional es del adaptador.
 */
export abstract class OrderRepositoryPort {
  abstract save(order: Order): Promise<Order>

  abstract findById(id: string): Promise<Order | null>

  abstract findByOrderNumber(orderNumber: string): Promise<Order | null>

  /**
   * Las órdenes de una persona, de la más reciente a la más antigua.
   *
   * El filtro va aquí y no en un `if` del caso de uso: la diferencia entre "traer las
   * suyas" y "traer todas y quitar las de otros" es justo lo que se rompe en cuanto
   * alguien añade un campo y olvida filtrarlo.
   */
  abstract findByUserId(userId: string, limit: number): Promise<Order[]>

  /** El envío de la orden, o null si todavía no se creó porque el pago no se aprobó. */
  abstract findDeliveryByOrderId(orderId: string): Promise<Delivery | null>

  /**
   * Aplica el resultado del pago y descuenta stock, o devuelve el faltante sin
   * haber tocado nada. Idempotente: si el pago ya estaba resuelto, no vuelve a
   * descontar.
   */
  abstract applyPaymentOutcome(outcome: PaymentOutcome): Promise<{
    applied: boolean
    order: Order
    delivery: Delivery | null
    shortage: StockShortage[]
  }>

  /**
   * Marca una orden como fallida sin pago. Es distinto de "aplicar el resultado de
   * un pago" porque aquí no hay pago: la pasarela rechazó la creación, así que no
   * existe intento que consultar después. Sin esto la orden se queda en PENDING para
   * siempre, sin nada que pueda resolverla.
   */
  abstract markAsFailed(orderId: string, at: Date): Promise<void>

  /** El siguiente número de orden legible. Lo genera el repositorio para que dos compras simultáneas no se lo lleven. */
  abstract nextOrderNumber(now: Date): Promise<string>
}

/** Las líneas que se descuentan de stock, con la cantidad de cada variante. */
export type OrderItemForStock = Pick<OrderItem, 'variantId' | 'quantity' | 'coffeeName'>
