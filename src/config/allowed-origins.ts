const DEVELOPMENT_ORIGIN = 'http://localhost:5173'
const WILDCARD = '*'

const isLocalhostOrigin = (origin: string): boolean => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)

const assertValidOrigin = (origin: string): void => {
  if (origin === WILDCARD) {
    throw new Error(
      'CORS_ALLOWED_ORIGINS no admite el comodín "*": se usa credentials:true y el comodín es inseguro. Lista los orígenes explícitos.',
    )
  }

  const hasHttpScheme = origin.startsWith('http://') || origin.startsWith('https://')
  if (!hasHttpScheme) {
    throw new Error(`Origen inválido "${origin}": debe empezar por http:// o https://.`)
  }

  if (origin.startsWith('http://') && !isLocalhostOrigin(origin)) {
    throw new Error(`Origen inválido "${origin}": http:// solo se permite para localhost.`)
  }
}

export const readAllowedOrigins = (rawValue: string | undefined): string[] => {
  if (rawValue === undefined || rawValue.trim() === '') {
    return [DEVELOPMENT_ORIGIN]
  }

  const origins = rawValue
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '')

  if (origins.length === 0) {
    return [DEVELOPMENT_ORIGIN]
  }

  origins.forEach(assertValidOrigin)

  return origins
}
