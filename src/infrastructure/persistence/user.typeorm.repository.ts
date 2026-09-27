import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { UserRepositoryPort } from '../../domain/ports/user.repository'
import { User } from '../../domain/entities/user.entity'
import { normalizeEmail } from '../../domain/validation/normalize-email'
import { UserTypeOrmEntity } from './user.typeorm.entity'

@Injectable()
export class UserTypeOrmRepository implements UserRepositoryPort {
  constructor(
    @InjectRepository(UserTypeOrmEntity)
    private readonly repository: Repository<UserTypeOrmEntity>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    // Sin normalizar, "Persona@Ejemplo.com" no encontraria la fila guardada como
    // "persona@ejemplo.com", aunque la base no distinga mayusculas.
    const entity = await this.repository.findOne({ where: { email: normalizeEmail(email) } })

    return entity === null ? null : entity.toDomain()
  }

  async findById(id: string): Promise<User | null> {
    const entity = await this.repository.findOne({ where: { id } })

    return entity === null ? null : entity.toDomain()
  }

  async save(user: User): Promise<User> {
    const guardado = await this.repository.save(UserTypeOrmEntity.fromDomain(user))

    return guardado.toDomain()
  }
}
