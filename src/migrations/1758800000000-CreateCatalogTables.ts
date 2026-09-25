import { MigrationInterface, QueryRunner } from 'typeorm'

const ROAST_LEVELS = ['light', 'medium', 'dark']
const PROCESSES = ['washed', 'natural', 'honey', 'anaerobic']
const REGIONS = [
  'huila',
  'nariño',
  'valle-del-cauca',
  'caldas',
  'quindio',
  'tolima',
  'cauca',
  'cundinamarca',
  'santander',
  'arauca',
]

const list = (values: string[]): string => values.map((value) => `'${value}'`).join(', ')

export class CreateCatalogTables1758800000000 implements MigrationInterface {
  name = 'CreateCatalogTables1758800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Default de generación que usa TypeORM para @PrimaryGeneratedColumn('uuid'),
    // de modo que una futura migration:generate no produzca un diff espurio.
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    // La tabla del andamiaje inicial usaba id numérico y un precio por libra en
    // dólares. No hay datos que conservar, así que se reemplaza.
    await queryRunner.query('DROP TABLE IF EXISTS "coffees" CASCADE')

    await queryRunner.query(`
      CREATE TABLE "coffees" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(120) NOT NULL,
        "description" text NOT NULL,
        "roast_level" varchar(20) NOT NULL,
        "process" varchar(20) NOT NULL,
        "region" varchar(30) NOT NULL,
        "tasting_notes" text[] NOT NULL DEFAULT '{}',
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_coffees" PRIMARY KEY ("id"),
        CONSTRAINT "chk_coffees_name_not_blank" CHECK (btrim("name") <> ''),
        CONSTRAINT "chk_coffees_description_not_blank" CHECK (btrim("description") <> ''),
        CONSTRAINT "chk_coffees_roast_level" CHECK ("roast_level" IN (${list(ROAST_LEVELS)})),
        CONSTRAINT "chk_coffees_process" CHECK ("process" IN (${list(PROCESSES)})),
        CONSTRAINT "chk_coffees_region" CHECK ("region" IN (${list(REGIONS)}))
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "coffee_variants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "coffee_id" uuid NOT NULL,
        "weight_grams" integer NOT NULL,
        "price" numeric(12,2) NOT NULL,
        "stock" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_coffee_variants" PRIMARY KEY ("id"),
        CONSTRAINT "fk_variants_coffee" FOREIGN KEY ("coffee_id")
          REFERENCES "coffees"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_variants_weight_positive" CHECK ("weight_grams" > 0),
        CONSTRAINT "chk_variants_price_non_negative" CHECK ("price" >= 0),
        CONSTRAINT "chk_variants_stock_non_negative" CHECK ("stock" >= 0),
        CONSTRAINT "uq_variants_coffee_weight" UNIQUE ("coffee_id", "weight_grams")
      )
    `)

    await queryRunner.query('CREATE INDEX "idx_coffees_region" ON "coffees" ("region")')
    await queryRunner.query('CREATE INDEX "idx_coffees_roast_level" ON "coffees" ("roast_level")')
    await queryRunner.query('CREATE INDEX "idx_coffees_process" ON "coffees" ("process")')
    await queryRunner.query('CREATE INDEX "idx_coffees_is_active" ON "coffees" ("is_active")')
    await queryRunner.query(
      'CREATE INDEX "idx_variants_coffee_id" ON "coffee_variants" ("coffee_id")',
    )
    await queryRunner.query('CREATE INDEX "idx_variants_stock" ON "coffee_variants" ("stock")')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "coffee_variants"')
    await queryRunner.query('DROP TABLE IF EXISTS "coffees"')
  }
}
