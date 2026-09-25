import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'
import { GetCoffeeByIdUseCase } from '../../application/use-cases/get-coffee-by-id.use-case'
import { GetCoffeesUseCase } from '../../application/use-cases/get-coffees.use-case'
import { Coffee } from '../../domain/entities/coffee.entity'
import { CoffeeFiltersQueryDto } from './dto/coffee-filters-query.dto'
import { CoffeeResponseDto, CoffeeVariantResponseDto } from './dto/coffee-response.dto'
import { PaginatedCoffeesResponseDto } from './dto/paginated-coffees-response.dto'

@ApiTags('coffee')
@Controller('coffee')
export class CoffeeController {
  constructor(
    private readonly getCoffeesUseCase: GetCoffeesUseCase,
    private readonly getCoffeeByIdUseCase: GetCoffeeByIdUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar cafés disponibles con filtros y paginación',
  })
  @ApiOkResponse({ type: PaginatedCoffeesResponseDto })
  async findAll(@Query() query: CoffeeFiltersQueryDto): Promise<PaginatedCoffeesResponseDto> {
    const page = await this.getCoffeesUseCase.execute(query)

    return {
      items: page.items.map((coffee) => this.toResponse(coffee)),
      total: page.total,
      page: page.page,
      limit: page.limit,
      totalPages: page.totalPages,
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar un café por su identificador' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CoffeeResponseDto })
  async findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<CoffeeResponseDto> {
    return this.toResponse(await this.getCoffeeByIdUseCase.execute(id))
  }

  private toResponse(coffee: Coffee): CoffeeResponseDto {
    return {
      id: coffee.id as string,
      name: coffee.name,
      description: coffee.description,
      roastLevel: coffee.roastLevel,
      process: coffee.process,
      region: coffee.region,
      tastingNotes: coffee.tastingNotes,
      priceFrom: coffee.priceFrom(),
      variants: coffee.variants.map((variant) => this.variantToResponse(variant)),
      createdAt: coffee.createdAt,
      updatedAt: coffee.updatedAt,
    }
  }

  private variantToResponse(variant: {
    id: string | null
    weightGrams: number
    price: number
    stock: number
    isActive: boolean
  }): CoffeeVariantResponseDto {
    return {
      id: variant.id as string,
      weightGrams: variant.weightGrams,
      price: variant.price,
      stock: variant.stock,
      isActive: variant.isActive,
    }
  }
}
