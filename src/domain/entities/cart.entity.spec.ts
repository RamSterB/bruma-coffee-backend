import { DomainError } from '../enums/assert-enum'
import { Cart, CartItem } from './cart.entity'

const linea = (
  over: Partial<{
    variantId: string
    quantity: number
    price: number
    stock: number
    isActive: boolean
    exists: boolean
  }> = {},
) => ({
  variantId: over.variantId ?? '11111111-1111-4111-8111-111111111111',
  quantity: over.quantity ?? 2,
  price: over.price ?? 25000,
  stock: over.stock ?? 10,
  isActive: over.isActive ?? true,
  exists: over.exists ?? true,
})

describe('CartItem', () => {
  it('calcula el subtotal de la linea con el precio del servidor', () => {
    const item = CartItem.create(linea())

    expect(item.subtotal).toBe(50000)
  })

  it('rechaza una cantidad cero o negativa, que no es una cantidad', () => {
    expect(() => CartItem.create(linea({ quantity: 0 }))).toThrow(DomainError)
    expect(() => CartItem.create(linea({ quantity: -3 }))).toThrow(DomainError)
  })

  it('rechaza una cantidad que no es entera', () => {
    expect(() => CartItem.create(linea({ quantity: 1.5 }))).toThrow(DomainError)
  })

  it('recorta la cantidad al stock, porque no se puede comprar lo que no hay', () => {
    const item = CartItem.create(linea({ quantity: 8, stock: 3 }))

    expect(item.quantity).toBe(3)
  })

  it('deja la línea como no comprable si el stock es cero, en vez de dejar una cantidad cero', () => {
    const item = CartItem.create(linea({ quantity: 4, stock: 0 }))

    expect(item.isPurchasable).toBe(false)
    expect(item.quantity).toBe(0)
  })

  it('una variante retirada o desactivada no es comprable aunque tenga stock', () => {
    const item = CartItem.create({ ...linea({ quantity: 2, stock: 9 }), isActive: false })

    expect(item.isPurchasable).toBe(false)
  })

  it('no es comprable si la variante ya no existe en el catalogo', () => {
    const item = CartItem.create({ ...linea(), exists: false })

    expect(item.isPurchasable).toBe(false)
  })

  it('una línea comprable no cuenta para nada raro: quantity y subtotal cuadran', () => {
    const item = CartItem.create(linea({ quantity: 3, price: 1000, stock: 10 }))

    expect(item.quantity).toBe(3)
    expect(item.subtotal).toBe(3000)
    expect(item.isPurchasable).toBe(true)
  })
})

describe('Cart', () => {
  it('empieza vacio y con subtotal cero', () => {
    const cart = Cart.empty('user-1')

    expect(cart.items).toEqual([])
    expect(cart.subtotal).toBe(0)
  })

  it('suma el subtotal de las líneas comprables', () => {
    const cart = Cart.create('user-1', [
      CartItem.create(linea({ variantId: 'a', quantity: 2, price: 1000 })),
      CartItem.create(linea({ variantId: 'b', quantity: 1, price: 2500 })),
    ])

    expect(cart.subtotal).toBe(4500)
  })

  it('las lineas no comprables no suman al subtotal, que es lo que se cobra', () => {
    const cart = Cart.create('user-1', [
      CartItem.create(linea({ variantId: 'a', quantity: 2, price: 1000 })),
      CartItem.create(linea({ variantId: 'b', quantity: 2, price: 9999, stock: 0 })),
    ])

    expect(cart.subtotal).toBe(2000)
  })

  it('cuenta cuantas lineas hay sin contar las que no se pueden comprar', () => {
    const cart = Cart.create('user-1', [
      CartItem.create(linea({ variantId: 'a', quantity: 1 })),
      CartItem.create(linea({ variantId: 'b', quantity: 1, stock: 0 })),
    ])

    expect(cart.totalItems).toBe(2)
    expect(cart.purchasableItems).toBe(1)
  })

  it('sustituye la linea si la variante ya estaba, en vez de duplicarla', () => {
    const cart = Cart.create('user-1', [
      CartItem.create(linea({ variantId: 'a', quantity: 2 })),
      CartItem.create(linea({ variantId: 'a', quantity: 5 })),
    ])

    expect(cart.items).toHaveLength(1)
    expect(cart.items[0].quantity).toBe(5)
  })

  it('con una cantidad mas grande gana la linea mas grande', () => {
    const cart = Cart.create('user-1', [
      CartItem.create(linea({ variantId: 'a', quantity: 5 })),
      CartItem.create(linea({ variantId: 'a', quantity: 2 })),
    ])

    expect(cart.items[0].quantity).toBe(5)
  })

  it('devuelve la linea de una variante, o null si no esta', () => {
    const cart = Cart.create('user-1', [CartItem.create(linea({ variantId: 'a' }))])

    expect(cart.lineaDe('a')?.quantity).toBe(2)
    expect(cart.lineaDe('no-esta')).toBeNull()
  })
})
