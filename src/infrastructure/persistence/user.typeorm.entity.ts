import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { User } from '../../domain/entities/user.entity'
import { UserRole } from '../../domain/enums/user-role.enum'
import { normalizeEmail } from '../../domain/validation/normalize-email'
import type { CustomerTypeOrmEntity } from './customer.typeorm.entity'
import { CustomerTypeOrmEntity as CustomerEntity } from './customer.typeorm.entity'

@Entity('users')
export class UserTypeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 320, unique: true })
  email!: string

  @Column({ name: 'password_hash', type: 'varchar', length: 60 })
  passwordHash!: string

  @Column({ name: 'full_name', type: 'varchar', length: 160 })
  fullName!: string

  @Column({ type: 'varchar', length: 20, default: UserRole.CUSTOMER })
  role!: UserRole

  // Un customer es como mucho de un user, al reves: el user puede no tener customer
  // todavia, porque la vinculacion se cierra al verificar el correo.
  @Column({ name: 'customer_id', type: 'uuid', unique: true, nullable: true })
  customerId!: string | null

  @OneToOne(() => CustomerEntity, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer?: CustomerTypeOrmEntity

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  toDomain(): User {
    return User.reconstitute({
      id: this.id,
      email: normalizeEmail(this.email),
      passwordHash: this.passwordHash,
      fullName: this.fullName,
      role: this.role,
      customerId: this.customerId,
      emailVerifiedAt: this.emailVerifiedAt,
      createdAt: this.createdAt,
    })
  }

  static fromDomain(user: User): UserTypeOrmEntity {
    const entity = new UserTypeOrmEntity()

    // Un user recien creado todavia no tiene id: lo genera la base.
    if (user.id !== null) {
      entity.id = user.id
    }
    entity.email = normalizeEmail(user.email)
    entity.passwordHash = user.passwordHash
    entity.fullName = user.fullName
    entity.role = user.role
    entity.customerId = user.customerId
    entity.emailVerifiedAt = user.emailVerifiedAt
    entity.createdAt = user.createdAt

    return entity
  }
}
