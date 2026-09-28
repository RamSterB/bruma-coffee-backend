import { ConfigService } from '@nestjs/config'
import { TypeOrmModuleAsyncOptions, TypeOrmModuleOptions } from '@nestjs/typeorm'
import { MIGRATIONS_GLOB } from './migrations'

export const databaseConfig: TypeOrmModuleAsyncOptions = {
  inject: [ConfigService],
  useFactory: (config: ConfigService): TypeOrmModuleOptions => ({
    type: 'postgres',
    host: config.get('DB_HOST', 'localhost'),
    port: config.get<number>('DB_PORT', 5432),
    username: config.get('DB_USER', 'postgres'),
    password: config.get('DB_PASSWORD', 'postgres'),
    database: config.get('DB_NAME', 'bruma_coffee'),
    autoLoadEntities: true,
    /**
     * Cifrado de la conexion, con una bandera y no siempre.
     *
     * En un postgres local da igual y se deja apagado, que es lo que espera el
     * desarrollo. En una base gestionada **no es opcional**: el servidor rechaza la
     * conexion sin TLS, y aunque no la rechazara, las credenciales y los datos de las
     * ordenes no deberian viajar en claro por una red que no es la de la maquina.
     *
     * `rejectUnauthorized: false` porque la base usa un certificado propio y no uno
     * emitido para una autoridad publica: verificarlo contra esa autoridad haria fallar
     * la conexion siempre. Lo que se comprueba es que el canal este cifrado, y eso lo
     * da TLS. Verificar el certificado en serio haria falta traer el de la base al
     * contenedor, que es mas complicacion de la que este despliegue necesita.
     */
    ssl: config.get('DB_SSL', 'false') === 'true' ? { rejectUnauthorized: false } : undefined,
    // El esquema solo cambia por migraciones versionadas: synchronize puede
    // borrar datos sin avisar, así que nunca se activa.
    synchronize: false,
    migrations: [MIGRATIONS_GLOB],
    migrationsTableName: 'schema_migrations',
    migrationsRun: config.get('DB_MIGRATIONS_RUN', 'true') === 'true',
  }),
}
