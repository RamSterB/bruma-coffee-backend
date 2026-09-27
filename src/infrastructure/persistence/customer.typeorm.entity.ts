import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm'
import { normalizeEmail } from '../../domain/validation/normalize-email'
import { Customer } from '../../domain/entities/customer.entity'

@Entity('customers')
export class CustomerTypeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 320, unique: true })
  email!: string

  @Column({ name: 'full_name', type: 'varchar', length: 160 })
  fullName!: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  toDomain(): Customer {
    return Customer.reconstitute({
      id: this.id,
      email: normalizeEmail(this.email),
      fullName: this.fullName,
      createdAt: this.createdAt,
    })
  }

  static fromDomain(customer: Customer): CustomerTypeOrmEntity {
    const entity = new CustomerTypeOrmEntity()

    // Un customer recien creado todavia no tiene id: lo genera la base.
    if (customer.id !== null) {
      entity.id = customer.id
    }
    entity.email = normalizeEmail(customer.email)
    entity.fullName = customer.fullName
    entity.createdAt = customer.createdAt

    return entity
  }
}
