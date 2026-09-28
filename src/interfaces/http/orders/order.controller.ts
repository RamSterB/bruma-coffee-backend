import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { Inject } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import {
  CreateOrderUseCase,
  type CreatedOrder,
} from '../../../application/use-cases/create-order.use-case'
import { ConfirmPaymentUseCase } from '../../../application/use-cases/confirm-payment.use-case'
import {
  CARD_GATEWAY_CONFIG,
  gatewayEnvironment,
  type CardGatewayConfig,
} from '../../../config/card-gateway.config'
import { GetOrderStatusUseCase } from '../../../application/use-cases/get-order-status.use-case'
import type { AppError } from '../../../domain/errors/app-error'
import type { Result } from '../../../domain/result'
import type { Request } from 'express'
import { JwtAuthGuard, type SessionInfo } from '../auth/auth.guards'
import {
  GatewayPublicConfigDto,
  CreateOrderDto,
  OrderResponseDto,
  OrderStatusDto,
  WebhookIgnoredDto,
} from './dto/order.dto'

type PeticionAutenticada = Request & { auth: SessionInfo }

@ApiTags('orders')
@Controller()
export class OrderController {
  constructor(
    private readonly createOrder: CreateOrderUseCase,
    private readonly getOrderStatus: GetOrderStatusUseCase,
    private readonly confirmPayment: ConfirmPaymentUseCase,
    @Inject(CARD_GATEWAY_CONFIG) private readonly config: CardGatewayConfig,
  ) {}

  /**
   * Lo único de la pasarela que el navegador necesita: la llave pública y la URL.
   *
   * Se sirve desde aquí y no desde una variable de compilación del frontend por dos
   * razones. Una: hay una sola fuente, y si el bundle se compiló con la URL de
   * sandbox y el backend quedó apuntando a producción, el token se crearía en un
   * sitio y el cobro en otro, sin que nada fallara hasta la conciliación. Dos: el
   * mismo build sirve para los dos ambientes, que es lo que hace falta al desplegar
   * sin recompilar.
   *
   * No se expone nada más. La llave privada y los dos secretos no salen de aquí.
   */
  @Get('payments/config')
  @ApiOperation({
    summary: 'Configuración pública de la pasarela',
    description:
      'Devuelve solo la llave pública y la URL base, que es lo que el navegador necesita para ' +
      'tokenizar la tarjeta. El ambiente va incluido para poder avisar en la interfaz cuando no ' +
      'es el de pruebas.',
  })
  @ApiOkResponse({ type: GatewayPublicConfigDto })
  configPublica(): GatewayPublicConfigDto {
    return {
      publicKey: this.config.publicKey,
      baseUrl: this.config.baseUrl,
      environment: gatewayEnvironment(this.config),
    }
  }

