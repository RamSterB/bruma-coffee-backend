export class Coffee {
  constructor(
    public readonly id: number | null,
    public readonly name: string,
    public readonly region: string,
    public readonly price: number,
    public readonly createdAt: Date,
  ) {}

  static create(name: string, region: string, price: number): Coffee {
    return new Coffee(null, name, region, price, new Date())
  }
}