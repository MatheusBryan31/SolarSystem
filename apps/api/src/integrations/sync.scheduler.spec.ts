import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import type { IntegrationsService } from './integrations.service';
import { SyncScheduler } from './sync.scheduler';

jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

it('não grava nome da conta ou detalhes de exceções nos logs da coleta', async () => {
  const erro = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  const prisma = {
    integration: { findMany: jest.fn().mockResolvedValue([{ id: 'conta-1', name: 'nome-secreto' }]) },
  };
  const service = { sincronizar: jest.fn().mockRejectedValue(new Error('credencial-secreta')) };
  const scheduler = new SyncScheduler(
    prisma as unknown as PrismaService,
    service as unknown as IntegrationsService,
    {} as ConfigService,
  );
  try {
    await scheduler.executar();
    prisma.integration.findMany.mockRejectedValue(new Error('credencial-do-banco'));
    await scheduler.executar();
    expect(erro.mock.calls).toEqual([
      ['Falha de sincronização da integração conta-1'],
      ['Falha ao consultar integrações para sincronização'],
    ]);
  } finally {
    erro.mockRestore();
  }
});
