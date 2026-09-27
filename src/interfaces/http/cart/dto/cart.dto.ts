import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

/**
 * El 99 es un tope técnico, no una regla de negocio: el tope real es el stock de
 * la variante, que es el dato que manda. Aquí solo se evita que alguien
 * mande una cantidad de mil millones y deje que la base la rechace.
 */
export const MAX_CART_QUANTITY_PER_LINE = 99

/** Tope de líneas que se aceptan en una subida de carrito local. */
export const MAX_CART_LINES = 50

export class AddCartItemDto {
  @ApiProperty({ format: 'uuid', description: 'Variante que se agrega' })
  @IsUUID('4', { message: 'La variante no tiene un identificador valido' })
  variantId: string

  @ApiProperty({
    example: 1,
    minimum: 1,
    maximum: MAX_CART_QUANTITY_PER_LINE,
    description: 'Cuantas unidades se agregan. Se suman a las que ya habia en el carrito.',
  })
  @Type(() => Number)
  @IsInt({ message: 'La cantidad tiene que ser un numero entero' })
  @Min(1, { message: 'La cantidad tiene que ser al menos 1' })
  @Max(MAX_CART_QUANTITY_PER_LINE, { message: 'La cantidad no puede superar 99 unidades' })
  quantity: number
}

export class UpdateCartItemQuantityDto {
  @ApiProperty({
    example: 3,
    minimum: 1,
    maximum: MAX_CART_QUANTITY_PER_LINE,
    description:
      'Cantidad exacta a la que queda la linea. Para quitarla del todo esta el endpoint de borrado: mandar 0 aqui es un error.',
  })
  @Type(() => Number)
  @IsInt({ message: 'La cantidad tiene que ser un numero entero' })
  @Min(1, { message: 'La cantidad tiene que ser al menos 1' })
  @Max(MAX_CART_QUANTITY_PER_LINE, { message: 'La cantidad no puede superar 99 unidades' })
  quantity: number
}

export class MergeCartLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'La variante no tiene un identificador valido' })
  variantId: string

  @ApiProperty({ example: 2, minimum: 1, maximum: MAX_CART_QUANTITY_PER_LINE })
  @Type(() => Number)
  @IsInt({ message: 'La cantidad tiene que ser un numero entero' })
  @Min(1, { message: 'La cantidad tiene que ser al menos 1' })
  @Max(MAX_CART_QUANTITY_PER_LINE, { message: 'La cantidad no puede superar 99 unidades' })
  quantity: number
}

export class MergeLocalCartDto {
  @ApiProperty({
    type: [MergeCartLineDto],
    description:
      'Lineas del carrito que tenia en el navegador. Solo se guardan identificador y cantidad: el precio y el stock los pone el servidor.',
  })
  @IsArray()
  @ArrayMaxSize(MAX_CART_LINES, { message: 'Un carrito no puede tener mas de 50 lineas' })
  @ValidateNested({ each: true })
  @Type(() => MergeCartLineDto)
  items: MergeCartLineDto[]
}

export class CartItemDto {
  @ApiProperty({ format: 'uuid' })
  variantId: string

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Null si la variante ya no existe' })
  coffeeId: string | null

  @ApiProperty({ example: 'Cafe Nariño', nullable: true })
  coffeeName: string | null

  @ApiProperty({ example: 250, nullable: true, description: 'Gramos de la presentacion' })
  weightGrams: number | null

  @ApiProperty({ example: 42000, description: 'Precio del catalogo en el momento de la lectura' })
  price: number

  @ApiProperty({ example: 10, description: 'Stock actual de la variante' })
  stock: number

  @ApiProperty({ example: 2, description: 'Cantidad guardada, ya recortada al stock' })
  quantity: number

  @ApiProperty({ example: 84000, description: 'Precio por cantidad; cero si no se puede comprar' })
  subtotal: number

  @ApiProperty({
    example: true,
    description:
      'Si la linea se puede comprar. False cuando la variante esta retirada, desactivada o sin stock; en ese caso se puede quitar del carrito pero no se cobra.',
  })
  isPurchasable: boolean
}

