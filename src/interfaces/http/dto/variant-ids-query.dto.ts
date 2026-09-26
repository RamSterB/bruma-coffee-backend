import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator'
import { MAX_VARIANTS_PER_QUERY } from '../../../application/use-cases/get-variants-by-ids.use-case'

/**
 * Los ids llegan como una lista separada por comas, que es lo que hace cómodo
 * un `GET`: la petición es cacheable y el carrito cabe de sobra en una URL.
 */
export class VariantIdsQueryDto {
  @ApiProperty({
    description: 'Ids de variante separados por comas',
    type: String,
    example: '6f1b0f2e-1f2a-4c3d-8e9f-0a1b2c3d4e5f',
  })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value : String(value ?? '').split(','),
  )
  @IsArray()
  @ArrayMaxSize(MAX_VARIANTS_PER_QUERY)
  @IsUUID('4', { each: true })
  variantIds: string[]
}
