import { ApiProperty } from '@nestjs/swagger'
import { CoffeeProcess } from '../../../domain/enums/coffee-process.enum'
import { CoffeeRegion } from '../../../domain/enums/coffee-region.enum'
import { RoastLevel } from '../../../domain/enums/roast-level.enum'

export class CoffeeVariantResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  })
  id!: string

  @ApiProperty({ example: 250, description: 'Peso en gramos' })
  weightGrams!: number

  @ApiProperty({ example: 42000, description: 'Precio en pesos colombianos' })
  price!: number

  @ApiProperty({ example: 30, description: 'Unidades disponibles' })
  stock!: number

  @ApiProperty({ example: true })
  isActive!: boolean
}

export class CoffeeResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '9a1f0c2e-5d3b-4a7f-8c1d-2e6b4a9f0c33',
  })
  id!: string

  @ApiProperty({ example: 'Geisha del Huila' })
  name!: string

  @ApiProperty({ example: 'Café de altura con notas florales y cítricas.' })
  description!: string

  @ApiProperty({ enum: RoastLevel, example: RoastLevel.LIGHT })
  roastLevel!: RoastLevel

  @ApiProperty({ enum: CoffeeProcess, example: CoffeeProcess.WASHED })
  process!: CoffeeProcess

  @ApiProperty({ enum: CoffeeRegion, example: CoffeeRegion.HUILA })
  region!: CoffeeRegion

  @ApiProperty({
    type: [String],
    example: ['jasmín', 'bergamota', 'melocotón'],
  })
  tastingNotes!: string[]

  @ApiProperty({
    example: 42000,
    nullable: true,
    description: 'Precio de la variante más barata con stock',
  })
  priceFrom!: number | null

  @ApiProperty({ type: [CoffeeVariantResponseDto] })
  variants!: CoffeeVariantResponseDto[]

  @ApiProperty({ format: 'date-time', example: '2026-09-25T00:00:00.000Z' })
  createdAt!: Date

  @ApiProperty({ format: 'date-time', example: '2026-09-25T00:00:00.000Z' })
  updatedAt!: Date
}
