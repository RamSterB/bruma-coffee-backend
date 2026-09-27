import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import type { UserTypeOrmEntity } from './user.typeorm.entity'
import { UserTypeOrmEntity as UserEntity } from './user.typeorm.entity'

@Entity('refresh_tokens')
@Index('idx_refresh_tokens_user_id', ['userId'])
@Index('idx_refresh_tokens_expires_at', ['expiresAt'])
export class RefreshTokenTypeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserTypeOrmEntity

  // Solo el hash. Guardar el token permitiria que una copia de la tabla sirviera
  // para robar sesiones.
  @Column({ name: 'token_hash', type: 'varchar', length: 64, unique: true })
  tokenHash!: string

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  isUsable(at: Date): boolean {
    return this.revokedAt === null && this.expiresAt.getTime() > at.getTime()
  }
}
