import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { configureApp } from './app.setup'
import { readAllowedOrigins } from './config/allowed-origins'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)

  configureApp(app, { allowedOrigins: readAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS) })

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Bruma Coffee API')
    .setDescription('Documentación de la API de Bruma Coffee')
    .setVersion('1.0')
    .addTag('coffee')
    .build()

  const documentFactory = () => SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('api/docs', app, documentFactory, {
    swaggerOptions: { persistAuthorization: true },
  })

  const port = Number(process.env.PORT ?? 8000)
  await app.listen(port, '0.0.0.0')
}

void bootstrap()
