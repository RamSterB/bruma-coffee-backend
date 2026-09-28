import { Injectable, Logger } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { DatabaseHealthPort } from '../../domain/ports/database-health.port'

/**
 * El chequeo contra PostgreSQL, con una consulta que no puede fallar por otra razón.
 *
 * `SELECT 1` es lo que se usa para esto: no toca ninguna tabla, así que el resultado no
 * depende de los datos que haya ni de si las migraciones corrieron. Un
 * `SELECT count(*) FROM orders` contaría como comprobación de salud y empezaría a
 * devolver 503 el día que la tabla crezca.
 */
@Injectable()
export class TypeOrmDatabaseHealthAdapter extends DatabaseHealthPort {
  private readonly logger = new Logger(TypeOrmDatabaseHealthAdapter.name)

  constructor(private readonly dataSource: DataSource) {
    super()
  }

  async isAlive(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1')

      return true
    } catch (error) {
      // El mensaje del driver es lo único que separa "se cayó la base" de "se cayó la
      // red" o "cerraron el pool", y aquí no hay más sitio donde mirar.
      this.logger.error(
        `La base de datos no responde: ${error instanceof Error ? error.message : 'error desconocido'}`,
      )

      return false
    }
  }
}
