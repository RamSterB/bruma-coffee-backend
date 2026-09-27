import { buildCoffeeVariant, FakeCoffeeRepository } from '../../testing/coffee.fixtures'
import { FakeCartRepository } from '../../testing/fakes/fake-cart.repository'
import { AddItemToCartUseCase } from './add-item-to-cart.use-case'
import { UpdateCartItemQuantityUseCase } from './update-cart-item-quantity.use-case'
import { RemoveCartItemUseCase } from './remove-cart-item.use-case'
import { ClearCartUseCase } from './clear-cart.use-case'

const VARIANTE = 'variant-1'
const SIN_STOCK = 'variant-2'
const RETIRADA = 'variant-3'

const montarCarrito = () => {
  const carrito = new FakeCartRepository()
  const cafe = new FakeCoffeeRepository()

  carrito.catalogo.set(VARIANTE, buildCoffeeVariant(VARIANTE, { price: 1000, stock: 10 }))
  carrito.catalogo.set(SIN_STOCK, buildCoffeeVariant(SIN_STOCK, { price: 2000, stock: 0 }))
  carrito.catalogo.set(
    RETIRADA,
    buildCoffeeVariant(RETIRADA, { price: 3000, stock: 50, isActive: false }),
  )

  cafe.variantsByIds = [...carrito.catalogo.values()].map((variant) => ({
    variant,
    coffeeName: 'Nariño',
  }))

  return { carrito, cafe }
}

describe('AddItemToCartUseCase', () => {
  it('añade una línea nueva al carrito', async () => {
    const { carrito, cafe } = montarCarrito()

    const resultado = await new AddItemToCartUseCase(carrito, cafe).execute({
      userId: 'user-1',
      variantId: VARIANTE,
      quantity: 2,
    })

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.value.totalItems).toBe(1)
      expect(resultado.value.lineaDe(VARIANTE)?.quantity).toBe(2)
    }
  })

  it('suma a la cantidad que ya había, que es lo que significa agregar', async () => {
    const { carrito, cafe } = montarCarrito()
    const caso = new AddItemToCartUseCase(carrito, cafe)
    await caso.execute({ userId: 'user-1', variantId: VARIANTE, quantity: 2 })

    const resultado = await caso.execute({ userId: 'user-1', variantId: VARIANTE, quantity: 3 })

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.value.lineaDe(VARIANTE)?.quantity).toBe(5)
    }
  })

  it('no deja pasar del stock, aunque se repita agregar', async () => {
    const { carrito, cafe } = montarCarrito()
    const caso = new AddItemToCartUseCase(carrito, cafe)
    await caso.execute({ userId: 'user-1', variantId: VARIANTE, quantity: 8 })

    const resultado = await caso.execute({ userId: 'user-1', variantId: VARIANTE, quantity: 8 })

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.value.lineaDe(VARIANTE)?.quantity).toBe(10)
    }
  })

  it('falla si la variante no existe', async () => {
    const { carrito, cafe } = montarCarrito()

    const resultado = await new AddItemToCartUseCase(carrito, cafe).execute({
      userId: 'user-1',
      variantId: 'no-existe',
      quantity: 1,
    })

    expect(resultado).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'VARIANT_NOT_FOUND', status: 404 }),
    })
  })

  it('falla si la variante no tiene stock, en vez de guardar una línea a cero', async () => {
    const { carrito, cafe } = montarCarrito()

    const resultado = await new AddItemToCartUseCase(carrito, cafe).execute({
      userId: 'user-1',
      variantId: SIN_STOCK,
      quantity: 1,
    })

    expect(resultado).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'VARIANT_NOT_PURCHASABLE', status: 409 }),
    })
  })

  it('falla si la variante está desactivada', async () => {
    const { carrito, cafe } = montarCarrito()

    const resultado = await new AddItemToCartUseCase(carrito, cafe).execute({
      userId: 'user-1',
      variantId: RETIRADA,
      quantity: 1,
    })

    expect(resultado).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'VARIANT_NOT_PURCHASABLE', status: 409 }),
    })
  })

  it('rechaza una cantidad cero, que es un dato que no existe', async () => {
    const { carrito, cafe } = montarCarrito()

    await expect(
      new AddItemToCartUseCase(carrito, cafe).execute({
        userId: 'user-1',
        variantId: VARIANTE,
        quantity: 0,
      }),
    ).rejects.toThrow()
  })

  it('no toca el carrito de otro usuario', async () => {
    const { carrito, cafe } = montarCarrito()
    const caso = new AddItemToCartUseCase(carrito, cafe)
    await caso.execute({ userId: 'user-1', variantId: VARIANTE, quantity: 1 })

    const resultado = await caso.execute({ userId: 'user-2', variantId: VARIANTE, quantity: 1 })

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.value.userId).toBe('user-2')
      expect(resultado.value.totalItems).toBe(1)
    }
  })
})

