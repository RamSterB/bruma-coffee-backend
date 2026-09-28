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

/**
 * Nada de lo que contesta esta API se guarda en el navegador ni en un intermediario.
 *
 * **Va en las respuestas y no en el manejador del 304, porque la peticion correcta es la
 * que no se cachea.** Sin esta cabecera, el navegador guarda la respuesta con su `ETag`,
 * la siguiente vez manda `If-None-Match` y recibe un **304 sin cuerpo**. Eso no es un
 * error de red: `fetch` lo resuelve como una respuesta cualquiera, pero `response.ok`
 * solo es cierto de 200 a 299, asi que el cliente lo toma por un fallo y lanza. En local
 * no se cachea nada y nunca se ve; en produccion, la segunda visita falla siempre.
 *
 * `private` ademas de `no-store` porque ni un intermediario compartido tiene por que
 * guardar el carrito o el historial de alguien.
 */
export const configureApp = (app: INestApplication, options: AppSecurityOptions): void => {
  app.setGlobalPrefix(API_PREFIX)
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    next()
  })
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
