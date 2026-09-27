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
import { AUTH_CONFIG, authConfig, type AuthConfig } from './auth.config'
import { AuthController } from '../interfaces/http/auth/auth.controller'
import { AdminGuard, CustomerGuard, JwtAuthGuard } from '../interfaces/http/auth/auth.guards'
import { CsrfGuard } from '../interfaces/http/auth/csrf.guard'
import { LoginRateLimitGuard } from '../interfaces/http/auth/login-rate-limit'
import { LoginRateLimiter } from '../interfaces/http/auth/login-rate-limit.guard'

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([CustomerTypeOrmEntity, UserTypeOrmEntity, RefreshTokenTypeOrmEntity]),
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH_CONFIG,
      useFactory: (config: ConfigService) => authConfig(config),
      inject: [ConfigService],
    },
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
      useFactory: (auth: AuthConfig) => new BcryptPasswordHasher(auth.bcryptRounds),
      inject: [AUTH_CONFIG],
    },
    {
      provide: SessionTokenPort,
      useFactory: (auth: AuthConfig) =>
        new JwtSessionToken(auth.jwtSecret, auth.accessTtlSeconds, auth.refreshTtlSeconds),
      inject: [AUTH_CONFIG],
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
    LoginRateLimiter,
  ],
  exports: [
    AUTH_CONFIG,
    UserRepositoryPort,
    CustomerRepositoryPort,
    RefreshTokenRepositoryPort,
    // El guard de JWT vive en auth pero lo usan otros módulos (el carrito, por
    // ejemplo), asi que el port del que depende tiene que salir de aqui.
    SessionTokenPort,
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
    LoginRateLimiter,
  ],
})
export class AuthModule {}
