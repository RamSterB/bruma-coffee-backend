import type { DataSource } from 'typeorm'
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { resetTestDatabase } from '../../testing/test-database'
import { UserRole } from '../../domain/enums/user-role.enum'
import { CoffeeProcess } from '../../domain/enums/coffee-process.enum'
import { CoffeeRegion } from '../../domain/enums/coffee-region.enum'
import { RoastLevel } from '../../domain/enums/roast-level.enum'
import { TypeOrmCartRepository } from './cart.typeorm.repository'
import { CartTypeOrmEntity } from './cart.typeorm.entity'
import { CartItemTypeOrmEntity } from './cart-item.typeorm.entity'
import { CustomerTypeOrmEntity } from './customer.typeorm.entity'
import { UserTypeOrmEntity } from './user.typeorm.entity'
import { CoffeeTypeOrmEntity } from './coffee.typeorm.entity'
import { CoffeeVariantTypeOrmEntity } from './coffee-variant.typeorm.entity'

const VARIANTE_A = 'aaaaaaaa-1111-4111-8111-111111111111'
const VARIANTE_B = 'bbbbbbbb-2222-4222-8222-222222222222'

/**
 * Estas pruebas van contra PostgreSQL de verdad porque lo que se comprueba es
 * justo lo que un doble no puede: que el precio del carrito sale del catálogo y
 * no de una copia, y que el recorte al stock ocurre con el número que hay en la
 * base, no con el que el caso de uso recuerda.
 */
