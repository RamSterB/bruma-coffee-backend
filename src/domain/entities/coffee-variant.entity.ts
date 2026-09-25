import { DomainError } from '../enums/assert-enum'

const isNonNegativeInteger = (value: number): boolean => Number.isInteger(value) && value >= 0

export class CoffeeVariant {
  private constructor(
    public readonly id: string | null,
    public readonly weightGrams: number,
    public readonly price: number,
    public readonly stock: number,
    public readonly isActive: boolean,
    public readonly coffeeId: string | null,
  ) {}

  static create(input: { weightGrams: number; price: number; stock: number }): CoffeeVariant {
    CoffeeVariant.validate(input.weightGrams, input.price, input.stock)

    return new CoffeeVariant(null, input.weightGrams, input.price, input.stock, true, null)
  }

  static reconstitute(input: {
    id: string
    weightGrams: number
    price: number
    stock: number
    isActive: boolean
    coffeeId: string
  }): CoffeeVariant {
    return new CoffeeVariant(
      input.id,
      input.weightGrams,
      input.price,
      input.stock,
      input.isActive,
      input.coffeeId,
    )
  }

  static validate(weightGrams: number, price: number, stock: number): void {
    if (!Number.isInteger(weightGrams) || weightGrams <= 0) {
      throw new DomainError(`El peso debe ser un entero mayor que cero, se recibió ${weightGrams}`)
    }

    if (!isNonNegativeInteger(price)) {
      throw new DomainError(
        `El precio debe ser un entero mayor o igual a cero, se recibió ${price}`,
      )
    }

    if (!isNonNegativeInteger(stock)) {
      throw new DomainError(`El stock debe ser un entero mayor o igual a cero, se recibió ${stock}`)
    }
  }

  get isAvailable(): boolean {
    return this.isActive && this.stock > 0
  }
}
