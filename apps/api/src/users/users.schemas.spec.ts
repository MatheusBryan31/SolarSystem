import { Role } from '@prisma/client';
import { atualizarUsuarioSchema, criarUsuarioSchema } from './users.schemas';

describe('schemas de usuário', () => {
  it('POST sem role assume OPERATOR', () => {
    const dados = criarUsuarioSchema.parse({ name: 'Ana', email: 'ANA@Teste.com ', senha: 'SenhaForte123' });
    expect(dados.role).toBe(Role.OPERATOR);
    expect(dados.email).toBe('ana@teste.com');
  });

  it('PATCH sem role NÃO inventa um role (evita rebaixar o usuário sem querer)', () => {
    const dados = atualizarUsuarioSchema.parse({ active: false });
    expect(dados).toEqual({ active: false });
  });

  it('PATCH vazio é recusado', () => {
    expect(atualizarUsuarioSchema.safeParse({}).success).toBe(false);
  });
});
