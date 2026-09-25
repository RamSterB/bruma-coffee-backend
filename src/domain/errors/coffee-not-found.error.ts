import { DomainError } from '../enums/assert-enum'

export class CoffeeNotFoundError extends DomainError {
  constructor(id: string) {
    super(`No existe un café con id "${id}"`)
    this.name = 'CoffeeNotFoundError'
  }
}
