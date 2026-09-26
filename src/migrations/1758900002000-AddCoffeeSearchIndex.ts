import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Índice de búsqueda del catálogo.
 *
 * La búsqueda tiene que encontrar "Nariño" al escribir "narino". Comparar el
 * texto guardado contra el texto buscado exigiría normalizar los acentos en
 * cada fila, y `unaccent()` de PostgreSQL no es fiable para eso (su resultado
 * cambia según el historial de la sesión). En su lugar se guarda una copia
 * normalizada del texto buscable y se compara contra ella.
 *
 * `src/domain/search/search-text.ts` es la única fuente de verdad de esa
 * normalización; esta migración solo la aplica por SQL a las filas que ya
 * existen. El test `el índice de búsqueda coincide con la normalización de la
 * aplicación` verifica que ambas formas coinciden.
 */

const SPANISH_ACCENTED = 'áéíóúüñÁÉÍÓÚÜÑ'
const SPANISH_PLAIN = 'aeiouunAEIOUUN'

const normalize = (column: string): string =>
  `trim(regexp_replace(lower(translate(${column}, '${SPANISH_ACCENTED}', '${SPANISH_PLAIN}')), '\\s+', ' ', 'g'))`

export class AddCoffeeSearchIndex1758900002000 implements MigrationInterface {
  name = 'AddCoffeeSearchIndex1758900002000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "coffees" ADD COLUMN "search_index" text')

    await queryRunner.query(
      `UPDATE "coffees" SET "search_index" = ${[
        normalize('"name"'),
        normalize('"description"'),
        normalize(`array_to_string("tasting_notes", ' ')`),
      ].join(" || ' ' || ")}`,
    )

    // El índice acelera el prefijo; para buscar en medio de la palabra hará
    // falta un trigram, pero la expresión ya es inmutable y no depende de la
    // sesión, que es lo que importa.
    await queryRunner.query('CREATE INDEX "idx_coffees_search_index" ON "coffees" ("search_index")')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "idx_coffees_search_index"')
    await queryRunner.query('ALTER TABLE "coffees" DROP COLUMN "search_index"')
  }
}
