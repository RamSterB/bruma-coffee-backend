import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Tablas de la orden: `orders` con sus líneas, `payments` con los intentos de cobro
 * y `deliveries` con los envíos.
 *
 * Tres decisiones que no son obvias y que están comentadas donde pasan, porque
 * quitarlas parece una mejora y en realidad rompe cosas.
 */
export class CreateOrderTables1759300000000 implements MigrationInterface {
  name = 'CreateOrderTables1759300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // La secuencia la genera la base de datos y no la aplicación: dos compras que
    // entren en el mismo segundo tienen que obtener números distintos, y eso solo
    // se garantiza con algo que no se pueda intercalar.
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "order_number_seq" START 1`)

    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_number" varchar(20) NOT NULL,
        "customer_id" uuid NOT NULL,
        "user_id" uuid,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "payment_status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "customer_name" varchar(120) NOT NULL,
        "customer_document" varchar(20) NOT NULL,
        "customer_phone" varchar(20) NOT NULL,
        "shipping_address" varchar(200) NOT NULL,
        "shipping_city" varchar(80) NOT NULL,
        "shipping_department" varchar(30) NOT NULL,
        "subtotal" numeric(12,2) NOT NULL,
        "tax_amount" numeric(12,2) NOT NULL,
        "shipping_amount" numeric(12,2) NOT NULL,
        "total" numeric(12,2) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_orders_order_number" UNIQUE ("order_number"),
        CONSTRAINT "FK_orders_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id"),
        -- user_id es quien iniciada sesion, y vanullable porque la compra de invitado
        -- tambien tiene orden. Es distinto de customer_id a proposito: el cliente es
        -- la persona a la que se entrega, y el usuario es la cuenta desde la que se
        -- compro. Sin user_id no se puede comprobar que una orden es de quien la pide.
        -- ON DELETE SET NULL y no CASCADE: borrar una cuenta no puede borrar la
        -- historia de lo que esa persona compro.
        CONSTRAINT "FK_orders_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_orders_status" CHECK ("status" IN ('PENDING', 'PAID', 'FAILED', 'CANCELLED')),
        CONSTRAINT "chk_orders_payment_status" CHECK (
          "payment_status" IN ('PENDING', 'APPROVED', 'DECLINED', 'ERROR', 'CANCELLED')
        ),
        CONSTRAINT "chk_orders_total_suma" CHECK ("total" = "subtotal" + "tax_amount" + "shipping_amount")
      )
    `)

    // El CHECK del total es lo que hace que un total que no cuadra no llegue ni a
    // escribirse. Es la última línea de defensa: por encima están el dominio y el
    // caso de uso, y las tres fallan juntas si alguien cambia una de las cuentas.
    await queryRunner.query('CREATE INDEX "idx_orders_customer_id" ON "orders" ("customer_id")')
    await queryRunner.query('CREATE INDEX "idx_orders_user_id" ON "orders" ("user_id")')
    await queryRunner.query('CREATE INDEX "idx_orders_status" ON "orders" ("status")')

    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "variant_id" uuid,
        "coffee_name" varchar(120) NOT NULL,
        "weight_grams" integer,
        "unit_price" numeric(12,2) NOT NULL,
        "quantity" integer NOT NULL,
        "line_total" numeric(12,2) NOT NULL,
        CONSTRAINT "PK_order_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_items_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        -- La variante puede desaparecer del catálogo y la línea sigue ahí: es un
        -- histórico de lo cobrado, no una referencia a algo vivo.
        CONSTRAINT "FK_order_items_variant" FOREIGN KEY ("variant_id") REFERENCES "coffee_variants"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_order_items_quantity" CHECK ("quantity" > 0),
        CONSTRAINT "chk_order_items_line_total" CHECK ("line_total" = "unit_price" * "quantity")
      )
    `)
    await queryRunner.query('CREATE INDEX "idx_order_items_order_id" ON "order_items" ("order_id")')

    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "provider" varchar(20) NOT NULL,
        "provider_reference" varchar(120) NOT NULL,
        "token" varchar(120) NOT NULL,
        "status" varchar(20) NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "raw_event" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payments_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_payments_status" CHECK (
          "status" IN ('PENDING', 'APPROVED', 'DECLINED', 'ERROR', 'CANCELLED')
        )
      )
    `)

    // El UNIQUE sobre (provider, provider_reference) es la idempotencia. No está en
    // el código porque el código no puede saber que dos peticiones deel mismo evento
    // llegaron a la vez: eso solo lo sabe la base de datos.
    await queryRunner.query(
      'CREATE UNIQUE INDEX "uq_payments_provider_reference" ON "payments" ("provider", "provider_reference")',
    )
    await queryRunner.query('CREATE INDEX "idx_payments_order_id" ON "payments" ("order_id")')

    await queryRunner.query(`
      CREATE TABLE "deliveries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "carrier" varchar(60),
        "tracking_code" varchar(60),
        "shipped_at" timestamptz,
        "delivered_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_deliveries_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        -- Un envío por orden: dos paquetes del mismo pedido es una decisión de
        -- negocio que no existe, y permitirlo cambiaría el descuento de stock.
        CONSTRAINT "UQ_deliveries_order_id" UNIQUE ("order_id"),
        CONSTRAINT "chk_deliveries_status" CHECK (
          "status" IN ('PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED')
        ),
        -- El código de seguimiento es obligatorio cuando el paquete va en camino. Es
        -- un CHECK y no una regla del caso de uso porque es un dato de la fila.
        CONSTRAINT "chk_deliveries_tracking" CHECK (
          "status" <> 'IN_TRANSIT' OR "tracking_code" IS NOT NULL
        )
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "deliveries"')
    await queryRunner.query('DROP TABLE IF EXISTS "payments"')
    await queryRunner.query('DROP TABLE IF EXISTS "order_items"')
    await queryRunner.query('DROP TABLE IF EXISTS "orders"')
    await queryRunner.query('DROP SEQUENCE IF EXISTS "order_number_seq"')
  }
}
