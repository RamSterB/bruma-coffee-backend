import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateAccountTables1759000000000 implements MigrationInterface {
  name = 'CreateAccountTables1759000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // El correo se compara sin distinguir mayusculas, y con citext el UNIQUE de
    // la base hace el trabajo sin depender de que el codigo normalice antes.
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "citext"')
    // Se instala aqui y no en la migracion del catalogo porque esta es la
    // primera que corre, y un CREATE EXTENSION se puede pedir mas de una vez sin
    // problema. La usa la comparacion de ciudades y departamentos, que tiene que
    // ignorar tildes: si "Bogota" no encuentra "Bogota", el formulario rechaza lo
    // que la persona acaba de escribir.
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "unaccent"')

    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" citext NOT NULL,
        "full_name" varchar(160) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_customers_email" UNIQUE ("email")
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" citext NOT NULL,
        "password_hash" varchar(60) NOT NULL,
        "full_name" varchar(160) NOT NULL,
        "role" varchar(20) NOT NULL DEFAULT 'CUSTOMER',
        "customer_id" uuid,
        "email_verified_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "UQ_users_customer_id" UNIQUE ("customer_id"),
        CONSTRAINT "CK_users_role" CHECK ("role" IN ('CUSTOMER', 'ADMIN')),
        CONSTRAINT "FK_users_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers"("id") ON DELETE SET NULL
      )
    `)

    // Sin esta tabla el logout no se puede revocar, y con ella el refresh se
    // invalida al instante y la rotacion deja de servir para nada.
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "token_hash" varchar(64) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_refresh_tokens_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `)

    await queryRunner.query(
      'CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" ("user_id")',
    )
    await queryRunner.query(
      'CREATE INDEX "idx_refresh_tokens_expires_at" ON "refresh_tokens" ("expires_at")',
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "refresh_tokens"')
    await queryRunner.query('DROP TABLE IF EXISTS "users"')
    await queryRunner.query('DROP TABLE IF EXISTS "customers"')
  }
}
