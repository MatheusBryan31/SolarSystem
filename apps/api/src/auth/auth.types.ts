import type { Role } from '@prisma/client';

// O que vai dentro do token (público. Não é sensível)
export interface JwtPayload {
  sub: string; // "subject": o id do usuário (nome padrão do JWT)
  role: Role;
}

// O usuário que o Guard anexa à requisição
export interface UsuarioAutenticado {
  id: string;
  nome: string;
  email: string;
  role: Role;
  clientId: string | null;
}
