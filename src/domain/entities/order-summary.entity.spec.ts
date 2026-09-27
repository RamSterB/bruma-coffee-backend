import { DomainError } from '../enums/assert-enum'
import { OrderSummary, calculateShipping, summarizeOrder } from './order-summary.entity'

const CONFIG = {
  taxRate: 0.19,
  shippingFlatRate: 10000,
  freeShippingThreshold: 150000,
}

const linea = (precio: number, cantidad = 1) => ({ unitPrice: precio, quantity: cantidad })

describe('calculateShipping', () => {
  it('cobra la tarifa fija cuando el subtotal no llega al umbral', () => {
    expect(calculateShipping(99999, CONFIG)).toBe(10000)
  })

  it('no cobra envío desde justo el umbral', () => {
    expect(calculateShipping(150000, CONFIG)).toBe(0)
  })

  it('tampoco lo cobra por encima del umbral', () => {
    expect(calculateShipping(200000, CONFIG)).toBe(0)
  })

  it('un carrito vacío no paga envío: no hay nada que enviar', () => {
    expect(calculateShipping(0, CONFIG)).toBe(0)
  })

  it('el envío es un entero, porque el peso se redondea a pesos', () => {
    expect(Number.isInteger(calculateShipping(1234, CONFIG))).toBe(true)
  })
})

describe('summarizeOrder', () => {
  it('suma el subtotal de las líneas', () => {
    const resumen = summarizeOrder([linea(42000, 2), linea(35000, 1)], CONFIG)

    expect(resumen.subtotal).toBe(119000)
  })

  it('calcula el IVA sobre el subtotal de los productos', () => {
    const resumen = summarizeOrder([linea(100000, 1)], CONFIG)

    expect(resumen.tax).toBe(19000)
  })

  it('el IVA se añade encima, porque los precios no lo incluyen', () => {
    const resumen = summarizeOrder([linea(100000, 1)], CONFIG)

    expect(resumen.total).toBe(resumen.subtotal + resumen.tax + resumen.shipping)
  })

  it('el total suma subtotal, IVA y envío', () => {
    const resumen = summarizeOrder([linea(42000, 1)], CONFIG)

    // 42.000 + 7.980 de IVA + 10.000 de envío
    expect(resumen.subtotal).toBe(42000)
    expect(resumen.tax).toBe(7980)
    expect(resumen.shipping).toBe(10000)
    expect(resumen.total).toBe(59980)
  })

  it('un carrito vacío da un resumen a cero, sin IVA ni envío', () => {
    const resumen = summarizeOrder([], CONFIG)

    // El envio gratis se marca con subtotal 0 como false: un carrito vacio no
    // ha alcanzado ningun umbral, simplemente no hay nada.
    expect(resumen).toEqual({
      subtotal: 0,
      tax: 0,
      shipping: 0,
      total: 0,
      isFreeShipping: false,
    })
  })

  it('marca el envío como gratis cuando el subtotal llega al umbral', () => {
    const resumen = summarizeOrder([linea(150000, 1)], CONFIG)

    expect(resumen.isFreeShipping).toBe(true)
  })

  it('no marca envío gratis cuando hay que pagar', () => {
    const resumen = summarizeOrder([linea(42000, 1)], CONFIG)

    expect(resumen.isFreeShipping).toBe(false)
  })

  it('el total nunca es un decimal, porque el peso se muestra sin centavos', () => {
    const resumen = summarizeOrder([linea(33333, 3)], CONFIG)

    expect(Number.isInteger(resumen.total)).toBe(true)
  })

  it('ignora una línea con cantidad cero o negativa en vez de restar del total', () => {
    const resumen = summarizeOrder([linea(42000, 1), linea(99999, 0)], CONFIG)

    expect(resumen.subtotal).toBe(42000)
  })

  it('redondea el IVA a pesos enteros, sin quedarme con decimales', () => {
    const resumen = summarizeOrder([linea(10000, 1)], CONFIG)

    // 1.900 exacto; con un precio que no da exacto, el redondeo es a entero.
    expect(resumen.tax).toBe(1900)
  })

  it('un precio negativo se rechaza, porque descontar no es una operación de carrito', () => {
    expect(() => summarizeOrder([linea(-100, 1)], CONFIG)).toThrow(DomainError)
  })
})

describe('OrderSummary', () => {
  it('guarda las líneas con su importe, para que el modal pueda listarlas', () => {
    const resumen = OrderSummary.create(
      [{ variantId: 'v1', coffeeName: 'Nariño', unitPrice: 42000, quantity: 2 }],
      CONFIG,
    )

    expect(resumen.lines).toEqual([
      { variantId: 'v1', coffeeName: 'Nariño', unitPrice: 42000, quantity: 2, subtotal: 84000 },
    ])
  })

  it('el total de las líneas es el mismo que el subtotal, para que nada se esconda', () => {
    const resumen = OrderSummary.create(
      [
        { variantId: 'v1', coffeeName: 'Nariño', unitPrice: 42000, quantity: 2 },
        { variantId: 'v2', coffeeName: 'Huila', unitPrice: 35000, quantity: 1 },
      ],
      CONFIG,
    )

    const deLasLineas = resumen.lines.reduce((total, linea) => total + linea.subtotal, 0)

    expect(deLasLineas).toBe(resumen.subtotal)
  })
})
