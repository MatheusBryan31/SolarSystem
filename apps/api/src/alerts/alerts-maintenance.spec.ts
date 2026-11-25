import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import type { AlertsService } from './alerts.service';
import type { AlertNotifications } from './alert-notifications';
import { AlertsMaintenance } from './alerts-maintenance';

describe('Avaliação independente das notificações', () => {
  it('entrega lenta não bloqueia avaliação nem permite duas entregas locais simultâneas', async () => {
    let finish!: () => void;
    const delivery = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const process = jest.fn().mockReturnValue(delivery);
    const avaliarUsinas = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue([{ id: 'i' }]);
    const maintenance = new AlertsMaintenance(
      { integration: { findMany } } as unknown as PrismaService,
      { avaliarUsinas } as unknown as AlertsService,
      { process } as unknown as AlertNotifications,
      {} as ConfigService,
    );
    const ongoing = maintenance.deliver();
    await maintenance.deliver();
    await maintenance.tick();
    expect(process).toHaveBeenCalledTimes(1);
    expect(avaliarUsinas).toHaveBeenCalledWith('i', expect.any(Date));
    finish();
    await ongoing;
  });
  it('não agenda chamadas externas no ambiente de testes', () => {
    const timer = jest.spyOn(global, 'setInterval');
    const maintenance = new AlertsMaintenance(
      {} as PrismaService,
      {} as AlertsService,
      {} as AlertNotifications,
      { get: () => 'test' } as unknown as ConfigService,
    );
    maintenance.onApplicationBootstrap();
    expect(timer).not.toHaveBeenCalled();
    maintenance.onModuleDestroy();
    timer.mockRestore();
  });
});
