import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateCartTables1759100000000 implements MigrationInterface {
  name = 'CreateCartTables1759100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "carts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_carts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_carts_user_id" UNIQUE ("user_id"),
        CONSTRAINT "FK_carts_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "cart_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "cart_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "quantity" integer NOT NULL,
        CONSTRAINT "PK_cart_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cart_items_cart_variant" UNIQUE ("cart_id", "variant_id"),
        CONSTRAINT "CK_cart_items_quantity" CHECK ("quantity" > 0),
        CONSTRAINT "FK_cart_items_cart" FOREIGN KEY ("cart_id")
          REFERENCES "carts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cart_items_variant" FOREIGN KEY ("variant_id")
          REFERENCES "coffee_variants"("id") ON DELETE RESTRICT
      )
    `)

    await queryRunner.query('CREATE INDEX "idx_cart_items_cart_id" ON "cart_items" ("cart_id")')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "cart_items"')
    await queryRunner.query('DROP TABLE IF EXISTS "carts"')
  }
}
