import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AddItemToCartUseCase } from '../application/use-cases/add-item-to-cart.use-case'
import { ClearCartUseCase } from '../application/use-cases/clear-cart.use-case'
import { GetCartUseCase } from '../application/use-cases/get-cart.use-case'
import { GetOrderSummaryUseCase } from '../application/use-cases/get-order-summary.use-case'
import { QuoteShippingUseCase } from '../application/use-cases/quote-shipping.use-case'
import { MergeLocalCartUseCase } from '../application/use-cases/merge-local-cart.use-case'
import { RemoveCartItemUseCase } from '../application/use-cases/remove-cart-item.use-case'
import { UpdateCartItemQuantityUseCase } from '../application/use-cases/update-cart-item-quantity.use-case'
import { CartRepositoryPort } from '../domain/ports/cart.repository'
import { GeographyRepositoryPort } from '../domain/ports/geography.repository'
import { PRICING_CONFIG, pricingConfig } from './pricing.config'
import { PersistenceModule } from '../infrastructure/persistence/persistence.module'
import { DepartmentTypeOrmEntity } from '../infrastructure/persistence/department.typeorm.entity'
import { TypeOrmGeographyRepository } from '../infrastructure/persistence/geography.typeorm.repository'
import { CartTypeOrmEntity } from '../infrastructure/persistence/cart.typeorm.entity'
import { CartItemTypeOrmEntity } from '../infrastructure/persistence/cart-item.typeorm.entity'
import { TypeOrmCartRepository } from '../infrastructure/persistence/cart.typeorm.repository'
import { CartController } from '../interfaces/http/cart/cart.controller'

/**
 * El carrito es un módulo aparte y no una parte de auth aunque lo use la sesión:
 * su vida no depende de la autenticación, sino de que la haya. Así el backend
 * del carrito se puede probar y cambiar sin tocar el de la sesión.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CartTypeOrmEntity, CartItemTypeOrmEntity, DepartmentTypeOrmEntity]),
    // PersistenceModule es quien publica CoffeeRepositoryPort, y el carrito lo
    // necesita para saber si una variante se puede comprar antes de guardarla.
    PersistenceModule,
  ],
  controllers: [CartController],
  providers: [
    {
      provide: CartRepositoryPort,
      useClass: TypeOrmCartRepository,
    },
    {
      provide: GeographyRepositoryPort,
      useClass: TypeOrmGeographyRepository,
    },
    {
      provide: PRICING_CONFIG,
      useFactory: () => pricingConfig(),
    },
    GetCartUseCase,
    GetOrderSummaryUseCase,
    QuoteShippingUseCase,
    AddItemToCartUseCase,
    UpdateCartItemQuantityUseCase,
    RemoveCartItemUseCase,
    ClearCartUseCase,
    MergeLocalCartUseCase,
  ],
  exports: [CartRepositoryPort],
})
export class CartModule {}
