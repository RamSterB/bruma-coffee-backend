import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { Coffee } from '../../domain/entities/coffee.entity'
import { CoffeeProcess } from '../../domain/enums/coffee-process.enum'
import { CoffeeRegion } from '../../domain/enums/coffee-region.enum'
import { RoastLevel } from '../../domain/enums/roast-level.enum'
import { CoffeeVariantTypeOrmEntity } from './coffee-variant.typeorm.entity'

@Entity('coffees')
@Index('idx_coffees_region', ['region'])
@Index('idx_coffees_roast_level', ['roastLevel'])
@Index('idx_coffees_process', ['process'])
@Index('idx_coffees_is_active', ['isActive'])
export class CoffeeTypeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 120 })
  name!: string

  @Column({ type: 'text' })
  description!: string

  @Column({ name: 'roast_level', type: 'varchar', length: 20 })
  roastLevel!: RoastLevel

  @Column({ type: 'varchar', length: 20 })
  process!: CoffeeProcess

  @Column({ type: 'varchar', length: 30 })
  region!: CoffeeRegion

  @Column({
    name: 'tasting_notes',
    type: 'text',
    array: true,
    default: () => "'{}'",
  })
  tastingNotes!: string[]

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean

  @OneToMany(() => CoffeeVariantTypeOrmEntity, (variant) => variant.coffee)
  variants!: CoffeeVariantTypeOrmEntity[]

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date

  static toDomain(entity: CoffeeTypeOrmEntity): Coffee {
    return Coffee.reconstitute({
      id: entity.id,
      name: entity.name,
      description: entity.description,
      roastLevel: entity.roastLevel,
      process: entity.process,
      region: entity.region,
      tastingNotes: entity.tastingNotes,
      isActive: entity.isActive,
      variants: (entity.variants ?? []).map((variant) =>
        CoffeeVariantTypeOrmEntity.toDomain(variant),
      ),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    })
  }
}
