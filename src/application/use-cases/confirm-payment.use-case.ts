import { Injectable } from '@nestjs/common'
import { CardGateway } from '../../domain/ports/card-gateway.port'
import { PaymentRepositoryPort } from '../../domain/ports/payment.repository'
import { SettlePaymentService } from './settle-payment.service'
import { err, ok, type Result } from '../../domain/result'
import type { AppError } from '../../domain/errors/app-error'
import type { GatewayPaymentStatus } from '../../domain/entities/payment.entity'
import type { ConfirmedPayment } from '../../domain/entities/gateway-event.entity'
import type { WebhookHeaders } from '../../domain/ports/card-gateway.port'

export interface ConfirmPaymentInput {
  providerReference: string
  status: GatewayPaymentStatus
  rawEvent: Record<string, unknown>
  receivedAt: Date
}

export interface ReconcilePendingInput {
  /** Solo se miran los pagos pendientes anteriores a este instante. */
  olderThan: Date
  limit: number
}

export interface ReconcileReport {
  /** Cuántos pagos se miraron. */
  revisados: number
  /** Cuántos cambiaron de estado y se aplicaron. */
  aplicados: number
  /** Cuántos ya estaban resueltos cuando se miraron. */
  yaResueltos: number
  /** Cuántos no se pudieron consultar. No es un error del pago, es de la red. */
  sinRespuesta: string[]
}

/**
 * Aplica el veredicto de la pasarela a la orden, **venga por donde venga**.
 *
 * Tres cosas se comprueban en este orden, y el orden importa: **primero la firma**,
 * porque si el aviso no viene de la pasarela no hay nada que aplicar y aceptarlo
 * sería permitir que cualquiera que conozca la URL marque pedidos como pagados.
 * Después se busca el pago, porque un aviso sin referencia conocida no se puede
 * atribuir a ninguna orden. Y solo entonces se toca el stock.
 */
@Injectable()
export class ConfirmPaymentUseCase {
  constructor(
    private readonly gateway: CardGateway,
    private readonly settle: SettlePaymentService,
  ) {}

  async execute(
    input: ConfirmPaymentInput,
    headers: WebhookHeaders = { eventChecksum: undefined },
  ): Promise<Result<ConfirmedPayment, AppError>> {
    const firma = this.gateway.verifySignature(headers, input.rawEvent)

    if (!firma.ok) {
      return err(firma.error)
    }

    return this.settle.apply({
      providerReference: input.providerReference,
      status: input.status,
      rawEvent: input.rawEvent,
      receivedAt: input.receivedAt,
    })
  }
}

const SEGUNDOS_POR_DEFECTO = 30

/**
 * Pregunta a la pasarela cómo van los pagos que siguen pendientes.
 *
 * Esta es la red de seguridad del pago, y no un adorno. El aviso es la vía rápida,
 * pero se pierde: la URL mal registrada en el panel, una caída, un despliegue en
 * curso. Sin esta consulta, cualquiera de esos casos deja el pago en `PENDING`
 * **para siempre y sin un solo error en ninguna parte**, que es la peor forma de
 * perder un cobro.
 *
 * No se salta nada: un pago que sigue `PENDING` en la pasarela se deja como está, y
 * uno que ya estaba resuelto en nuestra base se cuenta y no se toca. La idempotencia
 * sigue estando en la base de datos, así que correr esto cada cierto rato es seguro.
 */
@Injectable()
export class ReconcilePendingPaymentsUseCase {
  constructor(
    private readonly payments: PaymentRepositoryPort,
    private readonly gateway: CardGateway,
    private readonly settle: SettlePaymentService,
  ) {}

  async execute(
    entrada: Partial<ReconcilePendingInput> = {},
  ): Promise<Result<ReconcileReport, AppError>> {
    const olderThan = entrada.olderThan ?? new Date(Date.now() - SEGUNDOS_POR_DEFECTO * 1000)
    const limit = entrada.limit ?? 50
    const pendientes = await this.payments.findPendingOlderThan(olderThan, limit)

    const informe: ReconcileReport = {
      revisados: 0,
      aplicados: 0,
      yaResueltos: 0,
      sinRespuesta: [],
    }

    for (const pago of pendientes) {
      informe.revisados += 1

      const consulta = await this.gateway.getTransactionStatus(pago.providerReference)

      if (!consulta.ok) {
        // No se propaga: una caída de la pasarela al consultar no debe impedir que
        // se intente con los demás pagos de la lista.
        informe.sinRespuesta.push(pago.providerReference)

        continue
      }

      if (consulta.value.status === 'PENDING') {
        continue
      }

      const aplicado = await this.settle.aplicarA(pago, {
        providerReference: pago.providerReference,
        status: consulta.value.status,
        // Viene de una consulta, no de un aviso: no hay evento que archivar y no
        // hay firma que comprobar, porque la firma protege contra quien nos llama,
        // y aquí somos nosotros los que llamamos.
        rawEvent: null,
        receivedAt: new Date(),
      })

      if (!aplicado.ok) {
        if (aplicado.error.code === 'UNKNOWN_PAYMENT') {
          informe.yaResueltos += 1
        } else {
          informe.sinRespuesta.push(pago.providerReference)
        }

        continue
      }

      if (aplicado.value.applied) {
        informe.aplicados += 1
      } else {
        informe.yaResueltos += 1
      }
    }

    return ok(informe)
  }
}
