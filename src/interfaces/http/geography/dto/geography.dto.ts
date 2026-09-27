import { ApiProperty } from '@nestjs/swagger'

export class DepartmentDto {
  @ApiProperty({ format: 'uuid' })
  id: string

  @ApiProperty({ example: 'Cundinamarca' })
  name: string
}

export class CityDto {
  @ApiProperty({ format: 'uuid' })
  id: string

  @ApiProperty({ example: 'Bogotá' })
  name: string
}

export class ListDepartmentsResponseDto {
  @ApiProperty({ type: [DepartmentDto] })
  items: DepartmentDto[]
}

export class ListCitiesResponseDto {
  @ApiProperty({ type: [CityDto] })
  items: CityDto[]
}
