import type {
  RefreshTokenRecord,
  RefreshTokenRepositoryPort,
} from '../../domain/ports/refresh-token.repository'

export class FakeRefreshTokenRepository implements RefreshTokenRepositoryPort {
  readonly todos: RefreshTokenRecord[] = []

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.todos.find((token) => token.tokenHash === tokenHash) ?? null
  }

  async save(record: Omit<RefreshTokenRecord, 'id'>): Promise<RefreshTokenRecord> {
    const guardado: RefreshTokenRecord = { id: `refresh-${this.todos.length + 1}`, ...record }
    this.todos.push(guardado)

    return guardado
  }

  async revoke(id: string, at: Date): Promise<void> {
    const indice = this.todos.findIndex((token) => token.id === id)

    if (indice >= 0) {
      this.todos[indice] = { ...this.todos[indice], revokedAt: at }
    }
  }

  async revokeAllForUser(userId: string, at: Date): Promise<void> {
    for (const [indice, token] of this.todos.entries()) {
      if (token.userId === userId && token.revokedAt === null) {
        this.todos[indice] = { ...token, revokedAt: at }
      }
    }
  }
}
