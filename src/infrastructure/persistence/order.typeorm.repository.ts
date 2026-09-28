import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { OrderRepositoryPort, type PaymentOutcome } from '../../domain/ports/order.repository'
import type { Delivery } from '../../domain/entities/delivery.entity'
import {
  Order,
  type OrderItem,
  type OrderStatus,
  type PaymentStatus,
} from '../../domain/entities/order.entity'
import { OrderTypeOrmEntity } from './order.typeorm.entity'
import { OrderItemTypeOrmEntity } from './order-item.typeorm.entity'
import { DeliveryTypeOrmEntity } from './delivery.typeorm.entity'
import { CoffeeVariantTypeOrmEntity } from './coffee-variant.typeorm.entity'

const numero = (valor: string): number => Number(valor)

@Injectable()
export class TypeOrmOrderRepository implements OrderRepositoryPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async save(order: Order): Promise<Order> {
    await this.dataSource.transaction(async (manejador) => {
      await manejador.getRepository(OrderTypeOrmEntity).save(this.aFila(order))
      await manejador.getRepository(OrderItemTypeOrmEntity).delete({ orderId: order.id })
      await manejador
        .getRepository(OrderItemTypeOrmEntity)
        .save(order.items.map((itema) => this.aFilaDeItema(order.id, itema)))
    })

