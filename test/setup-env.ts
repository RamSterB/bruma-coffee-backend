/**
 * Esto corre antes de que Jest cargue cualquier fichero de test, y el orden
 * importa por dos razones:
 *
 * 1. AppModule valida el entorno al importarse, no al montarse. Un import estatico
 *    en el test se evalua antes de que corra ningun beforeAll, asi que el secreto
 *    tiene que existir antes de que Jest cargue el fichero de test.
 * 2. El modulo de la base de pruebas fija host, puerto y base en el momento de
 *    cargarse. Si AppModule se carga antes, su ConfigModule lee el .env de
 *    desarrollo y deja DB_HOST apuntando al contenedor, que desde el host no
 *    resuelve, y la suite muere con un ENOTFOUND que no tiene nada que ver con lo
 *    que se esta probando. Por eso se importa aqui y no en el test.
 *
 * No oculta la validacion del arranque: env.boot.integration.spec.ts borra la
 * variable a proposito para comprobar que sin ella la aplicacion no levanta.
 */
import '../src/testing/test-database'

process.env.JWT_SECRET = 'secreto-de-pruebas-e2e-suficientemente-largo'
