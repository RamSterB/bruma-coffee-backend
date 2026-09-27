import { FakeCartRepository } from '../../testing/fakes/fake-cart.repository'
import { buildCoffeeVariant } from '../../testing/coffee.fixtures'
import { GetOrderSummaryUseCase } from './get-order-summary.use-case'

const VARIANTE = 'variant-1'
const CARA = 'variant-cara'
const CONFIG = { taxRate: 0.19, shippingFlatRate: 10000, freeShippingThreshold: 150000 }

const montar = () => {
  const carrito = new FakeCartRepository()

  carrito.catalogo.set(VARIANTE, buildCoffeeVariant(VARIANTE, { price: 42000, stock: 10 }))
  carrito.catalogo.set(CARA, buildCoffeeVariant(CARA, { price: 30000, stock: 10 }))
  carrito.nombresDeCafe.set(VARIANTE, 'Café Nariño')
  carrito.nombresDeCafe.set(CARA, 'Café Huila')

  return carrito
}

describe('GetOrderSummaryUseCase', () => {
  it('devuelve el resumen del carrito con los precios del servidor', async () => {
    const carrito = montar()
    carrito.registrar('user-1', [{ variantId: VARIANTE, quantity: 2 }])

    const resumen = await new GetOrderSummaryUseCase(carrito, CONFIG).execute('user-1')

    expect(resumen.subtotal).toBe(84000)
    expect(resumen.lines[0]).toMatchObject({ variantId: VARIANTE, coffeeName: 'Café Nariño' })
  })

  it('calcula el IVA, el envío y el total en el backend, no los deja al navegador', async () => {
    const carrito = montar()
    carrito.registrar('user-1', [{ variantId: VARIANTE, quantity: 2 }])

    const resumen = await new GetOrderSummaryUseCase(carrito, CONFIG).execute('user-1')

    expect(resumen.tax).toBe(15960)
    expect(resumen.shipping).toBe(10000)
    expect(resumen.total).toBe(109960)
  })

  it('marca el envío como gratis cuando el subtotal alcanza el umbral', async () => {
    const carrito = montar()
    carrito.registrar('user-1', [{ variantId: VARIANTE, quantity: 4 }])

    const resumen = await new GetOrderSummaryUseCase(carrito, CONFIG).execute('user-1')

    expect(resumen.isFreeShipping).toBe(true)
    expect(resumen.shipping).toBe(0)
  })

  it('un carrito vacío da un resumen a cero, que es lo que ve quien entra sin comprar', async () => {
    const carrito = montar()

    const resumen = await new GetOrderSummaryUseCase(carrito, CONFIG).execute('user-1')

    expect(resumen.total).toBe(0)
    expect(resumen.lines).toEqual([])
  })

  it('las líneas no comprables no suman al subtotal, porque no se van a cobrar', async () => {
    const carrito = montar()
    carrito.registrar('user-1', [
      { variantId: VARIANTE, quantity: 1 },
      { variantId: 'retirada', quantity: 5 },
    ])

    const resumen = await new GetOrderSummaryUseCase(carrito, CONFIG).execute('user-1')

    expect(resumen.subtotal).toBe(42000)
  })

  it('devuelve solo las líneas que el servidor reconoce', async () => {
    const carrito = montar()
    carrito.registrar('user-1', [
      { variantId: VARIANTE, quantity: 1 },
      { variantId: 'desconocida', quantity: 3 },
    ])

    const resumen = await new GetOrderSummaryUseCase(carrito, CONFIG).execute('user-1')

    expect(resumen.lines).toHaveLength(1)
  })

  it('el total es la suma de lo que se muestra en el desglose, sin cargos escondidos', async () => {
    const carrito = montar()
    carrito.registrar('user-1', [{ variantId: CARA, quantity: 3 }])

    const resumen = await new GetOrderSummaryUseCase(carrito, CONFIG).execute('user-1')

    expect(resumen.total).toBe(resumen.subtotal + resumen.tax + resumen.shipping)
  })
})
