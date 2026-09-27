import { Injectable } from '@nestjs/common'
import { AppError } from '../../domain/errors/app-error'
import { UserRole } from '../../domain/enums/user-role.enum'
import { UserRepositoryPort } from '../../domain/ports/user.repository'
import { err, ok, type Result } from '../../domain/result'

export interface ProfileOutput {
  id: string
  email: string
  fullName: string
  role: UserRole
  isEmailVerified: boolean
  customerId: string | null
}

const userNotFoundError = (): AppError =>
  new AppError('La cuenta ya no existe', 'USER_NOT_FOUND', 404)

/**
 * El perfil no lleva el hash de la contraseña ni ningun otro campo interno: es lo
 * que ve la persona que ha iniciado sesion, no la fila de la tabla.
 */
@Injectable()
export class GetProfileUseCase {
  constructor(private readonly users: UserRepositoryPort) {}

  async execute(userId: string): Promise<Result<ProfileOutput, AppError>> {
    const user = await this.users.findById(userId)

    if (user === null) {
      return err(userNotFoundError())
    }

    return ok({
      id: user.id as string,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isEmailVerified: user.isEmailVerified(),
      customerId: user.customerId,
    })
  }
}
