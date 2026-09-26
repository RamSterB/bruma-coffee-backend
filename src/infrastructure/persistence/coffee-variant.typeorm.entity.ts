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
// Import de tipo: la relación se declara por el nombre de la entidad, así que
// no hace falta el valor en tiempo de ejecución. Esto además rompe el ciclo
// variant -> coffee -> variant, que con emitDecoratorMetadata hacía fallar la
// carga cuando este módulo se resolvía antes que coffee.typeorm.entity.
import type { CoffeeTypeOrmEntity } from './coffee.typeorm.entity'

// Nombre de la entidad Coffees, tal como TypeORM lo registra.
const COFFEE_ENTITY_NAME = 'CoffeeTypeOrmEntity'

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

  @ManyToOne(COFFEE_ENTITY_NAME, 'variants', { onDelete: 'CASCADE' })
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
