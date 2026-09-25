import { ApiProperty } from '@nestjs/swagger'
import { CoffeeResponseDto } from './coffee-response.dto'

export class PaginatedCoffeesResponseDto {
  @ApiProperty({ type: [CoffeeResponseDto] })
  items!: CoffeeResponseDto[]

  @ApiProperty({
    example: 12,
    description: 'Total de cafés que cumplen los filtros',
  })
  total!: number

  @ApiProperty({ example: 1 })
  page!: number

  @ApiProperty({ example: 12 })
  limit!: number

  @ApiProperty({ example: 3, description: 'Total de páginas disponibles' })
  totalPages!: number
}
