/**
 * Si la base de datos responde.
 *
 * Existe como port, y no como una consulta en el controlador, por la misma razón que
 * todos los demás: **el dominio no puede saber que hay un ORM.** Un chequeo de salud
 * que importa `DataSource` de TypeORM en la capa HTTP ataría el contrato a la
 * herramienta, y el día que la base cambie el endpoint de salud, que es el que no puede
 * fallar, sería uno de los que hay que reescribir.
 *
 * La respuesta es un booleano y no el error. Quien llama solo necesita saber si puede
 * seguir, y el detalle del error no le sirve de nada: se registra al otro lado, donde sí
 * hay contexto para interpretarlo.
 */
export abstract class DatabaseHealthPort {
  abstract isAlive(): Promise<boolean>
}
