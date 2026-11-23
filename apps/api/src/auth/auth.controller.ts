import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import type { UsuarioAutenticado } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { loginSchema, type LoginDto } from './login.schema';
import { Public } from './public.decorator';
import { NOME_DO_COOKIE, opcoesDoCookie } from './sessao-cookie';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private get producao() {
    return this.config.getOrThrow<string>('NODE_ENV') === 'production';
  }

  @Public()
  @Post('login')
  @HttpCode(200) // login não cria nada: 200 OK em vez do 201 padrão do POST
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dados: LoginDto,
    @Res({ passthrough: true }) res: Response, // passthrough: o Nest continua enviando o return
  ) {
    const { accessToken, usuario } = await this.authService.login(dados);
    const validade = this.config.getOrThrow<number>('JWT_EXPIRES_IN');
    res.cookie(NOME_DO_COOKIE, accessToken, opcoesDoCookie(this.producao, validade));
    return { usuario }; // o token NÃO vai no corpo: o JavaScript da página nunca o vê
  }

  @Public() // quem tem a sessão vencida também precisa conseguir "sair"
  @Post('logout')
  @HttpCode(204) // 204 No Content: deu certo e não há nada para devolver
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(NOME_DO_COOKIE, opcoesDoCookie(this.producao));
  }

  @Get('me') // sem @Public(): protegida pelo Guard
  me(@CurrentUser() usuario: UsuarioAutenticado) {
    return usuario;
  }
}
