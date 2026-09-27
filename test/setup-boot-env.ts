/**
 * Corre antes de que Jest cargue cualquier fichero de test, y el orden importa.
 *
 * AppModule lee la configuración **al importarse**, no al montarse. Este fichero
 * importa el módulo de pruebas, que resuelve la conexión antes de que nadie haya
 * tocado `process.env`, y aplica esos valores. Si no, el `.env` de desarrollo
 * entra después y deja `DB_HOST` apuntando al contenedor, que desde el host no
 * resuelve, y el arranque muere con un ENOTFOUND que no tiene nada que ver con lo
 * que se está probando.
 *
 * El test que usa esto importa `AppModule` de forma estática. Para entonces este
 * fichero ya ha puesto el entorno, que es justo lo que necesita.
 *
 * No oculta la validación del arranque: `env.boot.integration.spec.ts` borra el
 * secreto a propósito para comprobar que sin él la aplicación no levanta.
 */
import { TEST_CONNECTION_ENV } from '../src/testing/test-database'

Object.assign(process.env, TEST_CONNECTION_ENV)
process.env.JWT_SECRET = 'secreto-de-pruebas-e2e-suficientemente-largo'
