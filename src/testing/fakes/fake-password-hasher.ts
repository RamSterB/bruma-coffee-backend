import type { PasswordHasherPort } from '../../domain/ports/password-hasher'

export class FakePasswordHasher implements PasswordHasherPort {
  readonly hasheadas: string[] = []
  readonly comparaciones: string[] = []

  async hash(plain: string): Promise<string> {
    this.hasheadas.push(plain)

    return `hash:${plain}`
  }

  async compare(plain: string, hash: string): Promise<boolean> {
    this.comparaciones.push(plain)

    return hash === `hash:${plain}`
  }
}
