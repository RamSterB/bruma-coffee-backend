import { assertEnum, DomainError } from '../enums/assert-enum'
import { CoffeeProcess } from '../enums/coffee-process.enum'
import { CoffeeRegion } from '../enums/coffee-region.enum'
import { RoastLevel } from '../enums/roast-level.enum'
import { CoffeeVariant } from './coffee-variant.entity'

const MAX_NAME_LENGTH = 120

export interface CoffeeAttributes {
  name: string
  description: string
  roastLevel: RoastLevel
  process: CoffeeProcess
  region: CoffeeRegion
  tastingNotes: string[]
}

export class Coffee {
  private constructor(
    public readonly id: string | null,
    public readonly name: string,
    public readonly description: string,
    public readonly roastLevel: RoastLevel,
    public readonly process: CoffeeProcess,
    public readonly region: CoffeeRegion,
    public readonly tastingNotes: string[],
    public readonly isActive: boolean,
    public readonly variants: CoffeeVariant[],
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static create(attributes: CoffeeAttributes): Coffee {
    Coffee.validate(attributes)

    const now = new Date()

    return new Coffee(
      null,
      attributes.name.trim(),
      attributes.description.trim(),
      attributes.roastLevel,
      attributes.process,
      attributes.region,
      Coffee.normalizeNotes(attributes.tastingNotes),
      true,
      [],
      now,
      now,
    )
  }

  static reconstitute(input: {
    id: string
    name: string
    description: string
    roastLevel: RoastLevel
    process: CoffeeProcess
    region: CoffeeRegion
    tastingNotes: string[]
    isActive: boolean
    variants: CoffeeVariant[]
    createdAt: Date
    updatedAt: Date
  }): Coffee {
    return new Coffee(
      input.id,
      input.name,
      input.description,
      input.roastLevel,
      input.process,
      input.region,
      input.tastingNotes,
      input.isActive,
      input.variants,
      input.createdAt,
      input.updatedAt,
    )
  }

  private static validate(attributes: CoffeeAttributes): void {
    const name = attributes.name.trim()

    if (name === '') {
      throw new DomainError('El nombre del café es obligatorio')
    }

    if (name.length > MAX_NAME_LENGTH) {
      throw new DomainError(`El nombre no puede superar ${MAX_NAME_LENGTH} caracteres`)
    }

    if (attributes.description.trim() === '') {
      throw new DomainError('La descripción del café es obligatoria')
    }

    assertEnum(CoffeeRegion, attributes.region)
    assertEnum(CoffeeProcess, attributes.process)
    assertEnum(RoastLevel, attributes.roastLevel)
  }

  private static normalizeNotes(notes: string[]): string[] {
    return notes.map((note) => note.trim()).filter((note) => note !== '')
  }

  addVariant(variant: CoffeeVariant): void {
    const alreadyExists = this.variants.some(
      (current) => current.weightGrams === variant.weightGrams,
    )

    if (alreadyExists) {
      throw new DomainError(
        `Ya existe una variante de ${variant.weightGrams} g para el café "${this.name}"`,
      )
    }

    this.variants.push(variant)
  }

  hasAvailableVariants(): boolean {
    return this.variants.some((variant) => variant.isAvailable)
  }

  priceFrom(): number | null {
    const prices = this.variants
      .filter((variant) => variant.isAvailable)
      .map((variant) => variant.price)

    return prices.length === 0 ? null : Math.min(...prices)
  }
}
