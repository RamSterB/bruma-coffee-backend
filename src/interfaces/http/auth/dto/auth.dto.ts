import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class RegisterDto {
  @ApiProperty({
    example: 'persona@ejemplo.com',
    description: 'Correo que sera la identidad de la cuenta',
  })
  @IsEmail({}, { message: 'El correo no tiene un formato valido' })
  @MaxLength(255)
  email: string

  @ApiProperty({
    example: 'BrumaCafe2026!',
    minLength: 8,
    description: 'Ocho caracteres como minimo; con mas, mejor',
  })
  @IsString()
  @MinLength(8, { message: 'La contrasena necesita al menos 8 caracteres' })
  @MaxLength(200, { message: 'La contrasena es demasiado larga' })
  password: string

  @ApiProperty({ example: 'Persona Registrada', maxLength: 120 })
  @IsString()
  @MinLength(3, { message: 'El nombre necesita al menos 3 caracteres' })
  @MaxLength(120, { message: 'El nombre es demasiado largo' })
  fullName: string
}

export class LoginDto {
  @ApiProperty({ example: 'persona@ejemplo.com' })
  @IsEmail({}, { message: 'El correo no tiene un formato valido' })
  @MaxLength(255)
  email: string

  @ApiProperty({ example: 'BrumaCafe2026!' })
  @IsString()
  @MinLength(1, { message: 'La contrasena es obligatoria' })
  @MaxLength(200)
  password: string
}

export class SessionUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string

  @ApiProperty({ example: 'persona@ejemplo.com' })
  email: string

  @ApiProperty({ example: 'Persona Registrada' })
  fullName: string

  @ApiProperty({ enum: ['CUSTOMER', 'ADMIN'], example: 'CUSTOMER' })
  role: string

  @ApiProperty({ description: 'Si el correo ya esta verificado' })
  isEmailVerified: boolean
}

export class SessionDto {
  @ApiProperty({
    description:
      'Token de acceso, de quince minutos. Va en el cuerpo y no en cookie: el navegador lo guarda en memoria y lo manda en la cabecera Authorization. Nunca en localStorage.',
  })
  accessToken: string

  @ApiProperty({ example: 900, description: 'Segundos de vida del token de acceso' })
  accessTokenExpiresIn: number

  @ApiProperty({
    description:
      'Token CSRF, que el navegador tambien recibe en la cookie csrf_token y tiene que copiar en la cabecera x-csrf-token al llamar a refresh y a logout.',
  })
  csrfToken: string

  @ApiProperty({ type: SessionUserDto })
  user: SessionUserDto
}

export class RegisterResponseDto {
  @ApiProperty({
    description:
      'Siempre con el mismo texto, exista o no el correo. La respuesta no revela que correos estan dados de alta, y por eso no se envia ninguna sesion: hay que entrar con correo y contrasena.',
  })
  message: string
}

export class LogoutResponseDto {
  @ApiProperty({ description: 'Se han revocado los tokens de esta sesion' })
  message: string
}
