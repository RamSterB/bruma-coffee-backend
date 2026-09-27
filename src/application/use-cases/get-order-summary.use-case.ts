import { Inject, Injectable } from '@nestjs/common'
import { OrderSummary, type PricingConfig } from '../../domain/entities/order-summary.entity'
import { CartRepositoryPort } from '../../domain/ports/cart.repository'
import { PRICING_CONFIG } from '../../config/pricing.config'

/**
 * El resumen de la orden antes de cobrar. Los importes salen del carrito que ya
 * tiene el servidor, con los precios del catálogo del momento, y se calculan
 * aquí: el frontend solo los muestra.
 *
 * La configuración de precios entra por constructor en vez de leerse del entorno
 * dentro, para que el caso de uso se pueda probar con cifras propias sin tocar el
 * entorno de la máquina.
 */
@Injectable()
export class GetOrderSummaryUseCase {
  constructor(
    private readonly cartRepository: CartRepositoryPort,
    @Inject(PRICING_CONFIG) private readonly pricing: PricingConfig,
  ) {}

  async execute(userId: string): Promise<OrderSummary> {
    const cart = await this.cartRepository.findByUserId(userId)

    return OrderSummary.create(
      cart.items
        .filter((item) => item.isPurchasable)
        .map((item) => ({
          variantId: item.variantId,
          coffeeName: item.coffeeName ?? 'Café',
          unitPrice: item.price,
          quantity: item.quantity,
        })),
      this.pricing,
    )
  }
}
