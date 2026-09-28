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

// La pasarela tambien valida el entorno al importarse el modulo, asi que sus
// llaves tienen que existir aqui igual que el secreto de sesion. Son llaves de
// mentira con el prefijo de sandbox: la validacion solo mira el prefijo, y
// ningun test de esta suite sale a la red.
process.env.CARD_GATEWAY_PUBLIC_KEY = 'pub_test_llave-de-pruebas'
process.env.CARD_GATEWAY_PRIVATE_KEY = 'prv_test_llave-de-pruebas'
process.env.CARD_GATEWAY_EVENTS_SECRET = 'test_events_secreto-de-pruebas'
process.env.CARD_GATEWAY_INTEGRITY_SECRET = 'test_integrity_secreto-de-pruebas'

