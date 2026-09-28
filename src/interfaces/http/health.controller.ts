import { Controller, Get, HttpException, HttpStatus, Module } from '@nestjs/common'
import { ApiExcludeEndpoint, ApiOkResponse, ApiOperation } from '@nestjs/swagger'
import { DataSource } from 'typeorm'

/**
 * Lo que responde el balanceador para decidir si este contenedor recibe tráfico.
 *
 * **Pide la base de datos a propósito.** Un 200 que no comprueba nada miente: si la
 * aplicación levanta pero la conexión con la base se cae, el contenedor recibe tráfico y
 * devuelve 500 a todo el mundo. Es el peor resultado posible, porque parece que la
 * tienda funciona y no funciona. Con la comprobación, el contenedor se da por malo y el
 * balanceador deja de mandarle gente.
 *
 * Y **devuelve 503, no 500**, cuando no puede: 503 dice "no estoy yo de servicio,
 * inténtalo con otro", que es literalmente lo que está pasando. Un 500 se lee como
 * "esta aplicación está rota".
 */
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  // Sin `@UseGuards`: en este proyecto el guardia se pone ruta a ruta, así que una
  // ruta sin guard es pública. No hay decorador `@Public`, y no se inventa uno.
  @Get()
  @ApiOperation({
    summary: 'Comprobación de salud del servicio',
    description:
      'Sin sesión y sin cabeceras: la usa el balanceador para decidir si el contenedor ' +
      'recibe tráfico. Devuelve 503 si la base de datos no responde, para que el ' +
      'contenedor quede fuera de rotación en vez de devolver errores a los clientes.',
  })
  @ApiOkResponse({ description: 'El servicio y la base de datos responden' })
  @ApiExcludeEndpoint()
  async comprobar(): Promise<{ status: string }> {
    try {
      await this.dataSource.query('SELECT 1')

      return { status: 'ok' }
    } catch {
      // Se lanza en vez de "devolver un 503" porque un `@Get()` siempre responde 200: la
      // única forma de que el código de salida sea 503 sin meter la respuesta a mano es
      // lanzar. Así el cuerpo es el que dice qué pasa, no el genérico de Nest.
      throw new HttpException(
        { status: 'degradado', causa: 'base-de-datos' },
        HttpStatus.SERVICE_UNAVAILABLE,
      )
    }
  }
}

/**
 * Módulo aparte, y a propósito: el chequeo de salud no depende de nada más. Si cuelga
 * la pasarela de pagos, el catálogo entero o la autenticación, este sigue contestando,
 * que es justo cuando más hace falta que responda.
 */
@Module({
  controllers: [HealthController],
  providers: [],
  exports: [],
})
export class HealthModule {}
