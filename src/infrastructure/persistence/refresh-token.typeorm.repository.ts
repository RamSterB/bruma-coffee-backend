import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { RefreshTokenRepositoryPort } from '../../domain/ports/refresh-token.repository'
import type { RefreshTokenRecord } from '../../domain/ports/refresh-token.repository'
import { RefreshTokenTypeOrmEntity } from './refresh-token.typeorm.entity'
import { UserTypeOrmEntity } from './user.typeorm.entity'

@Injectable()
export class RefreshTokenTypeOrmRepository implements RefreshTokenRepositoryPort {
  constructor(
    @InjectRepository(UserTypeOrmEntity)
    private readonly users: Repository<UserTypeOrmEntity>,
  ) {}

  private get tokens(): Repository<RefreshTokenTypeOrmEntity> {
    return this.users.manager.getRepository(RefreshTokenTypeOrmEntity)
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const entity = await this.tokens.findOne({ where: { tokenHash } })

    return entity === null ? null : RefreshTokenTypeOrmRepository.toRecord(entity)
  }

  async save(record: Omit<RefreshTokenRecord, 'id'>): Promise<RefreshTokenRecord> {
    const entity = this.tokens.create({
      userId: record.userId,
      tokenHash: record.tokenHash,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt,
    })
    const guardado = await this.tokens.save(entity)

    return RefreshTokenTypeOrmRepository.toRecord(guardado)
  }

  async revoke(id: string, at: Date): Promise<void> {
    await this.tokens.update({ id }, { revokedAt: at })
  }

  async revokeAllForUser(userId: string, at: Date): Promise<void> {
    // Solo los que siguen vigentes: reescribir los ya revocados con una fecha nueva
    // perderia la traza de cuando se cerro cada sesion.
    await this.tokens.update({ userId, revokedAt: IsNull() }, { revokedAt: at })
  }

  private static toRecord(entity: RefreshTokenTypeOrmEntity): RefreshTokenRecord {
    return {
      id: entity.id,
      userId: entity.userId,
      tokenHash: entity.tokenHash,
      expiresAt: entity.expiresAt,
      revokedAt: entity.revokedAt,
    }
  }
}
