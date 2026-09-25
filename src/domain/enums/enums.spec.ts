import { assertEnum } from './assert-enum'
import { CoffeeProcess } from './coffee-process.enum'
import { CoffeeRegion } from './coffee-region.enum'
import { RoastLevel } from './roast-level.enum'

describe('enums cerrados del catálogo', () => {
  it('expone los diez valores de región acordados', () => {
    expect(Object.values(CoffeeRegion)).toEqual([
      'huila',
      'nariño',
      'valle-del-cauca',
      'caldas',
      'quindio',
      'tolima',
      'cauca',
      'cundinamarca',
      'santander',
      'arauca',
    ])
  })

  it('expone los tres niveles de tueste', () => {
    expect(Object.values(RoastLevel)).toEqual(['light', 'medium', 'dark'])
  })

  it('expone los cuatro procesos', () => {
    expect(Object.values(CoffeeProcess)).toEqual(['washed', 'natural', 'honey', 'anaerobic'])
  })

  it('acepta cada valor válido de región', () => {
    Object.values(CoffeeRegion).forEach((region) => {
      expect(assertEnum(CoffeeRegion, region)).toBe(region)
    })
  })

  it('rechaza una región que no está en la lista', () => {
    expect(() => assertEnum(CoffeeRegion, 'magdalena')).toThrow(/magdalena/)
  })

  it('rechaza una región escrita sin guiones', () => {
    expect(() => assertEnum(CoffeeRegion, 'valle del cauca')).toThrow(/no es válido/)
  })

  it('rechaza un proceso desconocido', () => {
    expect(() => assertEnum(CoffeeProcess, 'fermentado')).toThrow(/no es válido/)
  })

  it('rechaza un tueste desconocido', () => {
    expect(() => assertEnum(RoastLevel, 'medium-light')).toThrow(/no es válido/)
  })

  it('lista los valores permitidos en el mensaje de error', () => {
    expect(() => assertEnum(RoastLevel, 'x')).toThrow(/light, medium, dark/)
  })
})
