import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

/**
 * Lo que llega a crear la orden. Fíjate en lo que **no** está: ni el número de
 * tarjeta (que no se tokeniza aquí, sino en el navegador) ni el total (que lo
 * calcula el servidor). Un DTO es también la lista de lo que el cliente no puede
 * decidir, y esa lista es corta a propósito.
 */
export class ShippingAddressDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fullName!: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  documentNumber!: string

  @ApiProperty({ description: 'Celular de diez dígitos' })
  @IsString()
  @Matches(/^3\d{9}$/, { message: 'El celular debe tener diez dígitos y empezar por 3' })
  phone!: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  address!: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  city!: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  department!: string
}

export class CreateOrderDto {
  @ApiProperty({ description: 'Token de la tarjeta devuelto por la tokenización del navegador' })
  @IsString()
  @IsNotEmpty()
  cardToken!: string

  @ApiProperty()
  @IsEmail()
  email!: string

  @ApiProperty({ type: ShippingAddressDto })
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shipping!: ShippingAddressDto
}

export class OrderItemDto {
  @ApiProperty()
  variantId!: string

  @ApiProperty()
  coffeeName!: string

  @ApiProperty({ nullable: true, type: Number })
  weightGrams!: number | null

  @ApiProperty()
  unitPrice!: number

  @ApiProperty()
  quantity!: number

  @ApiProperty()
  lineTotal!: number
}

export class OrderResponseDto {
  @ApiProperty()
  id!: string

  @ApiProperty({ description: 'Número legible, del tipo BC-20260927-0001' })
  orderNumber!: string

  @ApiProperty({ enum: ['PENDING', 'PAID', 'FAILED', 'CANCELLED'] })
  status!: string

  @ApiProperty({ enum: ['PENDING', 'APPROVED', 'DECLINED', 'ERROR', 'CANCELLED'] })
  paymentStatus!: string

  @ApiProperty()
  customerName!: string

  @ApiProperty()
  customerDocument!: string

  @ApiProperty()
  customerPhone!: string

  @ApiProperty()
  shippingAddress!: string

  @ApiProperty()
  shippingCity!: string

  @ApiProperty()
  shippingDepartment!: string

  @ApiProperty({ type: [OrderItemDto] })
  items!: OrderItemDto[]

  @ApiProperty()
  subtotal!: number

  @ApiProperty()
  taxAmount!: number

  @ApiProperty()
  shippingAmount!: number

  @ApiProperty()
  total!: number

  @ApiProperty({ description: 'Referencia del cobro en la pasarela' })
  paymentReference!: string
}

export class DeliveryDto {
  @ApiProperty()
  status!: string

  @ApiProperty({ nullable: true, type: String })
  carrier!: string | null

  @ApiProperty({ nullable: true, type: String })
  trackingCode!: string | null
}

export class OrderStatusDto {
  @ApiProperty()
  id!: string

  @ApiProperty()
  orderNumber!: string

  @ApiProperty({ enum: ['PENDING', 'PAID', 'FAILED', 'CANCELLED'] })
  status!: string

  @ApiProperty({ enum: ['PENDING', 'APPROVED', 'DECLINED', 'ERROR', 'CANCELLED'] })
  paymentStatus!: string

  @ApiProperty()
  total!: number

  @ApiProperty({ type: DeliveryDto, nullable: true })
  delivery!: DeliveryDto | null
}

export class WebhookIgnoredDto {
  @ApiProperty({ description: 'El evento se recibió y se ignoró a propósito' })
  ignored!: boolean

  @ApiPropertyOptional()
  motivo?: string
}

export class GatewayPublicConfigDto {
  @ApiProperty({ description: 'Llave pública de la pasarela' })
  publicKey!: string

  @ApiProperty({ description: 'URL base de la API de la pasarela' })
  baseUrl!: string

  @ApiProperty({
    enum: ['sandbox', 'production', null],
    nullable: true,
    description: 'Ambiente deducido del prefijo de las llaves',
  })
  environment!: 'sandbox' | 'production' | null
}

export class OrderListLineDto {
  @ApiProperty()
  variantId!: string

  @ApiProperty()
  coffeeName!: string

  @ApiProperty({ nullable: true, type: Number })
  weightGrams!: number | null

  @ApiProperty()
  quantity!: number

  @ApiProperty()
  lineTotal!: number
}

export class OrderListItemDto {
  @ApiProperty()
  id!: string

  @ApiProperty()
  orderNumber!: string

  @ApiProperty({ enum: ['PENDING', 'PAID', 'FAILED', 'CANCELLED'] })
  status!: string

  @ApiProperty({ enum: ['PENDING', 'APPROVED', 'DECLINED', 'ERROR', 'CANCELLED'] })
  paymentStatus!: string

  @ApiProperty()
  total!: number

  @ApiProperty()
  createdAt!: string

  @ApiProperty({ type: [OrderListLineDto] })
  items!: OrderListLineDto[]
}
