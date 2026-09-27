import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { GeographyRepositoryPort } from '../../domain/ports/geography.repository'
import { DepartmentTypeOrmEntity } from './department.typeorm.entity'
import { CityTypeOrmEntity } from './city.typeorm.entity'

/**
 * Las ciudades y los departamentos se comparan con `unaccent` y en minúsculas,
 * dentro de la consulta y no con un `toLowerCase` en TypeScript: si el listado
 * viene de una base con acentos y la búsqueda no los quita, "Bogota" no encuentra
 * "Bogotá". Es la diferencia entre un formulario usable y uno que rechaza lo que
 * la persona acaba de escribir.
 *
 * La comparación va en SQL a propósito, y no como un `unaccent` en JavaScript,
 * porque haría falta replicar en el código el mismo catálogo de sustituciones que
 * usa la base, y en cuanto difieran los dos, uno de los dos miente.
 */
@Injectable()
export class TypeOrmGeographyRepository implements GeographyRepositoryPort {
  constructor(
    @InjectRepository(DepartmentTypeOrmEntity)
    private readonly departments: Repository<DepartmentTypeOrmEntity>,
  ) {}

  private get cities(): Repository<CityTypeOrmEntity> {
    return this.departments.manager.getRepository(CityTypeOrmEntity)
  }

  async listDepartments(): Promise<{ id: string; name: string }[]> {
    const encontrados = await this.departments.find({ order: { name: 'ASC' } })

    return encontrados.map((department) => ({ id: department.id, name: department.name }))
  }

  async findDepartmentByName(name: string): Promise<{ id: string; name: string } | null> {
    const encontrado = await this.departments
      .createQueryBuilder('department')
      .where('unaccent(lower(department.name)) = unaccent(lower(:name))', { name: name.trim() })
      .getOne()

    return encontrado === null ? null : { id: encontrado.id, name: encontrado.name }
  }

  async findCityInDepartment(
    city: string,
    departmentId: string,
  ): Promise<{ id: string; name: string; departmentId: string } | null> {
    const encontrada = await this.cities
      .createQueryBuilder('city')
      .where('unaccent(lower(city.name)) = unaccent(lower(:name))', { name: city.trim() })
      .andWhere('city.departmentId = :departmentId', { departmentId })
      .getOne()

    return encontrada === null
      ? null
      : { id: encontrada.id, name: encontrada.name, departmentId: encontrada.departmentId }
  }
}
