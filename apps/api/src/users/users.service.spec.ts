import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, Role } from '@prisma/client';
import { compare } from 'bcryptjs';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const OUTRO_ID = '22222222-2222-4222-8222-222222222222';
const CLIENTE_ID = '33333333-3333-4333-8333-333333333333';

const admin: UsuarioAutenticado = {
  id: ADMIN_ID,
  nome: 'Admin',
  email: 'admin@teste.com',
  role: Role.ADMIN,
  clientId: null,
};

describe('UsersService', () => {
  let service: UsersService;
  // Tipamos os argumentos para o ESLint saber o formato de mock.calls
  type ArgsEscrita = { data: Record<string, unknown>; select: Record<string, unknown> };
  const prismaFalso = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    user: {
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn<Promise<unknown>, [ArgsEscrita]>(),
      update: jest.fn<Promise<unknown>, [ArgsEscrita]>(),
    },
    client: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prismaFalso.$transaction.mockImplementation((work: (tx: typeof prismaFalso) => Promise<unknown>) =>
      work(prismaFalso),
    );
    const modulo = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prismaFalso }],
    }).compile();
    service = modulo.get(UsersService);
  });

  describe('criar', () => {
    it('grava a senha apenas como hash bcrypt e nunca pede o passwordHash de volta', async () => {
      prismaFalso.user.create.mockResolvedValue({ id: OUTRO_ID });

      await service.criar({
        name: 'Ana',
        email: 'ana@teste.com',
        senha: 'SenhaForte123',
        role: Role.OPERATOR,
      });

      const { data, select } = prismaFalso.user.create.mock.calls[0][0];
      expect(data.senha).toBeUndefined();
      expect(data.passwordHash).not.toBe('SenhaForte123');
      expect(await compare('SenhaForte123', data.passwordHash as string)).toBe(true);
      expect(select.passwordHash).toBeUndefined();
    });

    it('recusa CLIENT sem clientId', async () => {
      await expect(
        service.criar({ name: 'Cli', email: 'c@teste.com', senha: 'SenhaForte123', role: Role.CLIENT }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa OPERATOR com clientId', async () => {
      await expect(
        service.criar({
          name: 'Op',
          email: 'o@teste.com',
          senha: 'SenhaForte123',
          role: Role.OPERATOR,
          clientId: CLIENTE_ID,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('transforma e-mail repetido (P2002) em 409', async () => {
      prismaFalso.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicado', { code: 'P2002', clientVersion: 'teste' }),
      );
      await expect(
        service.criar({ name: 'Ana', email: 'ana@teste.com', senha: 'SenhaForte123', role: Role.OPERATOR }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('atualizar', () => {
    it.each([
      { active: false },
      { active: true },
      { role: Role.ADMIN },
      { email: 'novo@teste.com' },
      { clientId: CLIENTE_ID, role: Role.CLIENT },
    ])('revoga sessões ao alterar acesso/identidade: %j', async (changes) => {
      prismaFalso.user.findUnique.mockResolvedValue({
        id: OUTRO_ID,
        role: Role.OPERATOR,
        clientId: null,
        active: changes.active === true ? false : true,
        email: 'antigo@teste.com',
      });
      prismaFalso.client.findUnique.mockResolvedValue({ id: CLIENTE_ID });
      await service.atualizar(OUTRO_ID, changes, admin);
      expect(prismaFalso.user.update.mock.calls[0][0].data).toMatchObject({
        sessionVersion: { increment: 1 },
        passwordResetDigest: null,
        passwordResetExpiresAt: null,
      });
    });
    it('edição de nome não revoga sessão nem modifica perfil', async () => {
      prismaFalso.user.findUnique.mockResolvedValue({
        id: OUTRO_ID,
        role: Role.OPERATOR,
        clientId: null,
        active: true,
      });
      await service.atualizar(OUTRO_ID, { name: 'Novo nome' }, admin);
      const data = prismaFalso.user.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('sessionVersion');
      expect(data).not.toHaveProperty('role');
    });
    it('não permite remover o último administrador ativo e lê sob lock', async () => {
      prismaFalso.user.findUnique.mockResolvedValue({
        id: OUTRO_ID,
        role: Role.ADMIN,
        clientId: null,
        active: true,
      });
      prismaFalso.user.count.mockResolvedValue(1);
      await expect(service.atualizar(OUTRO_ID, { active: false }, admin)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prismaFalso.user.update).not.toHaveBeenCalled();
      expect(prismaFalso.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prismaFalso.user.findUnique.mock.invocationCallOrder[0],
      );
    });
    it('permite rebaixar outro administrador quando há mais de um ativo', async () => {
      prismaFalso.user.findUnique.mockResolvedValue({
        id: OUTRO_ID,
        role: Role.ADMIN,
        clientId: null,
        active: true,
      });
      prismaFalso.user.count.mockResolvedValue(2);
      await service.atualizar(OUTRO_ID, { role: Role.OPERATOR }, admin);
      expect(prismaFalso.user.update).toHaveBeenCalled();
    });
    it('impede o admin de desativar a si mesmo', async () => {
      prismaFalso.user.findUnique.mockResolvedValue({ id: ADMIN_ID, role: Role.ADMIN, clientId: null });
      await expect(service.atualizar(ADMIN_ID, { active: false }, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prismaFalso.user.update).not.toHaveBeenCalled();
    });

    it('permite desativar outro usuário', async () => {
      prismaFalso.user.findUnique.mockResolvedValue({ id: OUTRO_ID, role: Role.OPERATOR, clientId: null });
      prismaFalso.user.update.mockResolvedValue({ id: OUTRO_ID, active: false });

      await service.atualizar(OUTRO_ID, { active: false }, admin);

      expect(prismaFalso.user.update.mock.calls[0][0].data.active).toBe(false);
    });

    it('desvincula o cliente quando o usuário deixa de ser CLIENT', async () => {
      prismaFalso.user.findUnique.mockResolvedValue({
        id: OUTRO_ID,
        role: Role.CLIENT,
        clientId: CLIENTE_ID,
      });
      prismaFalso.user.update.mockResolvedValue({ id: OUTRO_ID });

      await service.atualizar(OUTRO_ID, { role: Role.OPERATOR }, admin);

      expect(prismaFalso.user.update.mock.calls[0][0].data.clientId).toBeNull();
    });

    it('responde 404 para usuário inexistente', async () => {
      prismaFalso.user.findUnique.mockResolvedValue(null);
      await expect(service.atualizar(OUTRO_ID, { name: 'X' }, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
