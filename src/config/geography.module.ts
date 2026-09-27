import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { GeographyRepositoryPort } from '../domain/ports/geography.repository'
import { DepartmentTypeOrmEntity } from '../infrastructure/persistence/department.typeorm.entity'
import { CityTypeOrmEntity } from '../infrastructure/persistence/city.typeorm.entity'
import { TypeOrmGeographyRepository } from '../infrastructure/persistence/geography.typeorm.repository'
import { GeographyController } from '../interfaces/http/geography/geography.controller'

/**
 * Módulo aparte del carrito a propósito: la geografía no tiene nada que ver con
 * una compra, y quien la consulte para pintar un formulario no debería arrastrar
 * el carrito ni la sesión.
 */
@Module({
  // Las dos entidades van registradas, y no solo el departamento: con
  // `autoLoadEntities` la aplicación solo conoce las que aparecen aquí, y una
  // relación a una entidad que no conoce revienta al arrancar con un error de
  // metadatos que no dice qué falta. La suite de extremo a extremo no lo nota,
  // porque sustituye la conexión por una que trae la lista completa.
  imports: [TypeOrmModule.forFeature([DepartmentTypeOrmEntity, CityTypeOrmEntity])],
  controllers: [GeographyController],
  providers: [
    {
      provide: GeographyRepositoryPort,
      useClass: TypeOrmGeographyRepository,
    },
  ],
  exports: [GeographyRepositoryPort],
})
export class GeographyModule {}
