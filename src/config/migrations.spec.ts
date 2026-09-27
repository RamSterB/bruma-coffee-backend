import { existsSync, readdirSync } from 'node:fs'
import { MIGRATIONS_GLOB } from './migrations'

const directorioDe = (glob: string): string => glob.slice(0, glob.indexOf('/*'))

describe('MIGRATIONS_GLOB', () => {
  it('apunta a un directorio de migraciones que existe', () => {
    expect(existsSync(directorioDe(MIGRATIONS_GLOB))).toBe(true)
  })

  it('ese directorio tiene migraciones dentro', () => {
    const archivos = readdirSync(directorioDe(MIGRATIONS_GLOB)).filter((archivo) =>
      archivo.endsWith('.ts'),
    )

    expect(archivos.length).toBeGreaterThan(0)
  })

  it('cubre a la vez el .ts de desarrollo y el .js de producción', () => {
    expect(MIGRATIONS_GLOB).toContain('{js,ts}')
  })
})
