import type { Order, OrderItem } from '../../domain/entities/order.entity'
import type { Delivery } from '../../domain/entities/delivery.entity'
import type {
  OrderRepositoryPort,
  PaymentOutcome,
  StockShortage,
} from '../../domain/ports/order.repository'

/**
 * El fake lleva un stock por variante para que el caso de uso se pueda probar sin
 * base de datos. Aplica las mismas reglas que el adaptador real: el pago ya
 * resuelto no vuelve a descontar, y si falta stock no toca nada.
 */
export class FakeOrderRepository implements OrderRepositoryPort {
  private readonly ordenes = new Map<string, Order>()
  private readonly envios = new Map<string, Delivery>()
  public readonly stock = new Map<string, number>()
  public readonly pagosAplicados: PaymentOutcome[] = []
  public nextOrderNumberCalls = 0

  async save(order: Order): Promise<Order> {
    this.ordenes.set(order.id, { ...order, items: order.items.map((itema) => ({ ...itema })) })

    return order
  }

  async findById(id: string): Promise<Order | null> {
    return this.ordenes.get(id) ?? null
  }

  async findByOrderNumber(orderNumber: string): Promise<Order | null> {
    return [...this.ordenes.values()].find((orden) => orden.orderNumber === orderNumber) ?? null
  }

  async findDeliveryByOrderId(orderId: string): Promise<Delivery | null> {
    return this.envios.get(orderId) ?? null
  }

  async markAsFailed(orderId: string, at: Date): Promise<void> {
    const order = this.ordenes.get(orderId)

    if (order === undefined) {
      return
    }

    this.ordenes.set(orderId, { ...order, status: 'FAILED', updatedAt: at })
  }

  async nextOrderNumber(now: Date): Promise<string> {
    this.nextOrderNumberCalls += 1
    const dia = now.toISOString().slice(0, 10).replace(/-/g, '')

    return `BC-${dia}-${String(this.nextOrderNumberCalls).padStart(4, '0')}`
  }

  async applyPaymentOutcome(outcome: PaymentOutcome): Promise<{
    applied: boolean
    order: Order
    delivery: Delivery | null
    shortage: StockShortage[]
  }> {
    const order = this.ordenes.get(outcome.orderId)

    if (order === undefined) {
      throw new Error(`El fake no tiene la orden ${outcome.orderId}`)
    }

    // Idempotencia: sin esto, procesar dos veces el mismo evento descuenta stock dos
    // veces, que es exactamente el fallo que el UNIQUE del esquema evita en real.
    if (order.paymentStatus !== 'PENDING') {
      return { applied: false, order, delivery: this.envios.get(order.id) ?? null, shortage: [] }
    }

    // Solo un pago aprobado descuenta stock. Un pago rechazado que lo descontara
    // vaciaría el catálogo sin que nadie haya pagado nada.
    if (outcome.paymentStatus === 'APPROVED') {
      const faltan = this.faltantesDe(order.items)
      if (faltan.length > 0) {
        return { applied: false, order, delivery: null, shortage: faltan }
      }

      for (const linea of order.items) {
        this.stock.set(linea.variantId, (this.stock.get(linea.variantId) ?? 0) - linea.quantity)
      }
    }

    const actualizada: Order = {
      ...order,
      status: outcome.paymentStatus === 'APPROVED' ? 'PAID' : 'FAILED',
      paymentStatus: outcome.paymentStatus,
      updatedAt: outcome.receivedAt,
    }
    this.ordenes.set(order.id, actualizada)
    this.pagosAplicados.push(outcome)

    // El envio se crea solo si el pago fue aprobado: uno con la orden fallida es
    // un paquete que nadie pidio, y uno pendiente con la orden pagada es una
    // promesa que el sistema todavia no puede cumplir.
    if (outcome.paymentStatus !== 'APPROVED') {
      this.ordenes.set(order.id, actualizada)
      this.pagosAplicados.push(outcome)

      return { applied: true, order: actualizada, delivery: null, shortage: [] }
    }

    const delivery: Delivery = {
      id: `envio-${order.id}`,
      orderId: order.id,
      status: 'PENDING',
      carrier: null,
      trackingCode: null,
      shippedAt: null,
      deliveredAt: null,
      createdAt: outcome.receivedAt,
      updatedAt: outcome.receivedAt,
    }
    this.envios.set(order.id, delivery)

    return { applied: true, order: actualizada, delivery, shortage: [] }
  }

  all(): Order[] {
    return [...this.ordenes.values()]
  }

  /** Reparte el stock inicial entre las líneas guardadas. */
  repartirStock(items: OrderItem[], stockPorVariante: number): void {
    for (const linea of items) {
      this.stock.set(linea.variantId, stockPorVariante)
    }
  }

  private faltantesDe(items: OrderItem[]): StockShortage[] {
    return items
      .filter((linea) => (this.stock.get(linea.variantId) ?? 0) < linea.quantity)
      .map((linea) => ({ coffeeName: linea.coffeeName }))
  }
}
