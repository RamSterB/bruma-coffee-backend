import type { Customer } from '../entities/customer.entity'

export abstract class CustomerRepositoryPort {
  abstract findByEmail(email: string): Promise<Customer | null>
  abstract findById(id: string): Promise<Customer | null>
  abstract save(customer: Customer): Promise<Customer>
}
