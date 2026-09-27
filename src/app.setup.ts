import { INestApplication, ValidationPipe } from '@nestjs/common'
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface'
import helmet, { HelmetOptions } from 'helmet'
import cookieParser from 'cookie-parser'

const API_PREFIX = 'api'
const HSTS_MAX_AGE_SECONDS = 15_552_000

export interface AppSecurityOptions {
  allowedOrigins: readonly string[]
}

export const buildCorsOptions = ({ allowedOrigins }: AppSecurityOptions): CorsOptions => ({
  origin: [...allowedOrigins],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  // x-csrf-token es obligatorio: sin permiso para esa cabecera, el navegador
  // bloquea refresh y logout antes de que lleguen al servidor.
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
  maxAge: 600,
})

export const buildHelmetOptions = (): HelmetOptions => ({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  hsts: {
    maxAge: HSTS_MAX_AGE_SECONDS,
    includeSubDomains: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  frameguard: { action: 'sameorigin' },
})

export const configureApp = (app: INestApplication, options: AppSecurityOptions): void => {
  app.setGlobalPrefix(API_PREFIX)
  // Sin esto req.cookies no existe y el refresh no llega a verse nunca.
  app.use(cookieParser())
  app.use(helmet(buildHelmetOptions()))
  app.enableCors(buildCorsOptions(options))
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
}
