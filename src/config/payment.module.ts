import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CartModule } from './cart.module'
import { AuthModule } from './auth.module'
import {
  CARD_GATEWAY_CONFIG,
  cardGatewayConfig,
  type CardGatewayConfig,
} from './card-gateway.config'
import { CreateOrderUseCase } from '../application/use-cases/create-order.use-case'
import {
  ConfirmPaymentUseCase,
  ReconcilePendingPaymentsUseCase,
} from '../application/use-cases/confirm-payment.use-case'
import { SettlePaymentService } from '../application/use-cases/settle-payment.service'
import { GetOrderStatusUseCase } from '../application/use-cases/get-order-status.use-case'
import { GetOrdersUseCase } from '../application/use-cases/get-orders.use-case'
import { CardGateway } from '../domain/ports/card-gateway.port'
import { OrderRepositoryPort } from '../domain/ports/order.repository'
import { PaymentRepositoryPort } from '../domain/ports/payment.repository'
import { PersistenceModule } from '../infrastructure/persistence/persistence.module'
import { OrderTypeOrmEntity } from '../infrastructure/persistence/order.typeorm.entity'
import { OrderItemTypeOrmEntity } from '../infrastructure/persistence/order-item.typeorm.entity'
import { PaymentTypeOrmEntity } from '../infrastructure/persistence/payment.typeorm.entity'
import { DeliveryTypeOrmEntity } from '../infrastructure/persistence/delivery.typeorm.entity'
import { TypeOrmOrderRepository } from '../infrastructure/persistence/order.typeorm.repository'
import { TypeOrmPaymentRepository } from '../infrastructure/persistence/payment.typeorm.repository'
import { CardGatewayAdapter, type FetchLike } from '../infrastructure/payments/card-gateway.adapter'
import { OrderController } from '../interfaces/http/orders/order.controller'

/**
 * Token del `fetch` de la pasarela. Existe para que las pruebas de extremo a
 * extremo puedan sustituir la red por un doble sin abrir un puerto ni depender de
 * un tercero. **No** es un punto de extensión de la aplicación: en producción se
 * registra el `fetch` real y no hay ninguna otra implementación registrada.
 */
export const CARD_GATEWAY_FETCH = 'CARD_GATEWAY_FETCH'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderTypeOrmEntity,
      OrderItemTypeOrmEntity,
      PaymentTypeOrmEntity,
      DeliveryTypeOrmEntity,
    ]),
    // El resumen de la orden y el carrito son de otro módulo, y el caso de uso los
    // necesita: el total lo calcula el carrito, no el pago.
    PersistenceModule,
    CartModule,
    // El módulo de sesión publica el repositorio de clientes, y la orden necesita
    // resolver esa fila antes de escribir: es su dueña la que recibe el paquete.
    AuthModule,
  ],
  controllers: [OrderController],
  providers: [
    {
      provide: CARD_GATEWAY_CONFIG,
      useFactory: () => cardGatewayConfig(),
    },
    {
      provide: CARD_GATEWAY_FETCH,
      useFactory: (): typeof globalThis.fetch => (url, init) => globalThis.fetch(url, init),
    },
    {
      provide: CardGateway,
      useFactory: (config: CardGatewayConfig, fetch: FetchLike) =>
        new CardGatewayAdapter(config, fetch),
      inject: [CARD_GATEWAY_CONFIG, CARD_GATEWAY_FETCH],
    },
    { provide: OrderRepositoryPort, useClass: TypeOrmOrderRepository },
    { provide: PaymentRepositoryPort, useClass: TypeOrmPaymentRepository },
    CreateOrderUseCase,
    SettlePaymentService,
    ConfirmPaymentUseCase,
    ReconcilePendingPaymentsUseCase,
    GetOrderStatusUseCase,
    GetOrdersUseCase,
  ],
})
export class PaymentModule {}
