/**
 * Texto canónico con el que se comparan las búsquedas del catálogo.
 *
 * Quien busca "narino" tiene que encontrar "Nariño" y "citrica" tiene que
 * encontrar "cítrica": si el buscador depende de que el usuario acierte la
 * tilde, no está fulfilling su función.
 *
 * La normalización se hace aquí, en la aplicación, y no con `unaccent()` de
 * PostgreSQL. Se comprobó que `unaccent()` devuelve resultados distintos
 * según el historial de la sesión: en la misma conexión, la misma consulta
 * devolvió falso 13 veces seguidas y verdadero las 9 siguientes. Una búsqueda
 * construida sobre ella puede perder resultados de forma impredecible, así que
 * no es una base sobre la que apoyar el buscador. Aquí la transformación es
 * pura y siempre da lo mismo.
 */

/**
 * Letras que Unicode no descompone en letra base más acento, por lo que NFD no
 * las separa y hay que sustituirlas a mano.
 */
const NON_DECOMPOSING: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  Æ: 'AE',
  ø: 'o',
  Ø: 'O',
  œ: 'oe',
  Œ: 'OE',
  đ: 'd',
  Đ: 'D',
  ð: 'd',
  Ð: 'D',
  ł: 'l',
  Ł: 'L',
  þ: 'th',
  Þ: 'TH',
}

const COMBINING_MARKS = /\p{Diacritic}/gu
const NON_DECOMPOSING_PATTERN = new RegExp(`[${Object.keys(NON_DECOMPOSING).join('')}]`, 'g')

/**
 * Reduce un texto a la forma con la que se indexa y se compara: sin acentos, en
 * minúsculas y con los espacios repetidos eliminados. La puntuación se
 * conserva: no estorba, porque la búsqueda compara por subcadena, así que
 * "citrica" encuentra "cítrica." sin necesidad de borrarla.
 */
export const normalizeForSearch = (value: string | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(NON_DECOMPOSING_PATTERN, (letter) => NON_DECOMPOSING[letter])
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

export interface SearchableText {
  name: string
  description?: string
  tastingNotes?: readonly string[]
}

/**
 * Concatena los campos buscables de un café en una sola cadena normalizada.
 * Un solo campo en vez de tres permite que la consulta sea un `ILIKE` sobre
 * una columna y no un `OR` de tres.
 */
export const buildSearchIndex = (text: SearchableText): string =>
  [text.name, text.description, ...(text.tastingNotes ?? [])]
    .map((field) => normalizeForSearch(field))
    .filter((field) => field.length > 0)
    .join(' ')
