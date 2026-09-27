import { User } from '../../domain/entities/user.entity'
import type { UserRepositoryPort } from '../../domain/ports/user.repository'
import { normalizeEmail } from '../../domain/validation/normalize-email'

export class FakeUserRepository implements UserRepositoryPort {
  readonly todos: User[] = []

  async findByEmail(email: string): Promise<User | null> {
    const buscado = normalizeEmail(email)

    return this.todos.find((user) => user.email === buscado) ?? null
  }

  async findById(id: string): Promise<User | null> {
    return this.todos.find((user) => user.id === id) ?? null
  }

  async save(user: User): Promise<User> {
    if (user.id === null) {
      const guardado = User.reconstitute({
        id: `user-${this.todos.length + 1}`,
        email: user.email,
        passwordHash: user.passwordHash,
        fullName: user.fullName,
        role: user.role,
        customerId: user.customerId,
        emailVerifiedAt: user.emailVerifiedAt,
        createdAt: user.createdAt,
      })
      this.todos.push(guardado)

      return guardado
    }

    const indice = this.todos.findIndex((actual) => actual.id === user.id)

    if (indice < 0) {
      this.todos.push(user)

      return user
    }

    this.todos[indice] = user

    return user
  }
}
