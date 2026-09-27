import { join } from 'node:path'

/**
 * El mismo glob sirve para desarrollo (archivos .ts junto al código) y para
 * producción (archivos .js dentro de dist), sin cargar la migración dos veces.
 *
 * __dirname solo existe en CommonJS, que es lo que emite la compilación, pero
 * bajo ESM —los tests de Jest— no está. Por eso hay un segundo origen: sin él,
 * importar este fichero revienta y con él se cae toda la aplicación.
 */
const directorioDelModulo = (): string =>
  typeof __dirname === 'string' ? __dirname : join(process.cwd(), 'src', 'config')

export const MIGRATIONS_GLOB = join(directorioDelModulo(), '..', 'migrations', '*.{js,ts}')
