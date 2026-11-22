import { SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

// Uso: @Roles(Role.ADMIN, Role.OPERATOR)
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