  @Post('orders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Crea la orden en pendiente y pide el cobro',
    description:
      'La orden se guarda en PENDING antes de llamar a la pasarela. El cuerpo lleva el token ' +
      'de la tarjeta que tokenizó el navegador y los datos de entrega; el total lo calcula el ' +
      'servidor a partir del carrito y no se acepta ninguno enviado por el cliente.',
  })
  @ApiCreatedResponse({ type: OrderResponseDto })
  @ApiBadRequestResponse({ description: 'Carrito vacío, falta el token, o el pago fue rechazado' })
  @ApiUnauthorizedResponse({ description: 'Sin sesión' })
  async create(
    @Body() dto: CreateOrderDto,
    @Req() req: PeticionAutenticada,
  ): Promise<CreatedOrder> {
    return this.desdoblar(
      await this.createOrder.execute({
        userId: req.auth.userId,
        cardToken: dto.cardToken,
        email: dto.email,
        shipping: dto.shipping,
      }),
    )
  }

  @Get('orders/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Devuelve el estado final de una orden propia',
    description:
      'Es la pantalla de resultado de la compra. Devuelve 404 también cuando la orden existe ' +
      'pero es de otra persona, para no confirmar que ese identificador existe.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: OrderStatusDto })
  @ApiNotFoundResponse({
    description: 'No hay ninguna orden con ese identificador, o no es de esta persona',
  })
  async estado(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: PeticionAutenticada,
  ): Promise<unknown> {
    return this.desdoblar(await this.getOrderStatus.execute(id, req.auth.userId))
  }

  /**
   * El webhook es público a propósito: no hay sesión que valuar, porque quien llama
   * es la pasarela. Lo que lo hace seguro es la firma, que se comprueba antes de
   * tocar nada.
   *
   * Un evento que no se puede atribuir a ninguna orden se responde **200 y
   * ignorado**: con un 4xx la pasarela reintenta hasta tres veces en 24 horas, y un
   * evento sin referencia conocida no va a convertirse en uno conocido por
   * reintentarlo.
   */
  @Post('webhooks/card-gateway')
  // 200 y no 201: este endpoint no crea nada, recibe un aviso. La pasarela solo
  // reintenta cuando la respuesta no es 200, y responder 201 seria reintentar
  // tres veces un evento que ya se aplico.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recibe el estado del pago desde la pasarela',
    description:
      'Firma obligatoria: se calcula con los campos que el propio evento declara, y sin ella ' +
      'cualquiera que conozca la URL podría marcar una orden como pagada. El evento se procesa ' +
      'una sola vez aunque llegue dos veces.',
  })
  @ApiCreatedResponse({ description: 'Evento aplicado, o ignorado a propósito' })
  @ApiUnauthorizedResponse({ description: 'La firma del evento no cuadra' })
  async webhook(
    @Body() cuerpo: Record<string, unknown>,
    @Headers('x-event-checksum') checksum: string | undefined,
  ): Promise<WebhookIgnoredDto | { applied: boolean; orderNumber: string }> {
    const referencia = leerReferencia(cuerpo)
    const estado = leerEstado(cuerpo)

    if (referencia === null || estado === null) {
      return { ignored: true, motivo: 'el evento no trae referencia ni estado' }
    }

    const resultado = await this.confirmPayment.execute(
      {
        providerReference: referencia,
        status: estado,
        rawEvent: cuerpo,
        receivedAt: new Date(),
      },
      { eventChecksum: checksum },
    )

    if (resultado.ok) {
      return resultado.value.applied
        ? { applied: true, orderNumber: resultado.value.order.orderNumber }
        : { applied: false, orderNumber: resultado.value.order.orderNumber }
    }

    // 404 y 401 no se reintentan: reintentar un evento con la firma equivocada, o de
    // una transacción que no existe, no lo va a volver válido.
    if (resultado.error.code === 'UNKNOWN_PAYMENT') {
      return { ignored: true, motivo: 'referencia desconocida' }
    }

    throw resultado.error
  }

  private desdoblar<T>(resultado: Result<T, AppError>): T {
    if (!resultado.ok) {
      throw resultado.error
    }

    return resultado.value
  }
}

const leer = (cuerpo: Record<string, unknown>, camino: string): unknown =>
  camino.split('.').reduce<unknown>((valor, parte) => {
    if (valor === null || typeof valor !== 'object') {
      return undefined
    }

    return (valor as Record<string, unknown>)[parte]
  }, cuerpo)

const leerReferencia = (cuerpo: Record<string, unknown>): string | null => {
  const id = leer(cuerpo, 'data.transaction.id')

  return typeof id === 'string' && id.length > 0 ? id : null
}

const ESTADOS = ['PENDING', 'APPROVED', 'DECLINED', 'ERROR', 'CANCELLED'] as const

type EstadoDelPago = (typeof ESTADOS)[number]

const leerEstado = (cuerpo: Record<string, unknown>): EstadoDelPago | null => {
  const estado = leer(cuerpo, 'data.transaction.status')

  return ESTADOS.find((conocido) => conocido === estado) ?? null
}
