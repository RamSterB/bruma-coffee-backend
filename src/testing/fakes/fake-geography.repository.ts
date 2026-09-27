import type { GeographyRepositoryPort } from '../../domain/ports/geography.repository'

export interface DepartamentoDePrueba {
  name: string
  cities: string[]
}

export const buildDepartamentosDePrueba = (): DepartamentoDePrueba[] => [
  { name: 'Cundinamarca', cities: ['Bogotá', 'Soacha', 'Chía'] },
  { name: 'Antioquia', cities: ['Medellín', 'Envigado'] },
  { name: 'Bogotá D. C.', cities: ['Bogotá'] },
  { name: 'Nariño', cities: ['Pasto', 'Tumaco'] },
]

/**
 * Busca por nombre exacto y sin distinguir mayúsculas, como hace la base con
 * `citext` en los correos. La comparación de una lista de ciudades tiene que
 * comportarse como la de la base, o un "bogotá" en minúscula pasaría donde un
 * "Bogotá" no.
 */
const normalizar = (valor: string): string => valor.trim().toLowerCase()

export class FakeGeographyRepository implements GeographyRepositoryPort {
  private readonly departamentos: {
    id: string
    name: string
    cities: { id: string; name: string; departmentId: string }[]
  }[]

  constructor(catalogo: DepartamentoDePrueba[] = buildDepartamentosDePrueba()) {
    this.departamentos = catalogo.map((departamento, indice) => ({
      id: `dept-${indice + 1}`,
      name: departamento.name,
      cities: departamento.cities.map((city, indiceCity) => ({
        id: `city-${indice + 1}-${indiceCity + 1}`,
        name: city,
        departmentId: `dept-${indice + 1}`,
      })),
    }))
  }

  async listDepartments(): Promise<{ id: string; name: string }[]> {
    return this.departamentos.map((d) => ({ id: d.id, name: d.name }))
  }

  async findDepartmentByName(name: string): Promise<{ id: string; name: string } | null> {
    const buscado = normalizar(name)
    const encontrado = this.departamentos.find((d) => normalizar(d.name) === buscado)

    return encontrado === undefined ? null : { id: encontrado.id, name: encontrado.name }
  }

  async findCityInDepartment(
    city: string,
    departmentId: string,
  ): Promise<{ id: string; name: string; departmentId: string } | null> {
    const buscado = normalizar(city)
    const encontrado = this.departamentos
      .find((d) => d.id === departmentId)
      ?.cities.find((c) => normalizar(c.name) === buscado)

    return encontrado ?? null
  }
}
