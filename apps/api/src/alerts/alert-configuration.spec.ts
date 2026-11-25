import { ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { AlertConfiguration, updateNotificationsSchema } from './alert-configuration';
import { DEFAULT_POLICY } from './alert-policy';

describe('Configuração persistida de alertas', () => {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    plant: { findUnique: jest.fn().mockResolvedValue({ id: 'p' }) },
    alertPolicy: { findUnique: jest.fn(), upsert: jest.fn() },
    alertNotificationSettings: { findUnique: jest.fn(), upsert: jest.fn() },
  };
  const db = { ...tx, $transaction: jest.fn((work: (value: object) => Promise<unknown>) => work(tx)) };
  const service = new AlertConfiguration(
    db as unknown as PrismaService,
    { get: () => undefined } as unknown as ConfigService,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    tx.alertPolicy.findUnique.mockResolvedValue(null);
    tx.alertNotificationSettings.findUnique.mockResolvedValue(null);
  });
  it('normaliza e rejeita destinatários repetidos, campos desconhecidos e revisão ausente', () => {
    expect(
      updateNotificationsSchema.safeParse({
        revision: 0,
        recipients: ['OPS@example.test', 'ops@example.test'],
      }).success,
    ).toBe(false);
    expect(updateNotificationsSchema.safeParse({ revision: 0, smtpPassword: 'unexpected' }).success).toBe(
      false,
    );
    expect(updateNotificationsSchema.safeParse({ enabled: true }).success).toBe(false);
  });
  it('recusa habilitar e-mails sem destinatários, mesmo em atualização parcial', async () => {
    await expect(service.saveSettings({ revision: 0, enabled: true })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.alertNotificationSettings.upsert).not.toHaveBeenCalled();
  });
  it('revisão protege contra sobrescrever alterações de outra sessão', async () => {
    tx.alertPolicy.findUnique.mockResolvedValue({ ...DEFAULT_POLICY, plantId: 'p', revision: 2 });
    await expect(service.savePolicy('p', { revision: 1, generationEnabled: true })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.alertPolicy.upsert).not.toHaveBeenCalled();
  });
  it('valida limites combinados com a política persistida', async () => {
    tx.alertPolicy.findUnique.mockResolvedValue({
      ...DEFAULT_POLICY,
      plantId: 'p',
      revision: 1,
      highPowerRatio: 0.5,
    });
    await expect(service.savePolicy('p', { revision: 1, lowPowerRatio: 0.8 })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.alertPolicy.upsert).not.toHaveBeenCalled();
  });
});
