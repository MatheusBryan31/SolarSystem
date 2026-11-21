import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './auth.types';
import type { LoginDto } from './login.schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login({ email, senha }: LoginDto) {
    const usuario = await this.prisma.user.findUnique({ where: { email } });
    const senhaCorreta = usuario ? await compare(senha, usuario.passwordHash) : false;

    // Mesma mensagem para "e-mail não existe" e "senha errada": não revelamos qual dos dois
    if (!usuario || !senhaCorreta || !usuario.active) {
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }

    const payload: JwtPayload = { sub: usuario.id, role: usuario.role };
    return {
      accessToken: await this.jwt.signAsync(payload),
      // Montamos a resposta campo a campo: o passwordHash NUNCA sai da API
      usuario: { id: usuario.id, nome: usuario.name, email: usuario.email, role: usuario.role },
    };
  }
}
