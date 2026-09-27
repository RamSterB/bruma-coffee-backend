export interface AccessToken {
  token: string
  expiresInSeconds: number
}

export interface RefreshToken {
  token: string
  hash: string
  expiresInSeconds: number
}

export interface AccessTokenClaims {
  subject: string
  role: string
}

export abstract class SessionTokenPort {
  abstract issueAccessToken(subject: string, role: string): Promise<AccessToken>
  abstract issueRefreshToken(): Promise<RefreshToken>

  /**
   * El hash con el que se busca un refresh en la base. Vive en el port y no en el
   * caso de uso para que el dominio no sepa nada de SHA-256 ni de crypto.
   */
  abstract hashRefreshToken(token: string): string

  abstract verifyAccessToken(token: string): Promise<AccessTokenClaims | null>
}
