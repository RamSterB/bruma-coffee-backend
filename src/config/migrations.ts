import { join } from 'node:path'

/**
 * El mismo glob sirve para desarrollo (archivos .ts junto al código) y para
 * producción (archivos .js dentro de dist), sin cargar la migración dos veces.
 */
export const MIGRATIONS_GLOB = join(__dirname, '..', 'migrations', '*.{js,ts}')
