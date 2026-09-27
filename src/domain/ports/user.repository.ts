import type { User } from '../entities/user.entity'

/** abstract class y no interface porque Nest necesita el token en tiempo de ejecucion. */
export abstract class UserRepositoryPort {
  abstract findByEmail(email: string): Promise<User | null>
  abstract findById(id: string): Promise<User | null>
  abstract save(user: User): Promise<User>
}
