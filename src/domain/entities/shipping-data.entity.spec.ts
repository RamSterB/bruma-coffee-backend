import { DomainError } from '../enums/assert-enum'
import { ShippingData, validateDocument, validatePhone } from './shipping-data.entity'

const valido = (over: Partial<Parameters<typeof ShippingData.create>[0]> = {}) => ({
  fullName: 'Persona Compradora',
  documentNumber: '1098765434',
  phone: '3001234567',
  address: 'Carrera 7 con Calle 72, casa 3',
  city: 'Bogotá',
  department: 'Cundinamarca',
  ...over,
})

describe('validateDocument', () => {
  it('acepta una cédula de diez dígitos', () => {
    expect(validateDocument('1098765434')).toBe(true)
  })

  it('acepta un NIT de nueve dígitos', () => {
    expect(validateDocument('900123456')).toBe(true)
  })

  it('acepta el número con guiones, que es como lo escribe la gente', () => {
    expect(validateDocument('1.098.765-434')).toBe(true)
  })

  it('rechaza letras, que no es un documento', () => {
    expect(validateDocument('abc123')).toBe(false)
  })

  it('rechaza un número demasiado corto', () => {
    expect(validateDocument('12345')).toBe(false)
  })

  it('rechaza un vacío, que es no enviar documento', () => {
    expect(validateDocument('')).toBe(false)
  })
})

describe('validatePhone', () => {
  it('acepta un celular de diez dígitos', () => {
    expect(validatePhone('3001234567')).toBe(true)
  })

  it('acepta un fijo de Bogotá, de siete dígitos', () => {
    expect(validatePhone('1234567')).toBe(true)
  })

  it('acepta el prefijo de país, que aparece en los formularios largos', () => {
    expect(validatePhone('+573001234567')).toBe(true)
  })

  it('rechaza un número de cinco dígitos, que no llama a nadie', () => {
    expect(validatePhone('12345')).toBe(false)
  })

  it('rechaza letras', () => {
    expect(validatePhone('300abc4567')).toBe(false)
  })
})

describe('ShippingData', () => {
  it('guarda los datos tal cual, con el documento sin formato para poder compararlo', () => {
    const datos = ShippingData.create(valido({ documentNumber: '1.098.765-434' }))

    expect(datos.documentNumber).toBe('1098765434')
  })

  it('normaliza el teléfono quitando espacios y guiones', () => {
    expect(ShippingData.create(valido({ phone: '300 123 4567' })).phone).toBe('3001234567')
  })

  it('rechaza un documento inválido', () => {
    expect(() => ShippingData.create(valido({ documentNumber: 'abc' }))).toThrow(DomainError)
  })

  it('rechaza un teléfono inválido', () => {
    expect(() => ShippingData.create(valido({ phone: '123' }))).toThrow(DomainError)
  })

  it('rechaza un nombre vacío, porque un envío sin destinatario no va a ningún lado', () => {
    expect(() => ShippingData.create(valido({ fullName: '  ' }))).toThrow(DomainError)
  })

  it('rechaza una dirección vacía', () => {
    expect(() => ShippingData.create(valido({ address: '' }))).toThrow(DomainError)
  })

  it('rechaza una ciudad vacía', () => {
    expect(() => ShippingData.create(valido({ city: '' }))).toThrow(DomainError)
  })

  it('rechaza un departamento vacío', () => {
    expect(() => ShippingData.create(valido({ department: '' }))).toThrow(DomainError)
  })

  it('no guarda ningún dato de pago, porque el cartão no se toca en el backend', () => {
    const datos = ShippingData.create(valido())

    expect(Object.keys(datos)).not.toContain('cardNumber')
    expect(Object.keys(datos)).not.toContain('cvv')
  })
})
