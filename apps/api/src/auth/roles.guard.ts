import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import type { Request } from 'express';
import type { UsuarioAutenticado } from './auth.types';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const exigidos = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    // Rota sem @Roles(): qualquer usuário autenticado pode
    if (!exigidos || exigidos.length === 0) return true;

    const { user } = ctx.switchToHttp().getRequest<Request & { user?: UsuarioAutenticado }>();
    if (!user || !exigidos.includes(user.role)) {
      throw new ForbiddenException('Você não tem permissão para esta ação.'); // 403
    }
    return true;
  }
}
