import { DomainError } from '../enums/assert-enum'

export interface PricingConfig {
  /** 0.19 es el IVA del 19 %: se guarda como fracción, no como porcentaje. */
  taxRate: number
  shippingFlatRate: number
  freeShippingThreshold: number
}

export interface SummableLine {
  unitPrice: number
  quantity: number
}

export interface PricedLine extends SummableLine {
  variantId: string
  coffeeName: string
  subtotal: number
}

export interface OrderSummaryTotals {
  subtotal: number
  tax: number
  shipping: number
  total: number
  isFreeShipping: boolean
}

/**
 * El envío se calcula sobre el subtotal, y no sobre el total con IVA: el umbral
 * es un monto de compra de productos, no lo que va a salir por caja. Y un carrito
 * vacío no paga envío, porque no hay nada que enviar ni que embalar.
 */
export const calculateShipping = (subtotal: number, config: PricingConfig): number => {
  if (subtotal <= 0) {
    return 0
  }

  return subtotal >= config.freeShippingThreshold ? 0 : config.shippingFlatRate
}

const assertLinea = (linea: SummableLine): void => {
  if (linea.unitPrice < 0) {
    throw new DomainError(`El precio no puede ser negativo, se recibió ${linea.unitPrice}`)
  }

  if (!Number.isInteger(linea.unitPrice)) {
    throw new DomainError(`El precio debe ser un entero de pesos, se recibió ${linea.unitPrice}`)
  }
}

const esUsable = (linea: SummableLine): boolean =>
  Number.isInteger(linea.quantity) && linea.quantity > 0

/**
 * El resumen de la orden. Todos los importes se calculan aquí, en el backend, y
 * el frontend solo los muestra: si los calculara el navegador, cada visitante
 * vería un total y el cobro sería otro.
 *
 * El desglose es el que dice el requisito, en este orden y sin cargos inventados:
 * subtotal, envío, IVA y total. El IVA va **sobre el subtotal de los productos**,
 * y los precios del catálogo no lo incluyen, así que se suma encima. El envío no
 * entra en la base del IVA.
 */
export const summarizeOrder = (
  lineas: SummableLine[],
  config: PricingConfig,
): OrderSummaryTotals => {
  lineas.filter(esUsable).forEach(assertLinea)

  const subtotal = lineas
    .filter(esUsable)
    .reduce((total, linea) => total + linea.unitPrice * linea.quantity, 0)
  const shipping = calculateShipping(subtotal, config)
  const tax = Math.round(subtotal * config.taxRate)

  return {
    subtotal,
    tax,
    shipping,
    total: subtotal + tax + shipping,
    isFreeShipping: subtotal >= config.freeShippingThreshold && subtotal > 0,
  }
}

export class OrderSummary {
  private constructor(
    public readonly lines: PricedLine[],
    public readonly subtotal: number,
    public readonly tax: number,
    public readonly shipping: number,
    public readonly total: number,
    public readonly isFreeShipping: boolean,
  ) {}

  static create(
    lineas: (SummableLine & { variantId: string; coffeeName: string })[],
    config: PricingConfig,
  ): OrderSummary {
    const utilizables = lineas.filter(esUsable)

    utilizables.forEach(assertLinea)

    const totales = summarizeOrder(lineas, config)

    return new OrderSummary(
      utilizables.map((linea) => ({
        variantId: linea.variantId,
        coffeeName: linea.coffeeName,
        unitPrice: linea.unitPrice,
        quantity: linea.quantity,
        subtotal: linea.unitPrice * linea.quantity,
      })),
      totales.subtotal,
      totales.tax,
      totales.shipping,
      totales.total,
      totales.isFreeShipping,
    )
  }
}
