import { compare, hash } from 'bcrypt'
import { PasswordHasherPort } from '../../domain/ports/password-hasher'

export class BcryptPasswordHasher implements PasswordHasherPort {
  constructor(private readonly rounds: number) {}

  async hash(plain: string): Promise<string> {
    return hash(plain, this.rounds)
  }

  async compare(plain: string, stored: string): Promise<boolean> {
    // Un hash corrupto o de otro formato no es un error de servidor: es una
    // credencial que no valida, y la respuesta correcta es "no coincide".
    try {
      return await compare(plain, stored)
    } catch {
      return false
    }
  }
}
