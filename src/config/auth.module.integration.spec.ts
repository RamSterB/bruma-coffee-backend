import { Test } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { AuthModule } from './auth.module'
import { GetProfileUseCase } from '../application/use-cases/get-profile.use-case'
import { LoginUseCase } from '../application/use-cases/login.use-case'
import { LogoutUseCase } from '../application/use-cases/logout.use-case'
import { RefreshSessionUseCase } from '../application/use-cases/refresh-session.use-case'
import { RegisterUseCase } from '../application/use-cases/register.use-case'
import { MailerPort } from '../domain/ports/mailer'
import { PasswordHasherPort } from '../domain/ports/password-hasher'
import { SessionTokenPort } from '../domain/ports/session-token'
import { resetTestDatabase, testDataSourceOptions } from '../testing/test-database'
import { BcryptPasswordHasher } from '../infrastructure/security/bcrypt-password-hasher'
import { JwtSessionToken } from '../infrastructure/security/jwt-session-token'

/**
 * Si el token de inyeccion de un port no coincide con el que aporta Nest, este
 * test es el unico que se entera antes de levantar el servidor.
 */
describe('AuthModule', () => {
  let dataSource: DataSource
  let app: INestApplication
  const originalSecret = process.env.JWT_SECRET

  beforeAll(async () => {
    dataSource = await resetTestDatabase()
    process.env.JWT_SECRET = 'secreto-de-prueba-para-el-cableado'

    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot(testDataSourceOptions()),
        AuthModule,
      ],
    }).compile()

    app = modulo.createNestApplication()
    await app.init()
  }, 60000)

  afterAll(async () => {
    if (app !== undefined) {
      await app.close()
    }
    process.env.JWT_SECRET = originalSecret
    await dataSource.destroy()
  })

  it.each([
    ['registro', RegisterUseCase],
    ['login', LoginUseCase],
    ['refresh', RefreshSessionUseCase],
    ['logout', LogoutUseCase],
    ['perfil', GetProfileUseCase],
  ])('resuelve el caso de uso de %s', (_nombre, caso) => {
    expect(app.get(caso)).toBeInstanceOf(caso)
  })

  it('conecta el hasher a bcrypt, el token a JWT y el correa a un adapter', () => {
    expect(app.get(PasswordHasherPort)).toBeInstanceOf(BcryptPasswordHasher)
    expect(app.get(SessionTokenPort)).toBeInstanceOf(JwtSessionToken)
    expect(app.get(MailerPort)).toBeDefined()
  })
})
