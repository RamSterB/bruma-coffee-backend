import { Customer } from '../../domain/entities/customer.entity'
import type { CustomerRepositoryPort } from '../../domain/ports/customer.repository'
import { normalizeEmail } from '../../domain/validation/normalize-email'

export class FakeCustomerRepository implements CustomerRepositoryPort {
  readonly todos: Customer[] = []

  async findByEmail(email: string): Promise<Customer | null> {
    const buscado = normalizeEmail(email)

    return this.todos.find((customer) => customer.email === buscado) ?? null
  }

  async findById(id: string): Promise<Customer | null> {
    return this.todos.find((customer) => customer.id === id) ?? null
  }

  async save(customer: Customer): Promise<Customer> {
    if (customer.id === null) {
      const guardado = Customer.reconstitute({
        id: `customer-${this.todos.length + 1}`,
        email: customer.email,
        fullName: customer.fullName,
        createdAt: customer.createdAt,
      })
      this.todos.push(guardado)

      return guardado
    }

    const indice = this.todos.findIndex((actual) => actual.id === customer.id)

    if (indice < 0) {
      this.todos.push(customer)

      return customer
    }

    this.todos[indice] = customer

    return customer
  }
}
