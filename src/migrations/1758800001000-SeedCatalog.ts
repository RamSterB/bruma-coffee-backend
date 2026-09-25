import { MigrationInterface, QueryRunner } from 'typeorm'

interface SeedVariant {
  weightGrams: number
  price: number
  stock: number
}

interface SeedCoffee {
  name: string
  description: string
  roastLevel: 'light' | 'medium' | 'dark'
  process: 'washed' | 'natural' | 'honey' | 'anaerobic'
  region: string
  tastingNotes: string[]
  variants: SeedVariant[]
}

/**
 * Doce cafés de lotes y regiones distintas. Once quedan visibles en el catálogo
 * porque al menos una variante tiene stock; el último se deja agotado a propósito
 * para comprobar que la API no lo muestra.
 */
const COFFEES: SeedCoffee[] = [
  {
    name: 'Geisha del Huila',
    description:
      'Lote de altura del sur de Huila, cosechado a 1.850 msnm en una finca de nueve hectáreas. ' +
      'Se despulpa y fermenta 36 horas en tanque, con un lavado final breve que le conserva la claridad en vez de ahogarla. ' +
      'En taza es floral y aromático, con un dulzor tipo agave y un cuerpo ligero que invita a filtrar despacio. ' +
      'Recomendado en V60 con agua a 93 °C y 15 g por 250 ml, para no apagar sus matices más delicados.',
    roastLevel: 'light',
    process: 'washed',
    region: 'huila',
    tastingNotes: ['jasmín', 'bergamota', 'melocotón'],
    variants: [
      { weightGrams: 250, price: 48000, stock: 24 },
      { weightGrams: 500, price: 89000, stock: 12 },
    ],
  },
  {
    name: 'Pink Bourbon del Valle',
    description:
      'Variedad rosa de la finca La Pradera, en el Valle del Cauca, cultivada a 1.700 msnm. ' +
      'Fermenta 48 horas en tanque cerrado con control de temperatura, para evitar la sobrefermentación y preservar el perfil frutal. ' +
      'La cosecha es cherry, recogida solo en su punto exacto de maduración. ' +
      'En taza ofrece frutos rojos maduros, una nota floral de rosa y un fondo de panela que persiste largo en el paladar.',
    roastLevel: 'light',
    process: 'washed',
    region: 'valle-del-cauca',
    tastingNotes: ['frutos rojos', 'rosa', 'panela'],
    variants: [
      { weightGrams: 250, price: 52000, stock: 18 },
      { weightGrams: 1000, price: 185000, stock: 6 },
    ],
  },
  {
    name: 'Sidra de Nariño',
    description:
      'Sidra cultivada a 1.950 msnm en el departamento de Nariño, dentro de una finca que solo dedica veinte hectáreas a la producción. ' +
      'Fermenta de forma anaeróbica 36 horas en tanque sellado, lo que intensifica los aromas sin volverla agria. ' +
      'En taza se perciben manzana verde y frutas de hueso, con acidez brillante y un final floral muy limpio. ' +
      'Es un café para días sin prisa.',
    roastLevel: 'light',
    process: 'anaerobic',
    region: 'nariño',
    tastingNotes: ['manzana verde', 'jazmín', 'frutos rojos'],
    variants: [
      { weightGrams: 250, price: 58000, stock: 15 },
      { weightGrams: 500, price: 105000, stock: 8 },
    ],
  },
  {
    name: 'Honey del Quindío',
    description:
      'El mucílago se retira solo a medias, de modo que el café seca con buena parte de su dulzor natural adherido al grano. ' +
      'Se seca en camas africanas durante quince días, volteando constantemente para que la curva sea pareja. ' +
      'El resultado es una textura sedosa y un cuerpo redondo que no se pierde por más que la acidez sea limpia. ' +
      'Va muy bien en prensado o Chemex.',
    roastLevel: 'medium',
    process: 'honey',
    region: 'quindio',
    tastingNotes: ['miel de caña', 'almendra', 'mandarina'],
    variants: [
      { weightGrams: 250, price: 39000, stock: 30 },
      { weightGrams: 500, price: 72000, stock: 16 },
    ],
  },
  {
    name: 'Caturra de Nariño',
    description:
      'Caturra lavado de altura, alternada con fraijanes para dar sombra al cafetal. ' +
      'Es un café de sabor suave y muy equilibrado, con un cuerpo que aguanta tanto el filtro como el espresso sin perder matiz. ' +
      'Es la recomendación indicada para quien busca un café de todos los días que no resulte arriesgado ni simple.',
    roastLevel: 'medium',
    process: 'washed',
    region: 'nariño',
    tastingNotes: ['cacao', 'avellana', 'toffee'],
    variants: [
      { weightGrams: 250, price: 32000, stock: 45 },
      { weightGrams: 1000, price: 112000, stock: 20 },
    ],
  },
  {
    name: 'Castillo del Tolima',
    description:
      'El Castillo se distingue por su raíz pivot, que le da una capacidad de rendimiento estable frente a la sequía y el cambio climático, un rasgo cada vez más visto en el Tolima. ' +
      'Se lava y seca en camas africanas durante doce días. ' +
      'En taza muestra un dulzor a panela, un final herbal limpio y una acidez media muy agradable.',
    roastLevel: 'medium',
    process: 'washed',
    region: 'tolima',
    tastingNotes: ['panela', 'ciruela', 'cacao'],
    variants: [
      { weightGrams: 250, price: 34000, stock: 38 },
      { weightGrams: 500, price: 64000, stock: 14 },
    ],
  },
  {
    name: 'Typica de Caldas',
    description:
      'Cafetal familiar de cuatro hectáreas, cultivado a 1.600 msnm en las estribaciones del río Caldas. ' +
      'La recolección es selectiva, pasa por mano, y solo se procesa el café maduro. ' +
      'En taza apuntan notas a caramelo y un final de nueces, con acidez redondeada. ' +
      'Funciona igual de bien en filtro que en prensado.',
    roastLevel: 'medium',
    process: 'washed',
    region: 'caldas',
    tastingNotes: ['caramelo', 'nuez moscada', 'ciruela'],
    variants: [
      { weightGrams: 250, price: 33000, stock: 40 },
      { weightGrams: 500, price: 61000, stock: 22 },
    ],
  },
  {
    name: 'Natural del Cauca',
    description:
      'El café se seca con toda la cereza, dieciocho días en camas africanas sobre la terraza, removiendo constantemente para evitar moho. ' +
      'Ese contacto prolongado con la fruta le da un dulzor de fruta madura muy presente y un cuerpo denso, casi redondeado. ' +
      'Conviene filtrarlo con paciencia: un agua demasiado rápida se lleva esa dulzura antes de que se exprese en la taza.',
    roastLevel: 'medium',
    process: 'natural',
    region: 'cauca',
    tastingNotes: ['ciruela pasa', 'uva', 'cacao niboso'],
    variants: [
      { weightGrams: 250, price: 35000, stock: 26 },
      { weightGrams: 1000, price: 124000, stock: 9 },
    ],
  },
  {
    name: 'Caturra Honey de Cundinamarca',
    description:
      'Lote de la Sabana, donde la altitud y la brisa de Boyacá mantienen la humedad justa. ' +
      'El proceso honey deja buena parte del mucílago sobre el grano, y el secado lento en tendedero realza el resultado. ' +
      'En taza tiene notas a coco y caramelo, con una acidez muy baja que lo hace extremadamente amable con la leche. ' +
      'Un café para tomar sin pensar.',
    roastLevel: 'medium',
    process: 'honey',
    region: 'cundinamarca',
    tastingNotes: ['coco', 'caramelo', 'nuez'],
    variants: [
      { weightGrams: 250, price: 31000, stock: 35 },
      { weightGrams: 500, price: 58000, stock: 11 },
    ],
  },
  {
    name: 'Castillo de Santander',
    description:
      'De la falda norte, donde la pendiente y la sombra de guayacán mantienen los cafetos frescos. ' +
      'Proceso lavado clásico: despulpa, fermenta en tanque 24 horas y lava enseguida para no dejar arrastres. ' +
      'En taza aparecen panela y mandarina, con una acidez que queda justa. ' +
      'Un café de cuerpo medio, muy estable para el día a día.',
    roastLevel: 'medium',
    process: 'washed',
    region: 'santander',
    tastingNotes: ['panela', 'mandarina', 'cacao'],
    variants: [
      { weightGrams: 250, price: 30000, stock: 42 },
      { weightGrams: 500, price: 56000, stock: 19 },
    ],
  },
  {
    name: 'Catuaí Natural de Arauca',
    description:
      'Variedad Catuaí de la Orinoquía, fermentada en cereza durante 48 horas antes de secarse en mesas. ' +
      'La fermentación en la fruta entera aporta una acidez fermentada y un cuerpo espeso, muy por debajo de los cafés lavado de la zona. ' +
      'En taza se distinguen naranja confitada y un fondo dulce tipo panela tostada.',
    roastLevel: 'dark',
    process: 'natural',
    region: 'arauca',
    tastingNotes: ['cacao amargo', 'mora', 'panela quemada'],
    variants: [
      { weightGrams: 250, price: 29000, stock: 28 },
      { weightGrams: 500, price: 54000, stock: 0 },
    ],
  },
  {
    name: 'Gesha Lavado de Pitalito',
    description:
      'Reserva de la finca El Paraíso, en Pitalito, Huila, en una ladera con un microclima muy estable. ' +
      'Lavado clásico con fermentación corta de 24 horas, porque la Gesha se pierde si se la deja demasiado tiempo en el tanque. ' +
      'En taza ofrece gardenia, té negro y un cuerpo sedoso. ' +
      'Lote ya agotado.',
    roastLevel: 'light',
    process: 'washed',
    region: 'huila',
    tastingNotes: ['gardenia', 'té negro', 'miel'],
    variants: [{ weightGrams: 250, price: 62000, stock: 0 }],
  },
]

export class SeedCatalog1758800001000 implements MigrationInterface {
  name = 'SeedCatalog1758800001000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const coffee of COFFEES) {
      const rows: { id: string }[] = await queryRunner.query(
        `INSERT INTO "coffees" (name, description, roast_level, process, region, tasting_notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          coffee.name,
          coffee.description,
          coffee.roastLevel,
          coffee.process,
          coffee.region,
          coffee.tastingNotes,
        ],
      )

      for (const variant of coffee.variants) {
        await queryRunner.query(
          `INSERT INTO "coffee_variants" (coffee_id, weight_grams, price, stock)
           VALUES ($1, $2, $3, $4)`,
          [rows[0].id, variant.weightGrams, variant.price, variant.stock],
        )
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DELETE FROM "coffees" WHERE name = ANY($1::text[])', [
      COFFEES.map((coffee) => coffee.name),
    ])
  }
}
