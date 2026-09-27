/**
 * La configuración de precios vive en el entorno, no en el código, porque los
 * importes de una orden no se cambian con un despliegue: cambian con una decisión
 * del negocio, y tienen que poder cambiar sin tocar una línea.
 */
/**
 * Token de inyección. Vive aquí y no en el módulo porque el caso de uso lo
 * necesita para recibir la configuración, y si el token estuviera en el módulo
 * el caso de uso tendria que importarlo de ahi, que es un ciclo.
 */
export const PRICING_CONFIG = 'PRICING_CONFIG'

export interface PricingConfig {
  /** 0.19 es el IVA del 19 %: se guarda como fracción, no como porcentaje. */
  taxRate: number
  shippingFlatRate: number
  freeShippingThreshold: number
}

const numero = (valor: string | undefined, porDefecto: number): number => {
  const leido = Number(valor)

  return Number.isFinite(leido) && leido >= 0 ? leido : porDefecto
}

export const DEFAULT_TAX_RATE = 0.19
export const DEFAULT_SHIPPING_FLAT_RATE = 10000
export const DEFAULT_FREE_SHIPPING_THRESHOLD = 150000

export const pricingConfig = (): PricingConfig => ({
  taxRate: numero(process.env.TAX_RATE, DEFAULT_TAX_RATE),
  shippingFlatRate: numero(process.env.SHIPPING_FLAT_RATE, DEFAULT_SHIPPING_FLAT_RATE),
  freeShippingThreshold: numero(
    process.env.FREE_SHIPPING_THRESHOLD,
    DEFAULT_FREE_SHIPPING_THRESHOLD,
  ),
})
