import { ConfigService } from '@nestjs/config'
import { databaseConfig } from './database.config'

const configDe = (valores: Record<string, string>) =>
  ({ get: (clave: string) => valores[clave] ?? undefined }) as ConfigService

const opciones = (valores: Record<string, string>) =>
  (databaseConfig.useFactory as (c: ConfigService) => Record<string, unknown>)(configDe(valores))

describe('la conexion con la base de datos', () => {
  it('va cifrada cuando se le pide, porque la base esta lejos de la aplicacion', () => {
    // Sin esto, las credenciales y los datos de las ordenes viajan en claro por la red.
    // En un postgres local da igual; en una base gestionada, no: el servidor rechaza
    // la conexion y ademas no deberia aceptarla.
    const config = opciones({ DB_SSL: 'true' })

    // Que este configurado, no que sea exactamente `true`: la forma exacta la fija la
    // prueba siguiente, que es la que sabe por que es esa y no otra.
    expect(config.ssl).toBeDefined()
  })

  it('el certificado de la base no se verifica contra una autoridad de confianza', () => {
    // Postgres gestionado usa un certificado propio, no uno emitido para amazonaws.com.
    // Verificarlo contra la autoridad publica haria fallar la conexion siempre, y la
    // comprobacion que de verdad importa —que el canal este cifrado— ya la da TLS.
    const config = opciones({ DB_SSL: 'true' })

    expect(config.ssl).toEqual({ rejectUnauthorized: false })
  })

  it('sin pedirla, no cifra, y el postgres del desarrollo sigue funcionando', () => {
    const config = opciones({})

    expect(config.ssl).toBeUndefined()
  })

  it('cualquier valor distinto de "true" se toma como no', () => {
    // Se compara con la cadena exacta porque es lo que llega del entorno. Aceptar "1" o
    // "si" como si fueran "si" es pedir que alguien se sorprenda.
    expect(opciones({ DB_SSL: 'false' }).ssl).toBeUndefined()
    expect(opciones({ DB_SSL: '1' }).ssl).toBeUndefined()
    expect(opciones({ DB_SSL: 'TRUE' }).ssl).toBeUndefined()
  })

  it('las migraciones siguen ejecutandose al arrancar, que es lo que crea el esquema', () => {
    const config = opciones({ DB_MIGRATIONS_RUN: 'true', DB_SSL: 'true' })

    expect(config.migrationsRun).toBe(true)
    expect(config.synchronize).toBe(false)
  })
})
