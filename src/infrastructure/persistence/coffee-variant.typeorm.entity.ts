import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm'
import { CoffeeVariant } from '../../domain/entities/coffee-variant.entity'
import { CoffeeTypeOrmEntity } from './coffee.typeorm.entity'

@Entity('coffee_variants')
@Unique('uq_variants_coffee_weight', ['coffeeId', 'weightGrams'])
@Index('idx_variants_coffee_id', ['coffeeId'])
@Index('idx_variants_stock', ['stock'])
@Check('chk_variants_weight_positive', '"weight_grams" > 0')
@Check('chk_variants_price_non_negative', '"price" >= 0')
@Check('chk_variants_stock_non_negative', '"stock" >= 0')
export class CoffeeVariantTypeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'coffee_id', type: 'uuid' })
  coffeeId!: string

  @ManyToOne(() => CoffeeTypeOrmEntity, (coffee) => coffee.variants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'coffee_id' })
  coffee!: CoffeeTypeOrmEntity

  @Column({ name: 'weight_grams', type: 'integer' })
  weightGrams!: number

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  price!: string

  @Column({ type: 'integer' })
  stock!: number

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date

  static toDomain(entity: CoffeeVariantTypeOrmEntity): CoffeeVariant {
    return CoffeeVariant.reconstitute({
      id: entity.id,
      weightGrams: entity.weightGrams,
      price: Number(entity.price),
      stock: entity.stock,
      isActive: entity.isActive,
      coffeeId: entity.coffeeId,
    })
  }
}
