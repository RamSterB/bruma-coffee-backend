import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { GeographyRepositoryPort } from '../../../domain/ports/geography.repository'
import { ListCitiesResponseDto, ListDepartmentsResponseDto } from './dto/geography.dto'

/**
 * La lista de departamentos y ciudades, pública a propósito.
 *
 * El formulario de entrega la necesita **antes** de que nadie haya iniciado
 * sesión, y no puede llevarla escrita en el frontend: sería una segunda copia
 * de la misma lista, y el día que una no cuadre con la otra el formulario
 * rechaza una ciudad que el servidor aceptaba.
 *
 * No enseña nada de nadie: son datos de un catálogo público del país.
 */
@ApiTags('geography')
@Controller('geography')
export class GeographyController {
  constructor(private readonly geography: GeographyRepositoryPort) {}

  @Get('departments')
  @ApiOperation({
    summary: 'Listar los departamentos donde se entrega',
    description:
      'Los 32 departamentos de Colombia más Bogotá D. C., que no es departamento pero se entrega igual. No necesita sesión.',
  })
  @ApiOkResponse({ type: ListDepartmentsResponseDto })
  async listDepartments(): Promise<ListDepartmentsResponseDto> {
    const departamentos = await this.geography.listDepartments()

    // La lista va dentro de `items`, como en el resto de la API. Devolverla suelta era
    // un fallo silencioso: el cliente lee `items`, no encontraba la lista, y el
    // desplegable del formulario de entrega salía vacío sin avisar.
    return {
      items: departamentos.map((department) => ({ id: department.id, name: department.name })),
    }
  }

  @Get('departments/:departmentId/cities')
  @ApiOperation({
    summary: 'Listar las ciudades de un departamento',
    description:
      'Las ciudades grandes de cada departamento. Es la lista que se usa en el formulario de entrega.',
  })
  @ApiOkResponse({ type: ListCitiesResponseDto })
  async listCities(
    @Param('departmentId', new ParseUUIDPipe({ version: '4' })) departmentId: string,
  ): Promise<ListCitiesResponseDto> {
    const department = await this.geography.findDepartmentById(departmentId)

    if (department === null) {
      throw new NotFoundException('Ese departamento no existe')
    }

    const cities = await this.geography.listCitiesByDepartment(departmentId)

    return { items: cities.map((city) => ({ id: city.id, name: city.name })) }
  }
}
