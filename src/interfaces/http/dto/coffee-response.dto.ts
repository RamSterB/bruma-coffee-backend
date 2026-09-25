import { ApiProperty } from '@nestjs/swagger'

export class CoffeeResponseDto {
  @ApiProperty({ example: 1 })
  id!: number

  @ApiProperty({ example: 'Geisha Huila' })
  name!: string

  @ApiProperty({ example: 'Huila, Colombia' })
  region!: string

  @ApiProperty({ example: 28.5 })
  price!: number

  @ApiProperty({ example: '2026-09-24T00:00:00.000Z' })
  createdAt!: Date
}