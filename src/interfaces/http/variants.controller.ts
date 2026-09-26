import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { Controller, Get, Query, ValidationPipe } from '@nestjs/common'
import { GetVariantsByIdsUseCase } from '../../application/use-cases/get-variants-by-ids.use-case'
import { VariantIdsQueryDto } from './dto/variant-ids-query.dto'

@ApiTags('coffee')
@Controller('variants')
export class VariantsController {
  constructor(private readonly getVariantsByIdsUseCase: GetVariantsByIdsUseCase) {}

  @Get()
  @ApiOperation({
    summary: 'Resolver una lista de variantes con el nombre de su café',
  })
  @ApiQuery({
    name: 'variantIds',
    required: true,
    description: 'Ids de variante separados por comas',
  })
  @ApiOkResponse({
    description: 'Líneas del carrito con precio y stock',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'variantId',
          'coffeeId',
          'coffeeName',
          'weightGrams',
          'price',
          'stock',
          'isActive',
        ],
        properties: {
          variantId: { type: 'string', format: 'uuid' },
          coffeeId: { type: 'string', format: 'uuid' },
          coffeeName: { type: 'string' },
          weightGrams: { type: 'integer' },
          price: { type: 'integer' },
          stock: { type: 'integer' },
          isActive: { type: 'boolean' },
        },
      },
    },
  })
  async findByIds(
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    query: VariantIdsQueryDto,
  ) {
    return this.getVariantsByIdsUseCase.execute(query.variantIds)
  }
}
