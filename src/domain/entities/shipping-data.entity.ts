import { DomainError } from '../enums/assert-enum'

/**
 * Los datos de entrega de un pedido. No se guardan aquí: van en la orden, como
 * copia del momento de la compra, y la orden es la que los conserva aunque el
 * cliente los cambie después.
 *
 * **No hay ningún dato de pago en esta entidad**, ni número de tarjeta ni clave:
 * la tarjeta se tokeniza en el cliente y la pasarela guarda el resto. Un número
 * de tarjeta que pasa por aquí es un número de tarjeta que acaba en una tabla
 * nuestra.
 */
export interface ShippingDataInput {
  fullName: string
  documentNumber: string
  phone: string
  address: string
  city: string
  department: string
}

/**
 * Se queda solo con los dígitos, para comparar y guardar sin formatos, pero
 * **rechaza** lo que no sea un número con formato. Si se limitaran a quitar todo
 * lo que no es dígito, "300abc4567" se quedaría en "3004567" y pasaría por
 * teléfono fijo: un número con letras dentro terminaría aceptándose.
 */
const soloDigitos = (valor: string): string | null => {
  const limpio = valor.replace(/[\s.()-]/g, '')

  if (limpio === '' || !/^\+?\d+$/.test(limpio)) {
    return null
  }

  return limpio.replace(/^\+/, '')
}

/**
 * Cédula (6 a 10 dígitos) o NIT (9). Se aceptan puntos y guiones porque así es
 * como la gente escribe el documento, y comparar "1.098.765-434" con
 * "1098765434" como si fueran distintos sería un fallo de la persona, no del dato.
 */
export const validateDocument = (valor: string): boolean => {
  const digitos = soloDigitos(valor)

  return digitos !== null && digitos.length >= 6 && digitos.length <= 10
}

/**
 * Celular de **exactamente** diez dígitos, y con prefijo de país opcional.
 *
 * No se aceptan fijos: un pedido se entrega a un teléfono que la persona lleva
 * encima, y un fijo de siete dígitos o está mal escrito o es el número de una
 * oficina que ya no atiende. Admitirlos hacía que el repartidor tuviera que
 * llamar a un sitio donde no va nadie.
 */
export const validatePhone = (valor: string): boolean => {
  const digitos = soloDigitos(valor)?.replace(/^57/, '')

  return digitos !== undefined && digitos.length === PHONE_DIGITS
}

const obligatorio = (valor: string, nombre: string): string => {
  const limpio = valor.trim()

  if (limpio === '') {
    throw new DomainError(`${nombre} es obligatorio`)
  }

  return limpio
}

/** Un celular colombiano son diez dígitos. Ni uno más ni uno menos. */
export const PHONE_DIGITS = 10

export class ShippingData {
  private constructor(
    public readonly fullName: string,
    public readonly documentNumber: string,
    public readonly phone: string,
    public readonly address: string,
    public readonly city: string,
    public readonly department: string,
  ) {}

  static create(input: ShippingDataInput): ShippingData {
    const fullName = obligatorio(input.fullName, 'El nombre del destinatario')
    const address = obligatorio(input.address, 'La dirección')
    const city = obligatorio(input.city, 'La ciudad')
    const department = obligatorio(input.department, 'El departamento')
    const documentNumber = soloDigitos(input.documentNumber) ?? ''
    const phone = (soloDigitos(input.phone) ?? '').replace(/^57/, '')

    if (!validateDocument(input.documentNumber)) {
      throw new DomainError('El número de documento no tiene un formato válido')
    }

    if (!validatePhone(input.phone)) {
      throw new DomainError('El teléfono debe ser un celular de 10 dígitos')
    }

    return new ShippingData(fullName, documentNumber, phone, address, city, department)
  }
}