describe('TypeOrmCartRepository', () => {
  let dataSource: DataSource
  let repository: TypeOrmCartRepository
  let userId: string
  let otroUserId: string

  const crearUsuario = async (email: string): Promise<string> => {
    const customers = dataSource.getRepository(CustomerTypeOrmEntity)
    const customer = await customers.save(
      customers.create({ email, fullName: 'Persona Registrada' }),
    )
    const users = dataSource.getRepository(UserTypeOrmEntity)

    const user = await users.save(
      users.create({
        email,
        passwordHash: 'hash-de-prueba',
        fullName: 'Persona Registrada',
        role: UserRole.CUSTOMER,
        customerId: customer.id,
      }),
    )

    return user.id
  }

  const crearVariante = async (
    id: string,
    values: { price: string; stock: number; isActive?: boolean },
  ): Promise<string> => {
    const coffees = dataSource.getRepository(CoffeeTypeOrmEntity)
    const coffee = await coffees.save(
      coffees.create({
        name: `Café ${id}`,
        description: 'Descripción',
        roastLevel: RoastLevel.MEDIUM,
        process: CoffeeProcess.WASHED,
        region: CoffeeRegion.HUILA,
        tastingNotes: ['cacao'],
        isActive: true,
      }),
    )
    const variants = dataSource.getRepository(CoffeeVariantTypeOrmEntity)

    const variant = await variants.save(
      variants.create({
        coffeeId: coffee.id,
        weightGrams: 250,
        price: values.price,
        stock: values.stock,
        isActive: values.isActive ?? true,
      }),
    )

    await dataSource.query('UPDATE coffee_variants SET id = $1 WHERE id = $2', [id, variant.id])

    return id
  }

  beforeAll(async () => {
    dataSource = await resetTestDatabase()
  })

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE cart_items, carts, refresh_tokens, users, customers, coffee_variants, coffees RESTART IDENTITY CASCADE',
    )
    repository = new TypeOrmCartRepository(dataSource.getRepository(CartTypeOrmEntity))
    userId = await crearUsuario('persona@ejemplo.com')
    otroUserId = await crearUsuario('otra@ejemplo.com')
  })

  it('devuelve un carrito vacío si el usuario nunca compró', async () => {
    const cart = await repository.findByUserId(userId)

    expect(cart.totalItems).toBe(0)
    expect(cart.subtotal).toBe(0)
  })

  it('trae el precio y el stock del catálogo, no una copia del momento de añadir', async () => {
    const variantId = await crearVariante(VARIANTE_A, { price: '42000', stock: 10 })
    await repository.setItem(userId, variantId, 2)

    await dataSource.query('UPDATE coffee_variants SET price = 50000 WHERE id = $1', [variantId])

    const cart = await repository.findByUserId(userId)

    expect(cart.lineaDe(variantId)?.price).toBe(50000)
    expect(cart.subtotal).toBe(100000)
  })

  it('el precio de la línea llega como número, no como texto de numeric', async () => {
    const variantId = await crearVariante(VARIANTE_A, { price: '42000.50', stock: 10 })
    await repository.setItem(userId, variantId, 1)

    const cart = await repository.findByUserId(userId)

    expect(typeof cart.lineaDe(variantId)?.price).toBe('number')
    expect(cart.lineaDe(variantId)?.price).toBe(42000.5)
  })

  it('trae el nombre del café, que el cajón necesita para pintar la línea', async () => {
    const variantId = await crearVariante(VARIANTE_A, { price: '42000', stock: 10 })
    await repository.setItem(userId, variantId, 1)

    const cart = await repository.findByUserId(userId)

    expect(cart.lineaDe(variantId)?.coffeeName).toContain('Café')
    expect(cart.lineaDe(variantId)?.weightGrams).toBe(250)
  })

  it('recorta la cantidad al stock que hay ahora mismo en la base', async () => {
    const variantId = await crearVariante(VARIANTE_A, { price: '42000', stock: 2 })
    await repository.setItem(userId, variantId, 9)

    const cart = await repository.findByUserId(userId)

    expect(cart.lineaDe(variantId)?.quantity).toBe(2)
  })

  it('una línea cuya variante ya no existe se devuelve como no comprable, no se pierde en silencio', async () => {
    const variantId = await crearVariante(VARIANTE_A, { price: '42000', stock: 10 })
    await repository.setItem(userId, variantId, 1)
    const cartEntity = await dataSource.getRepository(CartTypeOrmEntity).findOneOrFail({
      where: { userId },
    })
    const item = await dataSource.getRepository(CartItemTypeOrmEntity).findOneOrFail({
      where: { cartId: cartEntity.id },
    })
    // La FK es RESTRICT, así que la aplicación no puede dejar el carrito
    // colgando. Para provocar el estado "la fila ya no existe" (una migración o
    // una limpieza manual fuera de la app) se quita la constraint un momento,
    // que es la única vía por la que esa fila desaparece con líneas vivas.
    await dataSource.query('ALTER TABLE cart_items DROP CONSTRAINT "FK_cart_items_variant"')
    await dataSource.query('DELETE FROM coffee_variants WHERE id = $1', [item.variantId])

    const cart = await repository.findByUserId(userId)

    expect(cart.totalItems).toBe(1)
    expect(cart.lineaDe(item.variantId)?.isPurchasable).toBe(false)
    expect(cart.subtotal).toBe(0)

    // Se restablece la FK como está en la migración. Si no, los tests siguientes
    // correrían contra un esquema que en producción no existe.
    await dataSource.query('DELETE FROM cart_items WHERE variant_id = $1', [item.variantId])
    await dataSource.query(
      'ALTER TABLE cart_items ADD CONSTRAINT "FK_cart_items_variant" FOREIGN KEY ("variant_id") REFERENCES "coffee_variants"("id") ON DELETE RESTRICT',
    )
  })

  it('una variante desactivada se devuelve como no comprable aunque tenga stock', async () => {
    const variantId = await crearVariante(VARIANTE_A, {
      price: '42000',
      stock: 10,
      isActive: false,
    })
    await repository.setItem(userId, variantId, 2)

    const cart = await repository.findByUserId(userId)

    expect(cart.lineaDe(variantId)?.isPurchasable).toBe(false)
    expect(cart.subtotal).toBe(0)
  })

  it('crea el carrito la primera vez, sin pedirlo por separado', async () => {
    const variantId = await crearVariante(VARIANTE_A, { price: '42000', stock: 10 })

    await repository.setItem(userId, variantId, 1)

    expect(await dataSource.getRepository(CartTypeOrmEntity).count({ where: { userId } })).toBe(1)
  })

  it('guardar dos veces la misma variante actualiza en vez de duplicar', async () => {
    const variantId = await crearVariante(VARIANTE_A, { price: '42000', stock: 10 })
    await repository.setItem(userId, variantId, 2)
    await repository.setItem(userId, variantId, 5)

    const cart = await repository.findByUserId(userId)

    expect(cart.totalItems).toBe(1)
    expect(cart.lineaDe(variantId)?.quantity).toBe(5)
  })

  it('dos carritos de dos usuarios no se mezclan', async () => {
    const a = await crearVariante(VARIANTE_A, { price: '42000', stock: 10 })
    const b = await crearVariante(VARIANTE_B, { price: '30000', stock: 10 })
    await repository.setItem(userId, a, 2)
    await repository.setItem(otroUserId, b, 1)

    const mio = await repository.findByUserId(userId)
    const suyo = await repository.findByUserId(otroUserId)

    expect(mio.lineaDe(b)).toBeNull()
    expect(suyo.lineaDe(a)).toBeNull()
    expect(mio.subtotal).toBe(84000)
    expect(suyo.subtotal).toBe(30000)
  })

  it('quitar una línea deja el resto del carrito intacto', async () => {
    const a = await crearVariante(VARIANTE_A, { price: '42000', stock: 10 })
    const b = await crearVariante(VARIANTE_B, { price: '30000', stock: 10 })
    await repository.setItem(userId, a, 2)
    await repository.setItem(userId, b, 1)

    const cart = await repository.removeItem(userId, a)

    expect(cart.lineaDe(a)).toBeNull()
    expect(cart.lineaDe(b)?.quantity).toBe(1)
  })

  it('vaciar deja el carrito sin líneas pero conservando el carrito', async () => {
    const a = await crearVariante(VARIANTE_A, { price: '42000', stock: 10 })
    await repository.setItem(userId, a, 2)

    const cart = await repository.clear(userId)

    expect(cart.totalItems).toBe(0)
    expect(await dataSource.getRepository(CartTypeOrmEntity).count({ where: { userId } })).toBe(1)
  })

  it('reemplazar todo quita las líneas anteriores y pone las nuevas', async () => {
    const a = await crearVariante(VARIANTE_A, { price: '42000', stock: 10 })
    const b = await crearVariante(VARIANTE_B, { price: '30000', stock: 10 })
    await repository.setItem(userId, a, 2)

    const cart = await repository.replaceAll(userId, [{ variantId: b, quantity: 3 }])

    expect(cart.lineaDe(a)).toBeNull()
    expect(cart.lineaDe(b)?.quantity).toBe(3)
    expect(cart.subtotal).toBe(90000)
  })

  it('reemplazar todo con una lista vacía vacía el carrito', async () => {
    const a = await crearVariante(VARIANTE_A, { price: '42000', stock: 10 })
    await repository.setItem(userId, a, 2)

    const cart = await repository.replaceAll(userId, [])

    expect(cart.totalItems).toBe(0)
  })

  it('el precio entero de numeric llega sin decimales, sin redondear a entero', async () => {
    const a = await crearVariante(VARIANTE_A, { price: '42000', stock: 10 })
    await repository.setItem(userId, a, 1)

    const cart = await repository.findByUserId(userId)

    expect(cart.subtotal).toBe(42000)
  })
})
