import { Injectable } from '@nestjs/common'
import { DomainError } from '../../domain/enums/assert-enum'
import type { OrderSummary } from '../../domain/entities/order-summary.entity'
import { ShippingData, type ShippingDataInput } from '../../domain/entities/shipping-data.entity'
import type { AppError } from '../../domain/errors/app-error'
import {
  cityNotFoundError,
  cityNotInDepartmentError,
  departmentNotFoundError,
  invalidShippingDataError,
} from '../../domain/errors/geography.errors'
import { err, ok, type Result } from '../../domain/result'
import { GeographyRepositoryPort } from '../../domain/ports/geography.repository'
import { GetOrderSummaryUseCase } from './get-order-summary.use-case'

export interface QuoteShippingInput extends ShippingDataInput {
  userId: string
}

export interface ShippingQuote {
  lines: OrderSummary['lines']
  subtotal: number
  tax: number
  shipping: number
  total: number
  isFreeShipping: boolean
  shippingData: ShippingData
  /**
   * Aquí no se guarda nada. Los datos de envío son copia de la orden, y la orden
   * se crea al confirmar la compra: confirmarla antes dejaría pedidos a medias de
   * gente que entró a mirar y se fue.
   */
  persisted: false
}

/**
 * Confirma el total de una orden con los datos de entrega ya validados.
 *
 * La validación de ciudad y departamento es la parte que no se puede hacer en el
 * navegador: la lista de ciudades del país no cabe en un formulario, y una
 * validación del cliente se puede saltar desde la consola.
 */
@Injectable()
export class QuoteShippingUseCase {
  constructor(
    private readonly getOrderSummary: GetOrderSummaryUseCase,
    private readonly geography: GeographyRepositoryPort,
  ) {}

  async execute(input: QuoteShippingInput): Promise<Result<ShippingQuote, AppError>> {
    // Se validan los datos antes de tocar nada: un teléfono malo tiene que
    // devolver un 400 sin haber consultado la ciudad.
    const validados = this.construirShippingData(input)

    if (!validados.ok) {
      return err(validados.error)
    }

    const department = await this.geography.findDepartmentByName(input.department)

    if (department === null) {
      return err(departmentNotFoundError())
    }

    const city = await this.geography.findCityInDepartment(input.city, department.id)

    if (city === null) {
      // Se mira primero si la ciudad existe en otro departamento. La diferencia
      // importa en el formulario: una cosa es corregir el nombre de la ciudad y
      // otra es que el departamento elegido sea el equivocado.
      const enOtro = await this.buscarEnOtroDepartamento(input.city)

      return enOtro ? err(cityNotInDepartmentError()) : err(cityNotFoundError())
    }

    // El nombre que se guarda es el del catálogo y no el que escribió la
    // persona. "Bogota" y "Bogotá" son la misma ciudad, y si cada compra guarda
    // la grafía que le llegó, la orden tiene un dato que no existe en ninguna
    // otra parte del sistema.
    const guardado = ShippingData.create({ ...input, city: city.name, department: department.name })

    const resumen = await this.getOrderSummary.execute(input.userId)

    return ok({
      lines: resumen.lines,
      subtotal: resumen.subtotal,
      tax: resumen.tax,
      shipping: resumen.shipping,
      total: resumen.total,
      isFreeShipping: resumen.isFreeShipping,
      shippingData: guardado,
      persisted: false,
    })
  }

  /**
   * El dominio lanza su invariante cuando un dato no tiene forma de dato, y aquí
   * eso se traduce a un 400. Sin esta traducción, escribir mal el teléfono
   * devolvería un 500, que dice "falló el servidor" cuando lo que falló fue el
   * formulario.
   */
  private construirShippingData(input: QuoteShippingInput): Result<ShippingData, AppError> {
    try {
      return ok(ShippingData.create(input))
    } catch (error) {
      if (error instanceof DomainError) {
        return err(invalidShippingDataError(error.message))
      }

      throw error
    }
  }

  private async buscarEnOtroDepartamento(city: string): Promise<boolean> {
    const departamentos = await this.geography.listDepartments()
    const buscado = city.trim().toLowerCase()

    for (const departamento of departamentos) {
      const encontrada = await this.geography.findCityInDepartment(city, departamento.id)

      if (encontrada !== null && encontrada.name.trim().toLowerCase() === buscado) {
        return true
      }
    }

    return false
  }
}
