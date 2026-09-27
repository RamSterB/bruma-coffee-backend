import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { resetTestDatabase } from '../../testing/test-database'
import { UserRole } from '../../domain/enums/user-role.enum'
import { CoffeeProcess } from '../../domain/enums/coffee-process.enum'
import { CoffeeRegion } from '../../domain/enums/coffee-region.enum'
import { RoastLevel } from '../../domain/enums/roast-level.enum'
import { CustomerTypeOrmEntity } from './customer.typeorm.entity'
import { UserTypeOrmEntity } from './user.typeorm.entity'
import { CoffeeTypeOrmEntity } from './coffee.typeorm.entity'
import { CoffeeVariantTypeOrmEntity } from './coffee-variant.typeorm.entity'
import { CartTypeOrmEntity } from './cart.typeorm.entity'
import { CartItemTypeOrmEntity } from './cart-item.typeorm.entity'

/**
 * Las restricciones del carrito viven en la migración, no en el código, así que
 * solo se pueden comprobar ejecutándolas. Si una migración se regenera o se edita
 * a mano, esto es lo que se entera.
 */
describe('restricciones del esquema del carrito', () => {
  let dataSource: DataSource
  let userId: string
  let variantId: string

  const carts = () => dataSource.getRepository(CartTypeOrmEntity)
  const cartItems = () => dataSource.getRepository(CartItemTypeOrmEntity)

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

  const crearVariante = async (): Promise<string> => {
    const coffees = dataSource.getRepository(CoffeeTypeOrmEntity)
    const coffee = await coffees.save(
      coffees.create({
        name: 'Café del Carrito',
        description: 'Descripción del café',
        roastLevel: RoastLevel.MEDIUM,
        process: CoffeeProcess.WASHED,
        region: CoffeeRegion.HUILA,
        tastingNotes: ['cacao'],
        isActive: true,
      }),
    )
    const variants = dataSource.getRepository(CoffeeVariantTypeOrmEntity)

    const variant = await variants.save(
      variants.create({ coffeeId: coffee.id, weightGrams: 250, price: '42000', stock: 10 }),
    )

    return variant.id
  }

  const crearCarrito = async (userId_: string): Promise<CartTypeOrmEntity> => {
    const repo = carts()

    return repo.save(repo.create({ userId: userId_ }))
  }

  beforeAll(async () => {
    dataSource = await resetTestDatabase()
  })

  afterAll(async () => {
    await dataSource.destroy()
  })

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE cart_items, carts, refresh_tokens, users, customers, coffee_variants, coffees RESTART IDENTITY CASCADE',
    )
    userId = await crearUsuario('persona@ejemplo.com')
    variantId = await crearVariante()
  })

  it('un usuario no puede tener dos carritos', async () => {
    await crearCarrito(userId)

    await expect(crearCarrito(userId)).rejects.toThrow()
  })

  it('dos usuarios distintos sí pueden tener su carrito', async () => {
    const otro = await crearUsuario('otra@ejemplo.com')
    await crearCarrito(userId)

    await expect(crearCarrito(otro)).resolves.toBeDefined()
  })

  it('una línea con cantidad cero o negativa no entra', async () => {
    const cart = await crearCarrito(userId)

    await expect(
      cartItems().save(cartItems().create({ cartId: cart.id, variantId, quantity: 0 })),
    ).rejects.toThrow()
    await expect(
      cartItems().save(cartItems().create({ cartId: cart.id, variantId, quantity: -1 })),
    ).rejects.toThrow()
  })

  it('no se puede repetir la misma variante en un carrito', async () => {
    const cart = await crearCarrito(userId)
    await cartItems().save(cartItems().create({ cartId: cart.id, variantId, quantity: 1 }))

    await expect(
      cartItems().save(cartItems().create({ cartId: cart.id, variantId, quantity: 2 })),
    ).rejects.toThrow()
  })

  it('borrar el carrito borra sus líneas, en vez de dejarlas huérfanas', async () => {
    const cart = await crearCarrito(userId)
    await cartItems().save(cartItems().create({ cartId: cart.id, variantId, quantity: 1 }))

    await carts().delete(cart.id)

    expect(await cartItems().count()).toBe(0)
  })

  it('borrar el usuario borra su carrito, que no puede sobrevivir a quien lo tenía', async () => {
    const cart = await crearCarrito(userId)
    await cartItems().save(cartItems().create({ cartId: cart.id, variantId, quantity: 1 }))

    await dataSource.getRepository(UserTypeOrmEntity).delete(userId)

    expect(await carts().count()).toBe(0)
  })
})
