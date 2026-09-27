// El correo se compara y se busca siempre en minúsculas: dos personas que escriben
// "Ana@Ejemplo.com" y "ana@ejemplo.com" son la misma, y el UNIQUE de la base solo
// las juntaría si el valor llega normalizado.
export const normalizeEmail = (email: string): string => email.trim().toLowerCase()
