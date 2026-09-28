import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/**
 * Lo que contesta el chequeo de salud.
 *
 * DTO y no un objeto en linea, como el resto de la API: es lo que hace que la
 * documentacion muestre la forma en vez de `object`, y que el contrato este escrito
 * una vez.
 */
export class HealthResponseDto {
  @ApiProperty({ description: 'ok cuando el servicio y la base de datos responden', example: 'ok' })
  status!: string

  @ApiPropertyOptional({
    description: 'Qué parte falla, para no tener que adivinarlo desde la consola',
    example: 'base-de-datos',
  })
  causa?: string
}
