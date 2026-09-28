export type DeliveryStatus = 'PENDING' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED'

/** Envío, no dirección: la dirección es copia de la orden y no se guarda dos veces. */
export interface Delivery {
  id: string
  orderId: string
  status: DeliveryStatus
  carrier: string | null
  trackingCode: string | null
  shippedAt: Date | null
  deliveredAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Se crea junto con el cobro aprobado, no antes: un envío sin orden pagada es una
 * paquete que nadie pidió, y uno con orden sin pago es una promesa que el sistema
 * no puede cumplir.
 */
export const Delivery = {
  create(id: string, orderId: string, ahora: Date): Delivery {
    return {
      id,
      orderId,
      status: 'PENDING',
      carrier: null,
      trackingCode: null,
      shippedAt: null,
      deliveredAt: null,
      createdAt: ahora,
      updatedAt: ahora,
    }
  },
}
