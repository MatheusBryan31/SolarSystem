import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload, UsuarioAutenticado } from './auth.types';
import { IS_PUBLIC_KEY } from './public.decorator';
import { lerTokenDoCookie } from './sessao-cookie';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // 1. A rota tem a etiqueta @Public()? Então passa direto.
    const publica = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (publica) return true;

    // 2. Lê o token do cookie httpOnly (o navegador o envia sozinho)
    const req = ctx.switchToHttp().getRequest<Request & { user?: UsuarioAutenticado }>();
    const token = lerTokenDoCookie(req);
    if (!token) {
      throw new UnauthorizedException('Faça login para continuar');
    }

    // 3. Confere a assinatura e a validade
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada');
    }
    if (typeof payload?.sub !== 'string' || !payload.sub) {
      throw new UnauthorizedException('Sessão inválida ou expirada');
    }

    // 4. Confere no banco: o usuário ainda existe e está ativo?
    const usuario = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        clientId: true,
        sessionVersion: true,
      },
    });
    if (!usuario || !usuario.active || usuario.sessionVersion !== (payload.sv ?? 0)) {
      throw new UnauthorizedException('Sessão inválida ou expirada');
    }

    // 5. Anexa o usuário à requisição para o controller usar
    req.user = {
      id: usuario.id,
      nome: usuario.name,
      email: usuario.email,
      role: usuario.role,
      clientId: usuario.clientId,
    };
    ctx.switchToHttp().getResponse<Response>().setHeader('Cache-Control', 'private, no-store');
    return true;
  }
}
