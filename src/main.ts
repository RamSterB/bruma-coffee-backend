import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Logger } from '@nestjs/common'
import type { INestApplication } from '@nestjs/common'
import { AppModule } from './app.module'
import { configureApp } from './app.setup'
import { readAllowedOrigins } from './config/allowed-origins'
import {
  CARD_GATEWAY_CONFIG,
  PUBLIC_BASE_URL,
  gatewayEnvironment,
  publicBaseUrl,
  validatePublicBaseUrl,
  webhookUrl,
  type CardGatewayConfig,
} from './config/card-gateway.config'

/**
 * Lo que hay que registrar en el panel de la pasarela, impreso al arrancar.
 *
 * Existe porque el registro se hace **a mano, en el panel, y por ambiente**: nadie
 * lo lee en el código y el síntoma de que está mal es que la pasarela "no llama" y
 * no dice nada más. Con la URL escrita en el arranque no hay que buscarla ni
 * adivinarla, y se ve si el túnel cambió.
 */
const avisarDelWebhook = (app: INestApplication): void => {
  const logger = new Logger('Arranque')
  const base = publicBaseUrl()

  if (base.length === 0) {
    logger.warn(
      `${PUBLIC_BASE_URL} no está definida. Sin ella no se sabe qué URL de evento ` +
        `registrar en el panel de la pasarela, y el aviso de estado no llegará a nadie.`,
    )

    return
  }

  const validacion = validatePublicBaseUrl(base)

  if (!validacion.ok) {
    logger.error(
      `${PUBLIC_BASE_URL} vale "${base}", que no es una URL absoluta. El webhook no ` +
        `podrá funcionar y el fallo se descubrirá cuando un pago no se confirme.`,
    )

    return
  }

  if (validacion.advertencia !== undefined) {
    logger.warn(validacion.advertencia)
  }

  const pasarela = app.get(CARD_GATEWAY_CONFIG) as CardGatewayConfig
  const ambiente = gatewayEnvironment(pasarela)

  logger.log(`Webhook de la pasarela (ambiente ${ambiente ?? 'sin determinar'}):`)
  logger.log(`  ${webhookUrl(base)}`)
  logger.log('  Hay que registrar esa URL en el panel, en Developers → eventos.')
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)

  configureApp(app, { allowedOrigins: readAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS) })

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Bruma Coffee API')
    .setDescription('Documentación de la API de Bruma Coffee')
    .setVersion('1.0')
    .addTag('coffee')
    .addTag('auth')
    .addTag('cart')
    .addTag('geography')
    .addTag('orders')
    .build()

  const documentFactory = () => SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('api/docs', app, documentFactory, {
    swaggerOptions: { persistAuthorization: true },
  })

  const port = Number(process.env.PORT ?? 8000)
  await app.listen(port, '0.0.0.0')

  avisarDelWebhook(app)
}

void bootstrap()
