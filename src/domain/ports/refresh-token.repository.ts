export interface RefreshTokenRecord {
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  revokedAt: Date | null
}

export abstract class RefreshTokenRepositoryPort {
  abstract findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>
  abstract save(record: Omit<RefreshTokenRecord, 'id'>): Promise<RefreshTokenRecord>
  abstract revoke(id: string, at: Date): Promise<void>
  abstract revokeAllForUser(userId: string, at: Date): Promise<void>
}
