import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Los 32 departamentos de Colombia con sus ciudades principales, y Bogota D. C.
 * que no es departamento pero se entrega igual.
 *
 * La lista vive en la base, y no escrita en el codigo, porque para comprobar que
 * una ciudad es de un departamento hace falta poder consultarlo. Con una lista en
 * un archivo, la validacion seria un `includes` en memoria y anadir una ciudad
 * seria editar codigo y desplegar.
 */
export class CreateDepartmentsAndCities1759200000000 implements MigrationInterface {
  name = 'CreateDepartmentsAndCities1759200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "departments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(40) NOT NULL,
        CONSTRAINT "PK_departments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_departments_name" UNIQUE ("name")
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "cities" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(80) NOT NULL,
        "department_id" uuid NOT NULL,
        CONSTRAINT "PK_cities" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cities_department" FOREIGN KEY ("department_id")
          REFERENCES "departments"("id") ON DELETE CASCADE
      )
    `)

    // El UNIQUE va sobre el par y no sobre el nombre: hay nombres de ciudad
    // repetidos en el pais, y prohibirlos daria una lista que no cuadra.
    await queryRunner.query(
      'CREATE UNIQUE INDEX "uq_cities_department_name" ON "cities" ("department_id", "name")',
    )

    await queryRunner.query(`
      INSERT INTO "departments" ("name") VALUES
      ('Amazonas'), ('Antioquia'), ('Arauca'), ('Atlántico'), ('Bogotá D. C.'), ('Bolívar'), ('Boyacá'), ('Caldas'), ('Caquetá'), ('Casanare'), ('Cauca'), ('Cesar'), ('Chocó'), ('Córdoba'), ('Cundinamarca'), ('Guainía'), ('Guaviare'), ('Huila'), ('La Guajira'), ('Magdalena'), ('Meta'), ('Nariño'), ('Norte de Santander'), ('Putumayo'), ('Quindío'), ('Risaralda'), ('Santander'), ('Sucre'), ('Tolima'), ('Valle del Cauca'), ('Vaupés'), ('Vichada')
    `)

    await queryRunner.query(`
      INSERT INTO "cities" ("name", "department_id")
      SELECT datos.ciudad, d.id
      FROM (VALUES ('Leticia', 'Amazonas'), ('Medellín', 'Antioquia'), ('Bello', 'Antioquia'), ('Itagüí', 'Antioquia'), ('Envigado', 'Antioquia'), ('Apartadó', 'Antioquia'), ('Rionegro', 'Antioquia'), ('Arauca', 'Arauca'), ('Barranquilla', 'Atlántico'), ('Solapao', 'Atlántico'), ('Malambo', 'Atlántico'), ('Sabanalarga', 'Atlántico'), ('Bogotá', 'Bogotá D. C.'), ('Cartagena', 'Bolívar'), ('Magangué', 'Bolívar'), ('Turbaco', 'Bolívar'), ('El Carmen de Bolívar', 'Bolívar'), ('Tunja', 'Boyacá'), ('Duitama', 'Boyacá'), ('Sogamoso', 'Boyacá'), ('Chiquinquirá', 'Boyacá'), ('Paipa', 'Boyacá'), ('Manizales', 'Caldas'), ('La Dorada', 'Caldas'), ('Chinchiná', 'Caldas'), ('Riocedro', 'Caldas'), ('Florencia', 'Caquetá'), ('Yopal', 'Casanare'), ('Aguazul', 'Casanare'), ('Popayán', 'Cauca'), ('Santander de Quilichao', 'Cauca'), ('Puerto Tejada', 'Cauca'), ('Cauca', 'Cauca'), ('Valledupar', 'Cesar'), ('Aguachica', 'Cesar'), ('Codazzi', 'Cesar'), ('Quibdó', 'Chocó'), ('Istmina', 'Chocó'), ('Bahía Solano', 'Chocó'), ('Montería', 'Córdoba'), ('Lorica', 'Córdoba'), ('Sincelejo', 'Córdoba'), ('Rionegro', 'Córdoba'), ('Bogotá', 'Cundinamarca'), ('Soacha', 'Cundinamarca'), ('Zipaquirá', 'Cundinamarca'), ('Facatativá', 'Cundinamarca'), ('Chía', 'Cundinamarca'), ('Girardot', 'Cundinamarca'), ('Inírida', 'Guainía'), ('San José del Guaviare', 'Guaviare'), ('Neiva', 'Huila'), ('Pitalito', 'Huila'), ('Garzón', 'Huila'), ('Campoalegre', 'Huila'), ('Riohacha', 'La Guajira'), ('Maicao', 'La Guajira'), ('Uribia', 'La Guajira'), ('Barranquilla', 'La Guajira'), ('Santa Marta', 'Magdalena'), ('Ciénaga', 'Magdalena'), ('Fundación', 'Magdalena'), ('Villavicencio', 'Meta'), ('Acacías', 'Meta'), ('Granada', 'Meta'), ('Pasto', 'Nariño'), ('Tumaco', 'Nariño'), ('Ipiales', 'Nariño'), ('Túquerres', 'Nariño'), ('Cúcuta', 'Norte de Santander'), ('Ocaña', 'Norte de Santander'), ('Pamplona', 'Norte de Santander'), ('Mocoa', 'Putumayo'), ('Armenia', 'Quindío'), ('Calarcá', 'Quindío'), ('Montenegro', 'Quindío'), ('Quimbaya', 'Quindío'), ('Pereira', 'Risaralda'), ('Dosquebradas', 'Risaralda'), ('Santa Rosa de Cabal', 'Risaralda'), ('Armenia', 'Risaralda'), ('Bucaramanga', 'Santander'), ('Floridablanca', 'Santander'), ('Barrancabermeja', 'Santander'), ('Girón', 'Santander'), ('Sincelejo', 'Sucre'), ('Corozal', 'Sucre'), ('Tolu', 'Sucre'), ('Ibagué', 'Tolima'), ('Espinal', 'Tolima'), ('Melgar', 'Tolima'), ('Honda', 'Tolima'), ('Cali', 'Valle del Cauca'), ('Palmira', 'Valle del Cauca'), ('Buenaventura', 'Valle del Cauca'), ('Tuluá', 'Valle del Cauca'), ('Cartago', 'Valle del Cauca'), ('Buga', 'Valle del Cauca'), ('Jamundí', 'Valle del Cauca'), ('Yumbo', 'Valle del Cauca'), ('Popayán', 'Valle del Cauca'), ('Cauca', 'Valle del Cauca'), ('Armenia', 'Valle del Cauca'), ('Mitú', 'Vaupés'), ('Puerto Carreño', 'Vichada')) AS datos(ciudad, departamento)
      JOIN "departments" d ON d.name = datos.departamento
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "cities"')
    await queryRunner.query('DROP TABLE IF EXISTS "departments"')
  }
}
