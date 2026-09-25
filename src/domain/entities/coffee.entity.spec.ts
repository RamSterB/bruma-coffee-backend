import { Coffee } from './coffee.entity'
import { CoffeeVariant } from './coffee-variant.entity'
import { CoffeeProcess } from '../enums/coffee-process.enum'
import { CoffeeRegion } from '../enums/coffee-region.enum'
import { RoastLevel } from '../enums/roast-level.enum'

const validVariant = () => ({
  weightGrams: 250,
  price: 42000,
  stock: 30,
})

describe('CoffeeVariant', () => {
  it('acepta un peso positivo y un precio no negativo', () => {
    const variant = CoffeeVariant.create(validVariant())

    expect(variant.weightGrams).toBe(250)
    expect(variant.price).toBe(42000)
    expect(variant.stock).toBe(30)
  })

  it('acepta precio cero (café de regalo no, pero la regla es >= 0)', () => {
    expect(CoffeeVariant.create({ ...validVariant(), price: 0 }).price).toBe(0)
  })

  it('rechaza un peso de cero gramos', () => {
    expect(() => CoffeeVariant.create({ ...validVariant(), weightGrams: 0 })).toThrow(/peso/i)
  })

  it('rechaza un peso negativo', () => {
    expect(() => CoffeeVariant.create({ ...validVariant(), weightGrams: -100 })).toThrow(/peso/i)
  })

  it('rechaza un peso decimal, porque el peso es en gramos enteros', () => {
    expect(() => CoffeeVariant.create({ ...validVariant(), weightGrams: 250.5 })).toThrow(/peso/i)
  })

  it('rechaza un precio negativo', () => {
    expect(() => CoffeeVariant.create({ ...validVariant(), price: -1 })).toThrow(/precio/i)
  })

  it('rechaza un precio decimal, porque en COP no hay centavos', () => {
    expect(() => CoffeeVariant.create({ ...validVariant(), price: 42000.5 })).toThrow(/precio/i)
  })

  it('rechaza un stock negativo', () => {
    expect(() => CoffeeVariant.create({ ...validVariant(), stock: -1 })).toThrow(/stock/i)
  })

  it('acepta stock cero: un producto agotado sigue existiendo', () => {
    expect(CoffeeVariant.create({ ...validVariant(), stock: 0 }).stock).toBe(0)
  })

  it('rechaza un stock decimal', () => {
    expect(() => CoffeeVariant.create({ ...validVariant(), stock: 1.5 })).toThrow(/stock/i)
  })

  it('inicia activa', () => {
    expect(CoffeeVariant.create(validVariant()).isActive).toBe(true)
  })
})

