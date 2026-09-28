import type { Coffee } from '../entities/coffee.entity'
import type { CoffeeVariant } from '../entities/coffee-variant.entity'
import type { CoffeeProcess } from '../enums/coffee-process.enum'
import type { CoffeeRegion } from '../enums/coffee-region.enum'
import type { RoastLevel } from '../enums/roast-level.enum'

export interface CoffeeFilters {
  region?: CoffeeRegion
  process?: CoffeeProcess
  roastLevel?: RoastLevel
  search?: string
  page: number
  limit: number
}

export interface PaginatedCoffees {
  items: Coffee[]
  total: number
  page: number
  limit: number
  totalPages: number
}

/**
 * Una variante junto al nombre de su café. El carrito solo guarda ids, así que
 * necesita el nombre para poder mostrar la línea: la variante sola no lo tiene.
 */
export interface VariantWithCoffee {
  variant: CoffeeVariant
  coffeeName: string
}

/**
 * El repositorio es responsable de excluir los cafés sin variantes con stock:
 * el filtro va en SQL para que `items` y `total` cuenten siempre lo mismo.
 */
export abstract class CoffeeRepositoryPort {
  abstract findAll(filters: CoffeeFilters): Promise<PaginatedCoffees>
  abstract findById(id: string): Promise<Coffee | null>

  /**
   * Qué café es dueño de una variante, o `null` si esa variante no existe o no se puede
   * comprar.
   *
   * Existe por un motivo concreto: **el resultado de un pago solo trae el id de la
   * variante**, porque el pedido guarda el nombre del café como copia del momento en que
   * se compró y no su id, para que el pedido sobreviva aunque el café desaparezca del
   * catálogo. El enlace de "ver el café" llega entonces con un id de variante, y sin esta
   * búsqueda llevaría a una página que no encuentra nada.
   */
  abstract findCoffeeIdByVariantId(variantId: string): Promise<string | null>

  /**
   * Resuelve varias variantes de una vez, que es como las pide el carrito.
   * Solo devuelve variantes activas de cafés activos: lo que no se puede
   * comprar no viene. Los ids desconocidos no son un error, sencillamente no
   * aparecen en el resultado.
   */
  abstract findVariantsByIds(ids: string[]): Promise<VariantWithCoffee[]>
}