export class CartDto {
  @ApiProperty({ type: [CartItemDto] })
  items: CartItemDto[]

  @ApiProperty({ example: 84000, description: 'Suma de las lineas que si se pueden comprar' })
  subtotal: number

  @ApiProperty({ example: 1, description: 'Numero de lineas del carrito' })
  totalItems: number

  @ApiProperty({ example: 1, description: 'Numero de lineas que si se pueden comprar' })
  purchasableItems: number
}

export class OrderSummaryLineDto {
  @ApiProperty({ format: 'uuid' })
  variantId: string

  @ApiProperty({ example: 'Cafe Nariño' })
  coffeeName: string

  @ApiProperty({ example: 42000, description: 'Precio unitario del catalogo' })
  unitPrice: number

  @ApiProperty({ example: 2 })
  quantity: number

  @ApiProperty({ example: 84000, description: 'Precio unitario por cantidad' })
  subtotal: number
}

export class OrderSummaryDto {
  @ApiProperty({ type: [OrderSummaryLineDto] })
  lines: OrderSummaryLineDto[]

  @ApiProperty({ example: 84000, description: 'Suma de las lineas, sin impuestos ni envio' })
  subtotal: number

  @ApiProperty({ example: 15960, description: 'IVA del 19 % sobre el subtotal de los productos' })
  tax: number

  @ApiProperty({
    example: 10000,
    description: 'Tarifa fija de envio, o cero si el subtotal alcanza el umbral',
  })
  shipping: number

  @ApiProperty({ example: 109960, description: 'Subtotal mas IVA mas envio' })
  total: number

  @ApiProperty({
    example: false,
    description: 'Si el envio quedo gratis por alcanzar el umbral, para poder decirlo en el modal',
  })
  isFreeShipping: boolean
}

export class ShippingDataDto {
  @ApiProperty({ example: 'Persona Compradora' })
  @IsString()
  @MinLength(3, { message: 'El nombre necesita al menos 3 caracteres' })
  @MaxLength(120)
  fullName: string

  @ApiProperty({ example: '1098765434', description: 'Documento, con o sin puntos y guiones' })
  @IsString()
  @Matches(/^[\d.\s()-]+$/, { message: 'El documento solo lleva numeros' })
  @MaxLength(20)
  documentNumber: string

  @ApiProperty({
    example: '3001234567',
    description:
      'Celular de 10 digitos. No se aceptan fijos: un pedido se entrega a un telefono que la persona lleva encima.',
  })
  @IsString()
  // Aqui solo se miran los caracteres. El largo lo comprueba el dominio, que
  // quita espacios, guiones y el prefijo de pais antes de contar: medir aqui la
  // cadena cruda rechazaria "300 123 4567", que es como lo escribe la gente.
  @Matches(/^[\d+\s()-]+$/, { message: 'El telefono solo lleva numeros' })
  @MaxLength(20)
  phone: string

  @ApiProperty({ example: 'Carrera 7 con Calle 72, casa 3' })
  @IsString()
  @MinLength(5, { message: 'La direccion necesita al menos 5 caracteres' })
  @MaxLength(200)
  address: string

  @ApiProperty({ example: 'Bogotá' })
  @IsString()
  @MinLength(2, { message: 'La ciudad es obligatoria' })
  @MaxLength(80)
  city: string

  @ApiProperty({ example: 'Cundinamarca' })
  @IsString()
  @MinLength(2, { message: 'El departamento es obligatorio' })
  @MaxLength(40)
  department: string
}

export class ShippingQuoteDto extends OrderSummaryDto {
  @ApiProperty({ type: ShippingDataDto })
  shippingData: ShippingDataDto

  @ApiProperty({
    example: false,
    description:
      'Siempre false aqui: los datos se confirmaran con la orden. Esta llamada solo valida y devuelve el total.',
  })
  persisted: boolean
}
