import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm'
import type { CityTypeOrmEntity } from './city.typeorm.entity'

const CITY_ENTITY_NAME = 'CityTypeOrmEntity'

/**
 * Los 32 departamentos de Colombia, más Bogotá D. C. que no es departamento pero
 * se entrega igual. Están en la base y no en el código porque la validación de
 * "esta ciudad es de este departamento" necesita poder consultarse, y una lista
 * escrita a mano en un archivo se queda vieja sin que nadie se entere.
 */
@Entity('departments')
export class DepartmentTypeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 40, unique: true })
  name!: string

  @OneToMany(CITY_ENTITY_NAME, 'department')
  cities?: CityTypeOrmEntity[]
}
