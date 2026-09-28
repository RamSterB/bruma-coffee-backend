import { DomainError } from '../enums/assert-enum'

export type OrderStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED'
export type PaymentStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'ERROR' | 'CANCELLED'

/**
 * Una línea de la orden con el precio congelado. Guarda nombre, peso y precio
 * porque si el café cambia de precio o se descontinúa, la orden tiene que seguir
 * diciendo lo que se cobró: por eso es una copia y no una referencia.
 */
export interface OrderItem {
  variantId: string
  coffeeName: string
  /** `null` cuando el catálogo no tenía el peso. Todos los cafés lo tienen, así que
   * en la práctica casi nunca es null y no merece un caso especial. */
  weightGrams: number | null
  unitPrice: number
  quantity: number
  lineTotal: number
}

export interface OrderAddress {
  fullName: string
  documentNumber: string
  phone: string
  address: string
  city: string
  department: string
}

export interface Order {
  id: string
  orderNumber: string
  userId: string
  /**
   * La fila de clientes a la que apunta la orden. No es el usuario: una compra de
   * invitado también tiene cliente, y por eso son dos columnas distintas.
   */
  customerId: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  customerName: string
  customerDocument: string
  customerPhone: string
  shippingAddress: string
  shippingCity: string
  shippingDepartment: string
  items: OrderItem[]
  subtotal: number
  taxAmount: number
  shippingAmount: number
  total: number
  createdAt: Date
  updatedAt: Date
}

/** Estado inicial obligatorio. Una orden nace pendiente y nada más. */
export const PEDIENTE: OrderStatus = 'PENDING'

export interface NewOrder {
  id: string
  orderNumber: string
  userId: string
  customerId: string
  customer: { name: string; documentNumber: string; phone: string }
  shipping: OrderAddress
  items: OrderItem[]
  subtotal: number
  taxAmount: number
  shippingAmount: number
  total: number
  createdAt: Date
}

/**
 * El total tiene que ser la suma de sus partes. Se comprueba aquí y no en la
 * pantalla porque un total que no cuadra es un cobro que no cuadra, y el momento
 * de enterarse no puede ser cuando alguien ya pagó.
 */
const lanzarSiElTotalNoQuadra = (
  subtotal: number,
  taxAmount: number,
  shippingAmount: number,
  total: number,
): void => {
  if (subtotal + taxAmount + shippingAmount !== total) {
    throw new DomainError(
      `El total (${total}) no es la suma del subtotal, el impuesto y el envio (${subtotal + taxAmount + shippingAmount})`,
    )
  }
}

const lanzarSiNoHayLineas = (items: OrderItem[]): void => {
  if (items.length === 0) {
    throw new DomainError('Una orden tiene que tener al menos una linea')
  }
}

export const Order = {
  create(datos: NewOrder): Order {
    lanzarSiNoHayLineas(datos.items)
    lanzarSiElTotalNoQuadra(datos.subtotal, datos.taxAmount, datos.shippingAmount, datos.total)

    return {
      id: datos.id,
      orderNumber: datos.orderNumber,
      userId: datos.userId,
      customerId: datos.customerId,
      status: PEDIENTE,
      paymentStatus: 'PENDING',
      customerName: datos.customer.name,
      customerDocument: datos.customer.documentNumber,
      customerPhone: datos.customer.phone,
      shippingAddress: datos.shipping.address,
      shippingCity: datos.shipping.city,
      shippingDepartment: datos.shipping.department,
      items: datos.items.map((itema) => ({ ...itema })),
      subtotal: datos.subtotal,
      taxAmount: datos.taxAmount,
      shippingAmount: datos.shippingAmount,
      total: datos.total,
      createdAt: datos.createdAt,
      updatedAt: datos.createdAt,
    }
  },
}
