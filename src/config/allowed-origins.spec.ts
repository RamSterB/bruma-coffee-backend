import { readAllowedOrigins } from './allowed-origins'

describe('readAllowedOrigins', () => {
  it('divide por comas y recorta espacios', () => {
    const origins = readAllowedOrigins('https://a.co , https://b.co')

    expect(origins).toEqual(['https://a.co', 'https://b.co'])
  })

  it('ignora entradas vacías', () => {
    const origins = readAllowedOrigins('https://a.co,,  ,https://b.co')

    expect(origins).toEqual(['https://a.co', 'https://b.co'])
  })

  it('devuelve el origen de desarrollo por defecto si no hay variable', () => {
    expect(readAllowedOrigins(undefined)).toEqual(['http://localhost:5173'])
  })

  it('rechaza el comodín porque rompería credentials:true', () => {
    expect(() => readAllowedOrigins('*')).toThrow(/comodín/i)
  })

  it('rechaza el comodín mezclado con orígenes válidos', () => {
    expect(() => readAllowedOrigins('https://a.co,*')).toThrow(/comodín/i)
  })

  it('rechaza un origen sin esquema', () => {
    expect(() => readAllowedOrigins('tienda.example.co')).toThrow(/http/i)
  })

  it('rechaza un origen con esquema distinto de http o https', () => {
    expect(() => readAllowedOrigins('ftp://tienda.example.co')).toThrow(/http/i)
  })

  it('acepta http solo para localhost', () => {
    expect(readAllowedOrigins('http://localhost:4173')).toEqual(['http://localhost:4173'])
  })
})
