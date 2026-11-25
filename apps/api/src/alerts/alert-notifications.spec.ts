import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AlertMailer } from './alert-mailer';
import { AlertNotifications } from './alert-notifications';
describe('SMTP controlado: nenhum e-mail real nos testes', () => {
  const db = {
    $queryRaw: jest.fn(),
    alertEmail: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    alertNotificationSettings: { findUnique: jest.fn() },
  };
  const mailer = { enabled: true, send: jest.fn() };
  let enabled = true;
  const service = new AlertNotifications(
    db as unknown as PrismaService,
    mailer as unknown as AlertMailer,
    { get: () => enabled } as unknown as ConfigService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    enabled = true;
    mailer.enabled = true;
    db.$queryRaw.mockResolvedValueOnce([{ id: 'job' }]).mockResolvedValue([]);
    db.alertNotificationSettings.findUnique.mockResolvedValue({
      enabled: true,
      recipients: ['ops@example.test'],
      statuses: ['OPEN'],
    });
    db.alertEmail.findUniqueOrThrow.mockResolvedValue({
      id: 'job',
      recipient: 'ops@example.test',
      event: {
        id: 'event',
        status: 'OPEN',
        createdAt: new Date(),
        isSimulated: false,
        alert: { id: 'alert', type: 'PLANT_OFFLINE', message: 'Falha', isSimulated: false },
      },
    });
  });
  it('desabilitado não consulta fila nem simula sucesso', async () => {
    enabled = false;
    await service.process();
    expect(mailer.send).not.toHaveBeenCalled();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it('somente aceite SMTP permite SENT', async () => {
    mailer.send.mockResolvedValue(true);
    await service.process();
    const args = (db.alertEmail.update.mock.calls[0] as [{ data: Record<string, unknown> }])[0];
    expect(args.data.status).toBe('SENT');
    expect(args.data.sentAt).toBeInstanceOf(Date);
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });
  it('rejeição explícita é FAILED', async () => {
    mailer.send.mockResolvedValue(false);
    await service.process();
    expect(db.alertEmail.update).toHaveBeenCalledWith({
      where: { id: 'job' },
      data: { status: 'FAILED', failureCode: 'SMTP_REJECTED' },
    });
  });
  it('falha ambígua fica UNKNOWN sem retry automático nem segredo no erro', async () => {
    mailer.send.mockRejectedValue(new Error('segredo'));
    await service.process();
    expect(db.alertEmail.update).toHaveBeenCalledWith({
      where: { id: 'job' },
      data: { status: 'UNKNOWN', failureCode: 'SMTP_RESULT_UNCERTAIN' },
    });
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });
  it('simulação nunca envia e-mail', async () => {
    db.alertEmail.findUniqueOrThrow.mockResolvedValue({
      id: 'job',
      recipient: 'ops@example.test',
      event: { isSimulated: true, alert: { isSimulated: false } },
    });
    await service.process();
    expect(mailer.send).not.toHaveBeenCalled();
    expect(db.alertEmail.update).toHaveBeenCalledWith({
      where: { id: 'job' },
      data: { status: 'SKIPPED', failureCode: 'CONFIGURATION_OR_SIMULATION' },
    });
  });
});
