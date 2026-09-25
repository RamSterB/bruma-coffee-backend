import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'
import { Coffee } from '../../domain/entities/coffee.entity'

@Entity('coffees')
export class CoffeeTypeOrmEntity {
  @PrimaryGeneratedColumn()
  id!: number

  @Column()
  name!: string

  @Column()
  region!: string

  @Column('numeric', { precision: 10, scale: 2 })
  price!: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date

  static toDomain(entity: CoffeeTypeOrmEntity): Coffee {
    return new Coffee(
      entity.id,
      entity.name,
      entity.region,
      Number(entity.price),
      entity.createdAt,
    )
  }

  static fromDomain(coffee: Coffee): CoffeeTypeOrmEntity {
    const entity = new CoffeeTypeOrmEntity()
    entity.name = coffee.name
    entity.region = coffee.region
    entity.price = coffee.price.toString()
    return entity
  }
}