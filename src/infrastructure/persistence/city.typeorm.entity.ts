import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import type { DepartmentTypeOrmEntity } from './department.typeorm.entity'

const DEPARTMENT_ENTITY_NAME = 'DepartmentTypeOrmEntity'

/**
 * Las ciudades de cada departamento. El UNIQUE es sobre el par, no sobre el
 * nombre: hay nombres repetidos en el país y proibirlos sería tener una lista que
 * no cuadra con la realidad.
 */
@Index('uq_cities_department_name', ['departmentId', 'name'], { unique: true })
@Entity('cities')
export class CityTypeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 80 })
  name!: string

  @Column({ name: 'department_id', type: 'uuid' })
  departmentId!: string

  @ManyToOne(DEPARTMENT_ENTITY_NAME, 'cities', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'department_id' })
  department!: DepartmentTypeOrmEntity
}
