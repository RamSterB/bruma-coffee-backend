import { describe, expect, it } from '@jest/globals'
import { buildSearchIndex, normalizeForSearch } from './search-text'

describe('normalizeForSearch', () => {
  it.each([
    ['cítricas', 'citricas'],
    ['Nariño', 'narino'],
    ['ÁÉÍÓÚ', 'aeiou'],
    ['Ü', 'u'],
    ['Catuaí', 'catuai'],
  ])('quita acentos y mayúsculas de %j', (entrada, esperado) => {
    expect(normalizeForSearch(entrada)).toBe(esperado)
  })

  it('resuelve la eñe, que no es una vocal acentuada', () => {
    expect(normalizeForSearch('añejo')).toBe('anejo')
  })

  it('sustituye las letras que Unicode no descompone', () => {
    expect(normalizeForSearch('Straße Ærø')).toBe('strasse aero')
  })

  it('no toca letras que ya son ascii', () => {
    expect(normalizeForSearch('Geisha 250g V60')).toBe('geisha 250g v60')
  })

  it('conserva la puntuación para no perder términos', () => {
    expect(normalizeForSearch('Cítrica, Panela.')).toBe('citrica, panela.')
  })

  it('colapsa espacios sobrantes', () => {
    expect(normalizeForSearch('  lado   norte  ')).toBe('lado norte')
  })

  it('deja intactos los símbolos que el usuario puede buscar', () => {
    expect(normalizeForSearch('50% / 1.850 msnm')).toBe('50% / 1.850 msnm')
  })
})

describe('buildSearchIndex', () => {
  it('concatena nombre, descripción y notas en una sola cadena', () => {
    const index = buildSearchIndex({
      name: 'Sidra de Nariño',
      description: 'Fermenta de forma anaeróbica.',
      tastingNotes: ['Manzana verde', 'Frutos rojos'],
    })

    expect(index).toBe('sidra de narino fermenta de forma anaerobica. manzana verde frutos rojos')
  })

  it('tolera que falte algún campo', () => {
    const index = buildSearchIndex({ name: 'Café' })

    expect(index).toBe('cafe')
  })
})
