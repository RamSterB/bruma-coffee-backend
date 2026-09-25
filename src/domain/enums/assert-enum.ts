export const assertEnum = <T extends Record<string, string>>(
  enumeration: T,
  value: string,
): T[keyof T] => {
  const allowed = Object.values(enumeration) as string[]

  if (!allowed.includes(value)) {
    throw new DomainError(`"${value}" no es válido. permitidos: ${allowed.join(', ')}`)
  }

  return value as T[keyof T]
}

export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainError'
  }
}