describe('Coffee', () => {
  const validCoffee = () => ({
    name: 'Geisha Huila',
    description: 'Lote de altura con perfil floral intenso.',
    roastLevel: RoastLevel.LIGHT,
    process: CoffeeProcess.WASHED,
    region: CoffeeRegion.HUILA,
    tastingNotes: ['jazmín', 'melocotón', 'bergamota'],
  })

  it('crea un café activo y sin variantes', () => {
    const coffee = Coffee.create(validCoffee())

    expect(coffee.name).toBe('Geisha Huila')
    expect(coffee.isActive).toBe(true)
    expect(coffee.variants).toEqual([])
  })

  it('rechaza un nombre vacío', () => {
    expect(() => Coffee.create({ ...validCoffee(), name: '' })).toThrow(/nombre/i)
  })

  it('rechaza un nombre con más de 120 caracteres', () => {
    expect(() => Coffee.create({ ...validCoffee(), name: 'a'.repeat(121) })).toThrow(/nombre/i)
  })

  it('rechaza una descripción vacía', () => {
    expect(() => Coffee.create({ ...validCoffee(), description: '' })).toThrow(/descripción/i)
  })

  it('acepta una descripción larga', () => {
    const description = 'a'.repeat(2000)
    expect(Coffee.create({ ...validCoffee(), description }).description).toHaveLength(2000)
  })

  it('rechaza una región fuera del catálogo cerrado', () => {
    expect(() => Coffee.create({ ...validCoffee(), region: 'magdalena' as CoffeeRegion })).toThrow(
      /magdalena/,
    )
  })

  it('rechaza un proceso fuera del catálogo cerrado', () => {
    expect(() => Coffee.create({ ...validCoffee(), process: 'karma' as CoffeeProcess })).toThrow(
      /karma/,
    )
  })

  it('rechaza un tueste fuera del catálogo cerrado', () => {
    expect(() =>
      Coffee.create({
        ...validCoffee(),
        roastLevel: 'light-medium' as RoastLevel,
      }),
    ).toThrow(/light-medium/)
  })

  it('normaliza las notas de cata sin espacios sobrantes', () => {
    const coffee = Coffee.create({
      ...validCoffee(),
      tastingNotes: ['  jazmín ', 'melocotón'],
    })

    expect(coffee.tastingNotes).toEqual(['jazmín', 'melocotón'])
  })

  it('descarta notas de cata vacías', () => {
    const coffee = Coffee.create({
      ...validCoffee(),
      tastingNotes: ['jazmín', '  ', ''],
    })

    expect(coffee.tastingNotes).toEqual(['jazmín'])
  })

  it('permite un café sin notas de cata', () => {
    expect(Coffee.create({ ...validCoffee(), tastingNotes: [] }).tastingNotes).toEqual([])
  })

  it('agrega una variante y la deja en la lista', () => {
    const coffee = Coffee.create(validCoffee())
    const variant = CoffeeVariant.create(validVariant())

    coffee.addVariant(variant)

    expect(coffee.variants).toHaveLength(1)
    expect(coffee.variants[0]).toBe(variant)
  })

  it('no deja registrar dos variantes del mismo peso', () => {
    const coffee = Coffee.create(validCoffee())
    coffee.addVariant(CoffeeVariant.create(validVariant()))

    expect(() => coffee.addVariant(CoffeeVariant.create(validVariant()))).toThrow(/ya existe/i)
  })

  it('permite el mismo peso en cafés distintos porque la lista es por café', () => {
    const coffee = Coffee.create(validCoffee())
    const otro = Coffee.create({ ...validCoffee(), name: 'Caturra Nariño' })
    coffee.addVariant(CoffeeVariant.create(validVariant()))
    otro.addVariant(CoffeeVariant.create(validVariant()))

    expect(coffee.variants).toHaveLength(1)
    expect(otro.variants).toHaveLength(1)
  })

  it('sabe si tiene alguna variante con stock disponible', () => {
    const coffee = Coffee.create(validCoffee())
    coffee.addVariant(CoffeeVariant.create({ ...validVariant(), stock: 0 }))

    expect(coffee.hasAvailableVariants()).toBe(false)
  })

  it('reporta disponibilidad si alguna variante tiene stock', () => {
    const coffee = Coffee.create(validCoffee())
    coffee.addVariant(CoffeeVariant.create({ ...validVariant(), stock: 0 }))
    coffee.addVariant(CoffeeVariant.create({ ...validVariant(), weightGrams: 500, stock: 5 }))

    expect(coffee.hasAvailableVariants()).toBe(true)
  })

  it('calcula el precio desde como el de la variante más barata con stock', () => {
    const coffee = Coffee.create(validCoffee())
    coffee.addVariant(
      CoffeeVariant.create({
        ...validVariant(),
        weightGrams: 1000,
        price: 145000,
      }),
    )
    coffee.addVariant(
      CoffeeVariant.create({
        ...validVariant(),
        weightGrams: 250,
        price: 42000,
        stock: 0,
      }),
    )

    expect(coffee.priceFrom()).toBe(145000)
  })

  it('devuelve null como precio desde si nada tiene stock', () => {
    const coffee = Coffee.create(validCoffee())
    coffee.addVariant(CoffeeVariant.create({ ...validVariant(), stock: 0 }))

    expect(coffee.priceFrom()).toBeNull()
  })
})
