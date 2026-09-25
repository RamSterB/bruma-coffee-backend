import { ApiProperty } from '@nestjs/swagger'
import { IsNumber, IsString, Min } from 'class-validator'

export class CreateCoffeeDto {
  @ApiProperty({ example: 'Geisha Huila', description: 'Nombre del café' })
  @IsString()
  name!: string

  @ApiProperty({ example: 'Huila, Colombia', description: 'Región de origen' })
  @IsString()
  region!: string

  @ApiProperty({ example: 28.5, minimum: 0, description: 'Precio por libra (USD)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number
}