import { Injectable } from '@nestjs/common'
import { Cart } from '../../domain/entities/cart.entity'
import { ok, type Result } from '../../domain/result'
import { CartRepositoryPort } from '../../domain/ports/cart.repository'

@Injectable()
export class ClearCartUseCase {
  constructor(private readonly cartRepository: CartRepositoryPort) {}

  /** Vaciar un carrito ya vacío no es un error: la operación es idempotente. */
  async execute(userId: string): Promise<Result<Cart, never>> {
    return ok(await this.cartRepository.clear(userId))
  }
}
