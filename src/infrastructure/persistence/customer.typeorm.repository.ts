import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CustomerRepositoryPort } from '../../domain/ports/customer.repository'
import { Customer } from '../../domain/entities/customer.entity'
import { normalizeEmail } from '../../domain/validation/normalize-email'
import { CustomerTypeOrmEntity } from './customer.typeorm.entity'

@Injectable()
export class CustomerTypeOrmRepository implements CustomerRepositoryPort {
  constructor(
    @InjectRepository(CustomerTypeOrmEntity)
    private readonly repository: Repository<CustomerTypeOrmEntity>,
  ) {}

  async findByEmail(email: string): Promise<Customer | null> {
    const entity = await this.repository.findOne({ where: { email: normalizeEmail(email) } })

    return entity === null ? null : entity.toDomain()
  }

  async findById(id: string): Promise<Customer | null> {
    const entity = await this.repository.findOne({ where: { id } })

    return entity === null ? null : entity.toDomain()
  }

  async save(customer: Customer): Promise<Customer> {
    const guardado = await this.repository.save(CustomerTypeOrmEntity.fromDomain(customer))

    return guardado.toDomain()
  }
}
