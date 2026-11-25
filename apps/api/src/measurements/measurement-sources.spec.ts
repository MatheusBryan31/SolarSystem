import { NotFoundException } from '@nestjs/common';
import type { UsuarioAutenticado } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import { MeasurementsService } from './measurements.service';

describe('Fontes históricas de relatórios', () => {
  const user = { role: 'CLIENT', clientId: 'tenant' } as UsuarioAutenticado;
  it('preserva acesso a fonte desvinculada sem revelar credenciais ou identidade externa', async () => {
    const db = {
      plant: { findFirst: jest.fn().mockResolvedValue({ id: 'p' }) },
      plantExternalLink: { findMany: jest.fn() },
    };
    db.plantExternalLink.findMany.mockResolvedValue([
      {
        id: 'link',
        state: 'DETACHED',
        linkedAt: new Date(),
        detachedAt: new Date(),
        integration: { provider: 'DEMO' },
      },
    ]);
    const service = new MeasurementsService(db as unknown as PrismaService);
    const result = await service.sources('p', user);
    expect(result[0]).toEqual(expect.objectContaining({ id: 'link', state: 'DETACHED', provider: 'DEMO' }));
    expect(result[0]).not.toHaveProperty('integration');
    expect(db.plantExternalLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { plantId: 'p', plant: { clientId: 'tenant' } } }),
    );
  });
  it('não lista fontes de usina alheia nem de CLIENT sem vínculo', async () => {
    const db = {
      plant: { findFirst: jest.fn().mockResolvedValue(null) },
      plantExternalLink: { findMany: jest.fn() },
    };
    const service = new MeasurementsService(db as unknown as PrismaService);
    await expect(service.sources('foreign', user)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.sources('p', { ...user, clientId: null })).rejects.toBeInstanceOf(NotFoundException);
    expect(db.plantExternalLink.findMany).not.toHaveBeenCalled();
  });
});
