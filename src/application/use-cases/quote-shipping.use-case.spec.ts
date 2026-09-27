import { FakeCartRepository } from '../../testing/fakes/fake-cart.repository'
import { buildCoffeeVariant } from '../../testing/coffee.fixtures'
import {
  FakeGeographyRepository,
  buildDepartamentosDePrueba,
} from '../../testing/fakes/fake-geography.repository'
import { GetOrderSummaryUseCase } from './get-order-summary.use-case'
import { QuoteShippingUseCase, type ShippingQuote } from './quote-shipping.use-case'
import type { AppError } from '../../domain/errors/app-error'
import type { Result } from '../../domain/result'

const CONFIG = { taxRate: 0.19, shippingFlatRate: 10000, freeShippingThreshold: 150000 }

const montar = () => {
  const carrito = new FakeCartRepository()
  const geografia = new FakeGeographyRepository(buildDepartamentosDePrueba())

  carrito.catalogo.set('v1', buildCoffeeVariant('v1', { price: 42000, stock: 10 }))

  return { carrito, geografia }
}

const desdoblar = (resultado: Result<ShippingQuote, AppError>): ShippingQuote => {
  if (!resultado.ok) {
    throw resultado.error
  }

  return resultado.value
}

const caso = (carrito: FakeCartRepository, geografia: FakeGeographyRepository) =>
  new QuoteShippingUseCase(new GetOrderSummaryUseCase(carrito, CONFIG), geografia)

const datos = (
  over: Partial<Parameters<typeof QuoteShippingUseCase.prototype.execute>[0]> = {},
) => ({
  userId: 'user-1',
  fullName: 'Persona Compradora',
  documentNumber: '1098765434',
  phone: '3001234567',
  address: 'Carrera 7 con Calle 72',
  city: 'Bogotá',
  department: 'Cundinamarca',
  ...over,
})

describe('QuoteShippingUseCase', () => {
  it('confirma el total de la orden con datos de envío válidos', async () => {
    const { carrito, geografia } = montar()
    carrito.registrar('user-1', [{ variantId: 'v1', quantity: 2 }])

    const resultado = desdoblar(await caso(carrito, geografia).execute(datos()))

    expect(resultado.total).toBe(109960)
    expect(resultado.shippingData.department).toBe('Cundinamarca')
  })

  it('devuelve el desglose entero, no solo el total', async () => {
    const { carrito, geografia } = montar()
    carrito.registrar('user-1', [{ variantId: 'v1', quantity: 2 }])

    const resultado = desdoblar(await caso(carrito, geografia).execute(datos()))

    expect(resultado).toMatchObject({ subtotal: 84000, tax: 15960, shipping: 10000 })
  })

  it('acepta la ciudad con tildes, como la escribe la gente', async () => {
    const { carrito, geografia } = montar()
    carrito.registrar('user-1', [{ variantId: 'v1', quantity: 1 }])

    const resultado = desdoblar(
      await caso(carrito, geografia).execute(datos({ city: 'Bogotá', department: 'Cundinamarca' })),
    )

    expect(resultado.shippingData.city).toBe('Bogotá')
  })

  it('rechaza una ciudad que no existe', async () => {
    const { carrito, geografia } = montar()

    const resultado = await caso(carrito, geografia).execute(datos({ city: 'Ciudad Inventada' }))

    expect(resultado).toMatchObject({
      ok: false,
      error: { code: 'CITY_NOT_FOUND', status: 400 },
    })
  })

  it('rechaza que la ciudad no sea del departamento, que es la combinación que hay que mirar', async () => {
    const { carrito, geografia } = montar()

    const resultado = await caso(carrito, geografia).execute(
      datos({ city: 'Medellín', department: 'Cundinamarca' }),
    )

    expect(resultado).toMatchObject({
      ok: false,
      error: { code: 'CITY_NOT_IN_DEPARTMENT', status: 400 },
    })
  })

  it('rechaza un departamento que no existe', async () => {
    const { carrito, geografia } = montar()

    const resultado = await caso(carrito, geografia).execute(
      datos({ department: 'Departamento Inventado' }),
    )

    expect(resultado).toMatchObject({
      ok: false,
      error: { code: 'DEPARTMENT_NOT_FOUND', status: 400 },
    })
  })

  it('rechaza un teléfono inválido antes de devolver un total', async () => {
    const { carrito, geografia } = montar()
    carrito.registrar('user-1', [{ variantId: 'v1', quantity: 1 }])

    const resultado = await caso(carrito, geografia).execute(datos({ phone: '123' }))

    expect(resultado.ok).toBe(false)
  })

  it('no guarda nada: los datos van en la orden, y la orden se crea al confirmar', async () => {
    const { carrito, geografia } = montar()
    carrito.registrar('user-1', [{ variantId: 'v1', quantity: 1 }])

    const resultado = desdoblar(await caso(carrito, geografia).execute(datos()))

    expect(resultado).toMatchObject({ persisted: false })
  })
})
