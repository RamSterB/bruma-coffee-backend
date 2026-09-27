import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { GeographyRepositoryPort } from '../domain/ports/geography.repository'
import { DepartmentTypeOrmEntity } from '../infrastructure/persistence/department.typeorm.entity'
import { TypeOrmGeographyRepository } from '../infrastructure/persistence/geography.typeorm.repository'
import { GeographyController } from '../interfaces/http/geography/geography.controller'

/**
 * Módulo aparte del carrito a propósito: la geografía no tiene nada que ver con
 * una compra, y quien la consulte para pintar un formulario no debería arrastrar
 * el carrito ni la sesión.
 */
@Module({
  imports: [TypeOrmModule.forFeature([DepartmentTypeOrmEntity])],
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
