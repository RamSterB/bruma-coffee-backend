import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CreateCoffeeUseCase } from '../../application/use-cases/create-coffee.use-case'
import { GetCoffeesUseCase } from '../../application/use-cases/get-coffees.use-case'
import { Coffee } from '../../domain/entities/coffee.entity'
import { CoffeeResponseDto } from './dto/coffee-response.dto'
import { CreateCoffeeDto } from './dto/create-coffee.dto'

@ApiTags('coffee')
@Controller('coffee')
export class CoffeeController {
  constructor(
    private readonly createCoffeeUseCase: CreateCoffeeUseCase,
    private readonly getCoffeesUseCase: GetCoffeesUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear un café' })
  @ApiCreatedResponse({ type: CoffeeResponseDto })
  async create(@Body() dto: CreateCoffeeDto): Promise<CoffeeResponseDto> {
    const coffee = await this.createCoffeeUseCase.execute(dto)
    return this.toResponse(coffee)
  }

  @Get()
  @ApiOperation({ summary: 'Listar cafés' })
  @ApiOkResponse({ type: CoffeeResponseDto, isArray: true })
  async findAll(): Promise<CoffeeResponseDto[]> {
    const coffees = await this.getCoffeesUseCase.execute()
    return coffees.map((coffee) => this.toResponse(coffee))
  }

  private toResponse(coffee: Coffee): CoffeeResponseDto {
    return {
      id: coffee.id ?? 0,
      name: coffee.name,
      region: coffee.region,
      price: coffee.price,
      createdAt: coffee.createdAt,
    }
  }
}