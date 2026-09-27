/**
 * La lista de departamentos y ciudades. Vive en un port y no en un archivo de
 * configuración para que se pueda consultar en la base: validar "esta ciudad es
 * de este departamento" con un `includes` en memoria significaría mantener una
 * copia del país en el código, que se queda vieja sin que nadie se entere.
 */
export abstract class GeographyRepositoryPort {
  /** Necesario para distinguir "ciudad que no existe" de "ciudad de otro departamento". */
  abstract listDepartments(): Promise<{ id: string; name: string }[]>
  abstract findDepartmentById(id: string): Promise<{ id: string; name: string } | null>
  abstract listCitiesByDepartment(departmentId: string): Promise<{ id: string; name: string }[]>
  abstract findDepartmentByName(name: string): Promise<{ id: string; name: string } | null>
  abstract findCityInDepartment(
    city: string,
    departmentId: string,
  ): Promise<{ id: string; name: string; departmentId: string } | null>
}
