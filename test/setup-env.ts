/**
 * AppModule valida el entorno al importarse, no al montarse. Un import estatico
 * en el test se evalua antes de que corra ningun beforeAll, asi que el secreto
 * tiene que existir antes de que Jest cargue el fichero de test: de ahi este
 * setup. No oculta la validacion; env.boot.integration.spec.ts borra la variable
 * a proposito para comprobar que el arranque aborta sin ella.
 */
process.env.JWT_SECRET = 'secreto-de-pruebas-e2e-suficientemente-largo'
