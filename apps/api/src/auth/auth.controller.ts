import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import type { UsuarioAutenticado } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { loginSchema, type LoginDto } from './login.schema';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200) // login não cria nada: 200 OK em vez do 201 padrão do POST
  login(@Body(new ZodValidationPipe(loginSchema)) dados: LoginDto) {
    return this.authService.login(dados);
  }

  @Get('me') // sem @Public(): protegida pelo Guard
  me(@CurrentUser() usuario: UsuarioAutenticado) {
    return usuario;
  }
}