    return order
  }

  async findById(id: string): Promise<Order | null> {
    const fila = await this.dataSource.getRepository(OrderTypeOrmEntity).findOne({
      where: { id },
      relations: { items: true },
    })

    return fila === null ? null : this.aOrden(fila)
  }

  async findByOrderNumber(orderNumber: string): Promise<Order | null> {
    const fila = await this.dataSource.getRepository(OrderTypeOrmEntity).findOne({
      where: { orderNumber },
      relations: { items: true },
    })

    return fila === null ? null : this.aOrden(fila)
  }

  async findDeliveryByOrderId(orderId: string): Promise<Delivery | null> {
    const fila = await this.dataSource.getRepository(DeliveryTypeOrmEntity).findOne({
      where: { orderId },
    })

    return fila === null ? null : this.aEnvio(fila)
  }

  /**
   * El número de orden tiene que ser único y legible. La secuencia la pone la base
   * de datos y el día lo pone la aplicación, porque el día es el único dato que
   * ninguno de los dos puede inventar sin que se note.
   */
  async nextOrderNumber(now: Date): Promise<string> {
    const [siguiente] = (await this.dataSource.query(
      `SELECT nextval('order_number_seq') AS valor`,
    )) as [{ valor: string }]

    return `BC-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${String(siguiente.valor).padStart(4, '0')}`
  }

  /**
   * Aquí es donde la idempotencia es de verdad. Tres cosas van en la misma
   * transacción, y no en tres llamadas: el estado de la orden, el descuento de stock
   * y la creación del envío.
   *
   * El bloqueo de la fila (`pessimistic_write`) es lo que evita el doble descuento.
   * El UNIQUE de `provider_reference` evita dos pagos del mismo evento, pero dos
   * peticiones del mismo evento pueden haber pasado ya ese UNIQUE si llegaron a la
   * vez; el bloqueo hace que la segunda espere y vea que el pago ya estaba resuelto.
   */
  async applyPaymentOutcome(outcome: PaymentOutcome): Promise<{
    applied: boolean
    order: Order
    delivery: Delivery | null
    shortage: { coffeeName: string }[]
  }> {
    return this.dataSource.transaction(async (manejador) => {
      const repositorio = manejador.getRepository(OrderTypeOrmEntity)
      // La cabecera se bloquea sola, sin relaciones. Con `items` cargadas, TypeORM
      // arma un JOIN exterior y PostgreSQL rechaza el FOR UPDATE por el lado
      // nullable; las líneas se leen después, cuando la cabecera ya está bloqueada.
      const fila = await repositorio.findOne({
        where: { id: outcome.orderId },
        lock: { mode: 'pessimistic_write' },
      })

      if (fila === null) {
        throw new Error(`No existe la orden ${outcome.orderId}`)
      }

      fila.items = await manejador.getRepository(OrderItemTypeOrmEntity).find({
        where: { orderId: fila.id },
        order: { id: 'ASC' },
      })

      const envio = await manejador.getRepository(DeliveryTypeOrmEntity).findOne({
        where: { orderId: fila.id },
      })

      if (fila.paymentStatus !== 'PENDING') {
        return {
          applied: false,
          order: this.aOrden(fila),
          delivery: envio === null ? null : this.aEnvio(envio),
          shortage: [],
        }
      }

      fila.paymentStatus = outcome.paymentStatus
      fila.status = (outcome.paymentStatus === 'APPROVED' ? 'PAID' : 'FAILED') as OrderStatus
      fila.updatedAt = outcome.receivedAt

      if (outcome.paymentStatus === 'APPROVED') {
        const variantes = manejador.getRepository(CoffeeVariantTypeOrmEntity)
        // Las variantes se bloquean en orden de id, y todas antes de comprobar
        // ninguna. Sin ese orden, dos cobros simultáneos de la misma variante se
        // quedan esperando en mutex cruzados y la base se cuelga; y comprobar antes
        // de bloquear dejaría la ventana abierta entre el SELECT y el UPDATE.
        const ids = fila.items
          .map((linea) => linea.variantId)
          .filter((id): id is string => id !== null)
          .sort()
        // SQL a proposito y no el query builder: el builder mete un JOIN por las
        // relaciones de la variante, y PostgreSQL no deja poner FOR UPDATE sobre el
        // lado nullable de un JOIN exterior. Ordenar por id no es decorativo: sin un
        // orden fijo, dos cobros de la misma variante se bloquean en orden distinto y
        // se quedan esperando el uno al otro.
        const bloqueadas = ids.length
          ? ((await variantes.query(
              'SELECT id, stock FROM coffee_variants WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
              [ids],
            )) as { id: string; stock: number }[])
          : []
        const stockDe = new Map(bloqueadas.map((variante) => [variante.id, variante.stock]))
        const faltantes = fila.items
          .filter((linea) => linea.variantId !== null)
          .filter((linea) => (stockDe.get(linea.variantId ?? '') ?? 0) < linea.quantity)
          .map((linea) => ({ coffeeName: linea.coffeeName }))

        // Sin stock se devuelve sin haber escrito nada. Tirar la transacción con una
        // excepción también la revertiría, pero el caso de uso necesita distinguir
        // "no hay stock" de "se rompió algo", y una excepción no lo distingue.
        if (faltantes.length > 0) {
          return { applied: false, order: this.aOrden(fila), delivery: null, shortage: faltantes }
        }

        for (const linea of fila.items) {
          if (linea.variantId === null) {
            continue
          }

          await variantes
            .createQueryBuilder()
            .update()
            .set({ stock: () => `stock - ${linea.quantity}` })
            .where('id = :id', { id: linea.variantId })
            .execute()
        }

        const creado = manejador.getRepository(DeliveryTypeOrmEntity).create({
          orderId: fila.id,
          status: 'PENDING',
          carrier: null,
          trackingCode: null,
          shippedAt: null,
          deliveredAt: null,
          createdAt: outcome.receivedAt,
          updatedAt: outcome.receivedAt,
        })
        await manejador.getRepository(DeliveryTypeOrmEntity).save(creado)
        await repositorio.save(fila)

        return {
          applied: true,
          order: this.aOrden(fila),
          delivery: this.aEnvio(creado),
          shortage: [],
        }
      }

      await repositorio.save(fila)

      return { applied: true, order: this.aOrden(fila), delivery: null, shortage: [] }
    })
  }

  private aFila(order: Order): OrderTypeOrmEntity {
    const repositorio = this.dataSource.getRepository(OrderTypeOrmEntity)
    const fila = repositorio.create({
      id: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      userId: order.userId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      customerName: order.customerName,
      customerDocument: order.customerDocument,
      customerPhone: order.customerPhone,
      shippingAddress: order.shippingAddress,
      shippingCity: order.shippingCity,
      shippingDepartment: order.shippingDepartment,
      subtotal: String(order.subtotal),
      taxAmount: String(order.taxAmount),
      shippingAmount: String(order.shippingAmount),
      total: String(order.total),
    })

    return fila
  }

  private aFilaDeItema(orderId: string, item: OrderItem): OrderItemTypeOrmEntity {
    return this.dataSource.getRepository(OrderItemTypeOrmEntity).create({
      orderId,
      variantId: item.variantId,
      coffeeName: item.coffeeName,
      weightGrams: item.weightGrams,
      unitPrice: String(item.unitPrice),
      quantity: item.quantity,
      lineTotal: String(item.lineTotal),
    })
  }

  private aOrden(fila: OrderTypeOrmEntity): Order {
    return {
      id: fila.id,
      orderNumber: fila.orderNumber,
      userId: fila.userId ?? '',
      customerId: fila.customerId,
      status: fila.status as OrderStatus,
      paymentStatus: fila.paymentStatus as PaymentStatus,
      customerName: fila.customerName,
      customerDocument: fila.customerDocument,
      customerPhone: fila.customerPhone,
      shippingAddress: fila.shippingAddress,
      shippingCity: fila.shippingCity,
      shippingDepartment: fila.shippingDepartment,
      items: (fila.items ?? []).map((itema) => ({
        variantId: itema.variantId ?? '',
        coffeeName: itema.coffeeName,
        weightGrams: itema.weightGrams,
        unitPrice: numero(itema.unitPrice),
        quantity: itema.quantity,
        lineTotal: numero(itema.lineTotal),
      })),
      subtotal: numero(fila.subtotal),
      taxAmount: numero(fila.taxAmount),
      shippingAmount: numero(fila.shippingAmount),
      total: numero(fila.total),
      createdAt: fila.createdAt,
      updatedAt: fila.updatedAt,
    }
  }

  private aEnvio(fila: DeliveryTypeOrmEntity): Delivery {
    return {
      id: fila.id,
      orderId: fila.orderId,
      status: fila.status as Delivery['status'],
      carrier: fila.carrier,
      trackingCode: fila.trackingCode,
      shippedAt: fila.shippedAt,
      deliveredAt: fila.deliveredAt,
      createdAt: fila.createdAt,
      updatedAt: fila.updatedAt,
    }
  }
}