describe('UpdateCartItemQuantityUseCase', () => {
  it('deja la cantidad exacta que se pidió', async () => {
    const { carrito, cafe } = montarCarrito()
    carrito.registrar('user-1', [{ variantId: VARIANTE, quantity: 2 }])

    const resultado = await new UpdateCartItemQuantityUseCase(carrito, cafe).execute({
      userId: 'user-1',
      variantId: VARIANTE,
      quantity: 4,
    })

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.value.lineaDe(VARIANTE)?.quantity).toBe(4)
    }
  })

  it('recorta al stock si piden más de lo que hay', async () => {
    const { carrito, cafe } = montarCarrito()
    carrito.registrar('user-1', [{ variantId: VARIANTE, quantity: 2 }])

    const resultado = await new UpdateCartItemQuantityUseCase(carrito, cafe).execute({
      userId: 'user-1',
      variantId: VARIANTE,
      quantity: 99,
    })

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.value.lineaDe(VARIANTE)?.quantity).toBe(10)
    }
  })

  it('falla si la variante no está en el carrito, en vez de crearla sin avisar', async () => {
    const { carrito, cafe } = montarCarrito()

    const resultado = await new UpdateCartItemQuantityUseCase(carrito, cafe).execute({
      userId: 'user-1',
      variantId: VARIANTE,
      quantity: 3,
    })

    expect(resultado).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CART_ITEM_NOT_FOUND', status: 404 }),
    })
  })
})

describe('RemoveCartItemUseCase', () => {
  it('quita la línea del carrito y deja el resto', async () => {
    const { carrito } = montarCarrito()
    carrito.registrar('user-1', [
      { variantId: VARIANTE, quantity: 2 },
      { variantId: SIN_STOCK, quantity: 1 },
    ])

    const resultado = await new RemoveCartItemUseCase(carrito).execute({
      userId: 'user-1',
      variantId: VARIANTE,
    })

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.value.lineaDe(VARIANTE)).toBeNull()
      expect(resultado.value.totalItems).toBe(1)
    }
  })

  it('falla si la variante no está en el carrito', async () => {
    const { carrito } = montarCarrito()

    const resultado = await new RemoveCartItemUseCase(carrito).execute({
      userId: 'user-1',
      variantId: VARIANTE,
    })

    expect(resultado).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CART_ITEM_NOT_FOUND', status: 404 }),
    })
  })
})

describe('ClearCartUseCase', () => {
  it('vacía el carrito entero', async () => {
    const { carrito } = montarCarrito()
    carrito.registrar('user-1', [{ variantId: VARIANTE, quantity: 2 }])

    const resultado = await new ClearCartUseCase(carrito).execute('user-1')

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.value.totalItems).toBe(0)
      expect(resultado.value.subtotal).toBe(0)
    }
  })

  it('no falla si el carrito ya estaba vacío', async () => {
    const { carrito } = montarCarrito()

    const resultado = await new ClearCartUseCase(carrito).execute('user-1')

    expect(resultado.ok).toBe(true)
  })
})
