import { Injectable } from '@nestjs/common'
import { OrderRepositoryPort } from '../../domain/ports/order.repository'
import { ok, type Result } from '../../domain/result'
import type { AppError } from '../../domain/errors/app-error'

/** Lo mínimo para reconocer una orden en una lista. */
export interface OrderSummaryLine {
  variantId: string
  coffeeName: string
  weightGrams: number | null
  quantity: number
  lineTotal: number
}

export interface OrderListItem {
  id: string
  orderNumber: string
  status: string
  paymentStatus: string
  total: number
  createdAt: Date
  items: OrderSummaryLine[]
}

const CUANTAS = 50

/**
 * El historial de compras de una persona.
 *
 * **El filtro por usuario está en el repositorio y no en un `if` aquí.** Es la
 * diferencia entre "traer las órdenes de esta persona" y "traer todas y quitar las
 * que no son suyas", y la segunda se rompe en cuanto alguien añade un campo al
 * SELECT: lo que no se trae no se puede filtrar.
 *
 * No lleva dirección ni documento. La lista es para saber **qué** se pidió, y volver
 * a exponer datos personales en una segunda pantalla no aporta nada.
 */
@Injectable()
export class GetOrdersUseCase {
  constructor(private readonly orders: OrderRepositoryPort) {}

  async execute(userId: string, limite = CUANTAS): Promise<Result<OrderListItem[], AppError>> {
    const ordenes = await this.orders.findByUserId(userId, limite)

    return ok(
      ordenes.map((orden) => ({
        id: orden.id,
        orderNumber: orden.orderNumber,
        status: orden.status,
        paymentStatus: orden.paymentStatus,
        total: orden.total,
        createdAt: orden.createdAt,
        items: orden.items.map((linea) => ({
          variantId: linea.variantId,
          coffeeName: linea.coffeeName,
          weightGrams: linea.weightGrams,
          quantity: linea.quantity,
          lineTotal: linea.lineTotal,
        })),
      })),
    )
  }
}
