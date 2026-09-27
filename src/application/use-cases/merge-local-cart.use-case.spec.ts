import { FakeCartRepository } from '../../testing/fakes/fake-cart.repository'
import { buildCoffeeVariant, FakeCoffeeRepository } from '../../testing/coffee.fixtures'
import { MergeLocalCartUseCase } from './merge-local-cart.use-case'

const VARIANTE = 'variant-1'
const OTRA = 'variant-2'

const montar = () => {
  const carrito = new FakeCartRepository()

  carrito.catalogo.set(VARIANTE, buildCoffeeVariant(VARIANTE, { price: 1000, stock: 10 }))
  carrito.catalogo.set(OTRA, buildCoffeeVariant(OTRA, { price: 2000, stock: 3 }))

  const cafe = new FakeCoffeeRepository()
  cafe.variantsByIds = [...carrito.catalogo.values()].map((variant) => ({
    variant,
    coffeeName: 'Nariño',
  }))

  return { carrito, caso: new MergeLocalCartUseCase(carrito, cafe) }
}

describe('MergeLocalCartUseCase', () => {
  it('sube el carrito local si el servidor está vacío, que es el caso de quien compra por primera vez', async () => {
    const { caso } = montar()

    const resultado = await caso.execute({
      userId: 'user-1',
      items: [
        { variantId: VARIANTE, quantity: 2 },
        { variantId: OTRA, quantity: 1 },
      ],
    })

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.value.totalItems).toBe(2)
      expect(resultado.value.lineaDe(VARIANTE)?.quantity).toBe(2)
      expect(resultado.value.subtotal).toBe(4000)
    }
  })

  it('gana el servidor si ya tenía carrito, y el local se descarta entero', async () => {
    const { carrito, caso } = montar()
    carrito.registrar('user-1', [{ variantId: VARIANTE, quantity: 7 }])

    const resultado = await caso.execute({
      userId: 'user-1',
      items: [{ variantId: OTRA, quantity: 3 }],
    })

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.value.lineaDe(VARIANTE)?.quantity).toBe(7)
      expect(resultado.value.lineaDe(OTRA)).toBeNull()
    }
  })

  it('un carrito local vacío no borra el del servidor', async () => {
    const { carrito, caso } = montar()
    carrito.registrar('user-1', [{ variantId: VARIANTE, quantity: 2 }])

    const resultado = await caso.execute({ userId: 'user-1', items: [] })

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.value.totalItems).toBe(1)
    }
  })

  it('recorta al stock lo que sube del navegador', async () => {
    const { caso } = montar()

    const resultado = await caso.execute({
      userId: 'user-1',
      items: [{ variantId: OTRA, quantity: 50 }],
    })

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.value.lineaDe(OTRA)?.quantity).toBe(3)
    }
  })

  it('descarta las líneas cuya variante ya no existe, en vez de guardarlas como basura', async () => {
    const { caso } = montar()

    const resultado = await caso.execute({
      userId: 'user-1',
      items: [
        { variantId: VARIANTE, quantity: 1 },
        { variantId: 'retirada-hace-meses', quantity: 4 },
      ],
    })

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.value.totalItems).toBe(1)
      expect(resultado.value.lineaDe(VARIANTE)).not.toBeNull()
    }
  })

  it('descarta las líneas sin stock o de variantes desactivadas', async () => {
    const { carrito, caso } = montar()
    carrito.catalogo.set('sin-stock', buildCoffeeVariant('sin-stock', { stock: 0 }))
    carrito.catalogo.set('desactivada', buildCoffeeVariant('desactivada', { isActive: false }))

    const resultado = await caso.execute({
      userId: 'user-1',
      items: [
        { variantId: 'sin-stock', quantity: 2 },
        { variantId: 'desactivada', quantity: 2 },
      ],
    })

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.value.totalItems).toBe(0)
      expect(resultado.value.subtotal).toBe(0)
    }
  })

  it('rechaza un carrito local con demasiadas líneas, para que una sola petición no grabe la tabla', async () => {
    const { caso } = montar()
    const items = Array.from({ length: 51 }, (_, indice) => ({
      variantId: `variant-${indice}`,
      quantity: 1,
    }))

    const resultado = await caso.execute({ userId: 'user-1', items })

    expect(resultado).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CART_TOO_MANY_ITEMS' }),
    })
  })

  it('rechaza una cantidad inválida antes de tocar nada', async () => {
    const { caso } = montar()

    await expect(
      caso.execute({ userId: 'user-1', items: [{ variantId: VARIANTE, quantity: 0 }] }),
    ).rejects.toThrow()
  })

  it('suma las líneas repetidas de la misma variante, que un carrito local puede traer duplicadas', async () => {
    const { caso } = montar()

    const resultado = await caso.execute({
      userId: 'user-1',
      items: [
        { variantId: VARIANTE, quantity: 1 },
        { variantId: VARIANTE, quantity: 2 },
      ],
    })

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.value.totalItems).toBe(1)
      expect(resultado.value.lineaDe(VARIANTE)?.quantity).toBe(3)
    }
  })
})
