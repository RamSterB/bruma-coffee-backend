import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import type { Request } from 'express'
import { AddItemToCartUseCase } from '../../../application/use-cases/add-item-to-cart.use-case'
import { ClearCartUseCase } from '../../../application/use-cases/clear-cart.use-case'
import { GetCartUseCase } from '../../../application/use-cases/get-cart.use-case'
import { GetOrderSummaryUseCase } from '../../../application/use-cases/get-order-summary.use-case'
import { QuoteShippingUseCase } from '../../../application/use-cases/quote-shipping.use-case'
import { MergeLocalCartUseCase } from '../../../application/use-cases/merge-local-cart.use-case'
import { RemoveCartItemUseCase } from '../../../application/use-cases/remove-cart-item.use-case'
import { UpdateCartItemQuantityUseCase } from '../../../application/use-cases/update-cart-item-quantity.use-case'
import type { Cart } from '../../../domain/entities/cart.entity'
import type { OrderSummary } from '../../../domain/entities/order-summary.entity'
import type { AppError } from '../../../domain/errors/app-error'
import type { Result } from '../../../domain/result'
import { JwtAuthGuard, type SessionInfo } from '../auth/auth.guards'
import {
  AddCartItemDto,
  CartDto,
  CartItemDto,
  MergeLocalCartDto,
  OrderSummaryDto,
  ShippingDataDto,
  ShippingQuoteDto,
  OrderSummaryLineDto,
  UpdateCartItemQuantityDto,
} from './dto/cart.dto'

type PeticionAutenticada = Request & { auth: SessionInfo }

/**
 * El carrito solo existe en el servidor para quien tiene cuenta: el invitado lleva
 * el suyo en el navegador.
 *
 * El `userId` sale siempre del token de acceso y nunca del cuerpo ni de la URL.
 * Es la única razón por la que una persona no puede tocar el carrito de otra: si
 * el identificador se aceptara en la petición, bastaría cambiarlo por otro.
 */
