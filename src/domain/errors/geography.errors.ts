import { AppError } from './app-error'

export const departmentNotFoundError = (): AppError =>
  new AppError('El departamento no existe o no tiene envíos', 'DEPARTMENT_NOT_FOUND', 400)

export const cityNotFoundError = (): AppError =>
  new AppError('La ciudad no existe', 'CITY_NOT_FOUND', 400)

/**
 * Ciudad y departamento que existen por separado pero no juntos: Medellín es una
 * ciudad real, solo que no es de Cundinamarca. Es un error distinto del de "no
 * existe", y conviene que lo sea para poder corregir solo el campo equivocado.
 */
export const cityNotInDepartmentError = (): AppError =>
  new AppError('La ciudad no pertenece a ese departamento', 'CITY_NOT_IN_DEPARTMENT', 400)

/**
 * Los datos de envío llegan de un formulario, así que un teléfono malo o una
 * dirección vacía son un 400 y no un error de servidor. El dominio lanza su
 * invariante y el caso de uso la traduce a un error de negocio: quien escribe mal
 * el teléfono no es un bug, es alguien que escribe mal el teléfono.
 */
export const invalidShippingDataError = (detalle: string): AppError =>
  new AppError(detalle, 'INVALID_SHIPPING_DATA', 400)
