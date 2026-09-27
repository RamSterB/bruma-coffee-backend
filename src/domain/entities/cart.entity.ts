import { DomainError } from '../enums/assert-enum'

/**
 * Una línea del carrito. Guarda el identificador de la variante y la cantidad, y
 * nada más: el precio y el stock no se copian, se leen del catálogo cada vez que
 * se abre el carrito. Copiarlos sería guardar una verdade que envejece, y el
 * precio es siempre el del servidor: nunca es el que el navegador dice.
 */
export class CartItem {
  private constructor(
    public readonly variantId: string,
    public readonly quantity: number,
    public readonly price: number,
    public readonly stock: number,
    public readonly isActive: boolean,
    public readonly coffeeId: string | null,
    public readonly coffeeName: string | null,
    public readonly weightGrams: number | null,
  ) {}

  static create(input: {
    variantId: string
    quantity: number
    price: number
    stock: number
    isActive: boolean
    coffeeId?: string | null
    coffeeName?: string | null
    weightGrams?: number | null
    exists?: boolean
  }): CartItem {
    if (input.variantId.trim() === '') {
      throw new DomainError('La línea del carrito necesita el identificador de la variante')
    }

    // Cero y negativo se rechazan igual que en la base, que tiene CHECK (quantity
    // > 0): una línea de cantidad cero no es una cantidad, es un error de quien la
    // escribió. El cero de una línea no comprable lo pone el propio recorte.
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new DomainError(
        `La cantidad debe ser un entero mayor que cero, se recibió ${input.quantity}`,
      )
    }

    // Una variante que ya no está en el catálogo no tiene precio que valga: se
    // devuelve con la línea a cero y no comprable, no con un precio inventado.
    const existe = input.exists ?? true
    const comprable = existe && input.isActive && input.stock > 0
    const cantidad = comprable ? Math.min(input.quantity, input.stock) : 0

    return new CartItem(
      input.variantId,
      cantidad,
      input.price,
      input.stock,
      input.isActive,
      input.coffeeId ?? null,
      input.coffeeName ?? null,
      input.weightGrams ?? null,
    )
  }

  get subtotal(): number {
    return this.isPurchasable ? this.quantity * this.price : 0
  }

  /**
   * Lo que decide si esta línea se puede pagar. Es la misma regla que usa el
   * cliente en el cajón, y vive en un solo sitio para que las dos no se separen.
   */
  get isPurchasable(): boolean {
    return this.quantity > 0 && this.price >= 0
  }
}

export class Cart {
  private constructor(
    public readonly userId: string,
    public readonly items: CartItem[],
  ) {}

  static empty(userId: string): Cart {
    return new Cart(userId, [])
  }

  /**
   * Si la misma variante aparece dos veces se queda la cantidad mayor, no la
   * suma: el UNIQUE de la base ya impide el duplicado, y aquí se evita que una
   * lectura con dos líneas ambiguas produzca un subtotal que nadie pidió.
   */
  static create(userId: string, items: CartItem[]): Cart {
    const porVariante = new Map<string, CartItem>()

    for (const item of items) {
      const previa = porVariante.get(item.variantId)

      porVariante.set(
        item.variantId,
        previa === undefined || item.quantity >= previa.quantity ? item : previa,
      )
    }

    return new Cart(userId, [...porVariante.values()])
  }

  get subtotal(): number {
    return this.items.reduce((total, item) => total + item.subtotal, 0)
  }

  get totalItems(): number {
    return this.items.length
  }

  get purchasableItems(): number {
    return this.items.filter((item) => item.isPurchasable).length
  }

  lineaDe(variantId: string): CartItem | null {
    return this.items.find((item) => item.variantId === variantId) ?? null
  }
}
