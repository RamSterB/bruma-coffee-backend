import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { Coffee } from '../../domain/entities/coffee.entity'
import { buildSearchIndex } from '../../domain/search/search-text'
import { CoffeeProcess } from '../../domain/enums/coffee-process.enum'
import { CoffeeRegion } from '../../domain/enums/coffee-region.enum'
import { RoastLevel } from '../../domain/enums/roast-level.enum'
// Import de tipo para la relación, que se declara por el nombre de la entidad
// y no necesita el valor. El toDomain de la variante sí lo necesita, y ese
// import no genera ciclo en runtime porque la variante no importa este módulo
// más que como tipo.
import type { CoffeeVariantTypeOrmEntity } from './coffee-variant.typeorm.entity'
import { CoffeeVariantTypeOrmEntity as VariantEntity } from './coffee-variant.typeorm.entity'

// Nombre de la entidad CoffeeVariants, tal como TypeORM lo registra.
const COFFEE_VARIANT_ENTITY_NAME = 'CoffeeVariantTypeOrmEntity'

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

  @OneToMany(COFFEE_VARIANT_ENTITY_NAME, 'coffee')
  variants!: CoffeeVariantTypeOrmEntity[]

  /**
   * Copia sin acentos ni mayúsculas de lo que se puede buscar: nombre,
   * descripción y notas de cata. Se recalcula en cada escritura para que no se
   * quede desfasada del texto real. No se selecciona por defecto porque solo la
   * usa el filtro de búsqueda.
   *
   * Se mantiene con un hook de la entidad, que TypeORM ejecuta en `save()`.
   * Un `update()` del repositorio no pasa por los hooks, así que si algún día
   * se escribe por esa vía hay que usar `save()` o recalcular la columna a mano;
   * el test `coincide con la normalización de la aplicación en todas las filas`
   * avisa si se queda desfasada.
   */
  @Column({ name: 'search_index', type: 'text', select: false })
  searchIndex!: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date

  @BeforeInsert()
  @BeforeUpdate()
  private syncSearchIndex(): void {
    this.searchIndex = buildSearchIndex(this)
  }

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
      variants: (entity.variants ?? []).map((variant) => VariantEntity.toDomain(variant)),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    })
  }
}
