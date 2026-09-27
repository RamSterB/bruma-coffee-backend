import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { GetProfileUseCase } from '../application/use-cases/get-profile.use-case'
import { LoginUseCase } from '../application/use-cases/login.use-case'
import { LogoutUseCase } from '../application/use-cases/logout.use-case'
import { RefreshSessionUseCase } from '../application/use-cases/refresh-session.use-case'
import { RegisterUseCase } from '../application/use-cases/register.use-case'
import { CustomerRepositoryPort } from '../domain/ports/customer.repository'
import { MailerPort } from '../domain/ports/mailer'
import { PasswordHasherPort } from '../domain/ports/password-hasher'
import { RefreshTokenRepositoryPort } from '../domain/ports/refresh-token.repository'
import { SessionTokenPort } from '../domain/ports/session-token'
import { UserRepositoryPort } from '../domain/ports/user.repository'
import { BcryptPasswordHasher } from '../infrastructure/security/bcrypt-password-hasher'
import { JwtSessionToken } from '../infrastructure/security/jwt-session-token'
import { LogMailer } from '../infrastructure/mailer/log-mailer'
import { CustomerTypeOrmEntity } from '../infrastructure/persistence/customer.typeorm.entity'
import { RefreshTokenTypeOrmEntity } from '../infrastructure/persistence/refresh-token.typeorm.entity'
import { UserTypeOrmEntity } from '../infrastructure/persistence/user.typeorm.entity'
import { CustomerTypeOrmRepository } from '../infrastructure/persistence/customer.typeorm.repository'
import { RefreshTokenTypeOrmRepository } from '../infrastructure/persistence/refresh-token.typeorm.repository'
import { UserTypeOrmRepository } from '../infrastructure/persistence/user.typeorm.repository'
import { authConfig } from './auth.config'
import { AuthController } from '../interfaces/http/auth/auth.controller'
import { AdminGuard, CustomerGuard, JwtAuthGuard } from '../interfaces/http/auth/auth.guards'
import { CsrfGuard } from '../interfaces/http/auth/csrf.guard'
import { LoginRateLimitGuard } from '../interfaces/http/auth/login-rate-limit.guard'

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([CustomerTypeOrmEntity, UserTypeOrmEntity, RefreshTokenTypeOrmEntity]),
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: UserRepositoryPort,
      useClass: UserTypeOrmRepository,
    },
    {
      provide: CustomerRepositoryPort,
      useClass: CustomerTypeOrmRepository,
    },
    {
      provide: RefreshTokenRepositoryPort,
      useClass: RefreshTokenTypeOrmRepository,
    },
    {
      provide: PasswordHasherPort,
      useFactory: (config: ConfigService) =>
        new BcryptPasswordHasher(config.get<number>('BCRYPT_ROUNDS', 10)),
      inject: [ConfigService],
    },
    {
      provide: SessionTokenPort,
      useFactory: (config: ConfigService) => {
        const auth = authConfig(config)

        return new JwtSessionToken(auth.jwtSecret, auth.accessTtlSeconds, auth.refreshTtlSeconds)
      },
      inject: [ConfigService],
    },
    {
      provide: MailerPort,
      useClass: LogMailer,
    },
    RegisterUseCase,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    GetProfileUseCase,
    JwtAuthGuard,
    CustomerGuard,
    AdminGuard,
    CsrfGuard,
    LoginRateLimitGuard,
  ],
  exports: [
    UserRepositoryPort,
    CustomerRepositoryPort,
    RefreshTokenRepositoryPort,
    RegisterUseCase,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    GetProfileUseCase,
    JwtAuthGuard,
    CustomerGuard,
    AdminGuard,
    CsrfGuard,
    LoginRateLimitGuard,
  ],
})
export class AuthModule {}
