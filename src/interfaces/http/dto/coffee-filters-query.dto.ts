import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { CoffeeProcess } from '../../../domain/enums/coffee-process.enum'
import { CoffeeRegion } from '../../../domain/enums/coffee-region.enum'
import { RoastLevel } from '../../../domain/enums/roast-level.enum'
import { MAX_PAGE_SIZE } from '../../../application/use-cases/get-coffees.use-case'
import { DEFAULT_PAGE_SIZE } from './pagination'

export class CoffeeFiltersQueryDto {
  @ApiProperty({
    enum: CoffeeRegion,
    required: false,
    description: 'Filtra por región de origen',
  })
  @IsOptional()
  @IsString()
  region?: CoffeeRegion

  @ApiProperty({
    enum: CoffeeProcess,
    required: false,
    description: 'Filtra por proceso',
  })
  @IsOptional()
  @IsString()
  process?: CoffeeProcess

  @ApiProperty({
    enum: RoastLevel,
    required: false,
    description: 'Filtra por nivel de tueste',
  })
  @IsOptional()
  @IsString()
  roastLevel?: RoastLevel

  @ApiProperty({
    required: false,
    description: 'Busca en nombre, descripción y notas de cata',
    example: 'geisha',
  })
  @IsOptional()
  @IsString()
  search?: string

  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1

  @ApiProperty({
    required: false,
    default: DEFAULT_PAGE_SIZE,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit = DEFAULT_PAGE_SIZE
}
