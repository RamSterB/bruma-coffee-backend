import { INestApplication, ValidationPipe } from '@nestjs/common'
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface'
import helmet, { HelmetOptions } from 'helmet'

const API_PREFIX = 'api'
const HSTS_MAX_AGE_SECONDS = 15_552_000

export interface AppSecurityOptions {
  allowedOrigins: readonly string[]
}

export const buildCorsOptions = ({ allowedOrigins }: AppSecurityOptions): CorsOptions => ({
  origin: [...allowedOrigins],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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