@ApiTags('cart')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token de acceso o no es válido' })
@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(
    private readonly getCartUseCase: GetCartUseCase,
    private readonly addItemToCartUseCase: AddItemToCartUseCase,
    private readonly updateCartItemQuantityUseCase: UpdateCartItemQuantityUseCase,
    private readonly removeCartItemUseCase: RemoveCartItemUseCase,
    private readonly clearCartUseCase: ClearCartUseCase,
    private readonly mergeLocalCartUseCase: MergeLocalCartUseCase,
    private readonly getOrderSummaryUseCase: GetOrderSummaryUseCase,
    private readonly quoteShippingUseCase: QuoteShippingUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Ver el carrito',
    description:
      'Devuelve las líneas guardadas con el precio y el stock del catálogo en este momento, y el subtotal de las que sí se pueden comprar. Las líneas no comprables vienen marcadas, para que el cajón las avise y ofrezca quitarlas.',
  })
  @ApiOkResponse({ type: CartDto })
  async getCart(@Req() req: PeticionAutenticada): Promise<CartDto> {
    return CartController.aDto(await this.getCartUseCase.execute(req.auth.userId))
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Ver el resumen de la orden antes de pagar',
    description:
      'Devuelve el detalle economico con el desglose completo: subtotal, envio, IVA del 19 % y total. Todos los importes los calcula el backend con la configuracion del entorno; el navegador solo los muestra, y por eso no puede negociar su propio precio.',
  })
  @ApiOkResponse({ type: OrderSummaryDto })
  async getSummary(@Req() req: PeticionAutenticada): Promise<OrderSummaryDto> {
    const resumen = await this.getOrderSummaryUseCase.execute(req.auth.userId)

    return CartController.aResumenDto(resumen)
  }

  @Post('shipping-quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirmar el total con los datos de entrega',
    description:
      'Valida los datos de entrega, comprueba que la ciudad pertenezca al departamento elegido y devuelve el desglose ya confirmado. No guarda nada todavia: los datos se copian a la orden cuando se confirma la compra.',
  })
  @ApiOkResponse({ type: ShippingQuoteDto })
  @ApiBadRequestResponse({
    description: 'Algun dato no es valido, o la ciudad no es de ese departamento',
  })
  async quoteShipping(
    @Req() req: PeticionAutenticada,
    @Body() dto: ShippingDataDto,
  ): Promise<ShippingQuoteDto> {
    const resultado = await this.quoteShippingUseCase.execute({
      userId: req.auth.userId,
      ...dto,
    })

    if (!resultado.ok) {
      throw resultado.error
    }

    const resumen = resultado.value

    return {
      ...CartController.aResumenDto(resumen),
      shippingData: {
        fullName: resumen.shippingData.fullName,
        documentNumber: resumen.shippingData.documentNumber,
        phone: resumen.shippingData.phone,
        address: resumen.shippingData.address,
        city: resumen.shippingData.city,
        department: resumen.shippingData.department,
      },
      persisted: resumen.persisted,
    }
  }

  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Agregar una variante al carrito',
    description:
      'Suma la cantidad a la que ya había de esa variante, que es lo que pasa al pulsar el botón dos veces. Si la cantidad supera el stock, la línea se guarda recortada al stock.',
  })
  @ApiOkResponse({ type: CartDto })
  @ApiBadRequestResponse({ description: 'El identificador o la cantidad no son válidos' })
  @ApiNotFoundResponse({ description: 'La variante no existe' })
  @ApiConflictResponse({ description: 'La variante está desactivada o no tiene stock' })
  async addItem(@Req() req: PeticionAutenticada, @Body() dto: AddCartItemDto): Promise<CartDto> {
    return CartController.aDto(
      this.desdoblar(
        await this.addItemToCartUseCase.execute({
          userId: req.auth.userId,
          variantId: dto.variantId,
          quantity: dto.quantity,
        }),
      ),
    )
  }

  @Patch('items/:variantId')
  @ApiOperation({
    summary: 'Cambiar la cantidad de una línea',
    description:
      'Deja la línea en la cantidad indicada, recortada al stock. Para quitar la línea del todo está el endpoint de borrado: mandar 0 aquí es un error, no un atajo.',
  })
  @ApiParam({ name: 'variantId', format: 'uuid', description: 'Variante cuya cantidad se cambia' })
  @ApiOkResponse({ type: CartDto })
  @ApiBadRequestResponse({ description: 'La cantidad no es válida' })
  @ApiNotFoundResponse({ description: 'La variante no está en el carrito' })
  async updateItem(
    @Req() req: PeticionAutenticada,
    @Param('variantId', new ParseUUIDPipe({ version: '4' })) variantId: string,
    @Body() dto: UpdateCartItemQuantityDto,
  ): Promise<CartDto> {
    return CartController.aDto(
      this.desdoblar(
        await this.updateCartItemQuantityUseCase.execute({
          userId: req.auth.userId,
          variantId,
          quantity: dto.quantity,
        }),
      ),
    )
  }

  @Delete('items/:variantId')
  @ApiOperation({ summary: 'Quitar una línea del carrito' })
  @ApiParam({ name: 'variantId', format: 'uuid' })
  @ApiOkResponse({ type: CartDto })
  @ApiNotFoundResponse({ description: 'La variante no está en el carrito' })
  async removeItem(
    @Req() req: PeticionAutenticada,
    @Param('variantId', new ParseUUIDPipe({ version: '4' })) variantId: string,
  ): Promise<CartDto> {
    return CartController.aDto(
      this.desdoblar(
        await this.removeCartItemUseCase.execute({ userId: req.auth.userId, variantId }),
      ),
    )
  }

  @Delete()
  @ApiOperation({
    summary: 'Vaciar el carrito',
    description: 'Quita todas las líneas. También se usa cuando se confirma una orden.',
  })
  @ApiOkResponse({ type: CartDto })
  async clearCart(@Req() req: PeticionAutenticada): Promise<CartDto> {
    return CartController.aDto(this.desdoblar(await this.clearCartUseCase.execute(req.auth.userId)))
  }

  @Post('merge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Subir el carrito del navegador al iniciar sesión',
    description:
      'Si el carrito del servidor está vacío, se guarda el que tenía el navegador. Si el servidor ya tenía algo, gana el del servidor y lo del navegador se descarta entero. La respuesta es siempre el carrito resultante, para que el cliente lo reemplace sin tener que adivinar qué se descartó.',
  })
  @ApiOkResponse({ type: CartDto })
  @ApiBadRequestResponse({ description: 'Alguna línea no es válida o hay demasiadas' })
  async merge(@Req() req: PeticionAutenticada, @Body() dto: MergeLocalCartDto): Promise<CartDto> {
    return CartController.aDto(
      this.desdoblar(
        await this.mergeLocalCartUseCase.execute({
          userId: req.auth.userId,
          items: dto.items,
        }),
      ),
    )
  }

  private desdoblar(resultado: Result<Cart, AppError>): Cart {
    if (!resultado.ok) {
      throw resultado.error
    }

    return resultado.value
  }

  private static aResumenDto(resumen: OrderSummary): OrderSummaryDto {
    return {
      lines: resumen.lines.map((linea): OrderSummaryLineDto => ({
        variantId: linea.variantId,
        coffeeName: linea.coffeeName,
        unitPrice: linea.unitPrice,
        quantity: linea.quantity,
        subtotal: linea.subtotal,
      })),
      subtotal: resumen.subtotal,
      tax: resumen.tax,
      shipping: resumen.shipping,
      total: resumen.total,
      isFreeShipping: resumen.isFreeShipping,
    }
  }

  private static aDto(cart: Cart): CartDto {
    return {
      items: cart.items.map((item): CartItemDto => ({
        variantId: item.variantId,
        coffeeId: item.coffeeId,
        coffeeName: item.coffeeName,
        weightGrams: item.weightGrams,
        price: item.price,
        stock: item.stock,
        quantity: item.quantity,
        subtotal: item.subtotal,
        isPurchasable: item.isPurchasable,
      })),
      subtotal: cart.subtotal,
      totalItems: cart.totalItems,
      purchasableItems: cart.purchasableItems,
    }
  }
}
