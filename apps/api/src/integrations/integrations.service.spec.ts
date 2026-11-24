import { BadGatewayException, BadRequestException, ConflictException } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderRegistry } from '../providers/provider-registry';
import { ErroDaPlataforma } from '../providers/provider.types';
import { AlertsService } from '../alerts/alerts.service';
import { PlantCatalogService } from '../plants/plant-catalog.service';

describe('Sincronização controlada do catálogo', () => {
  const db = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    integration: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    alert: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    plantDiscovery: { findFirst: jest.fn(), update: jest.fn() },
  };
  const adapter = { listarUsinas: jest.fn(), testarConexao: jest.fn() };
  const registry = { obter: jest.fn() };
  const alerts = { avaliarUsinasTx: jest.fn() };
  const catalog = { apply: jest.fn() };
  const service = new IntegrationsService(
    db as unknown as PrismaService,
    registry as unknown as ProviderRegistry,
    alerts as unknown as AlertsService,
    catalog as unknown as PlantCatalogService,
  );
  const integration = {
    id: 'i',
    provider: 'DEMO',
    enabled: true,
    archivedAt: null,
    revision: 0,
    credentials: {},
  };
  const remote = {
    externalId: '001',
    name: 'Usina remota',
    city: null,
    state: null,
    capacityKwp: 20,
    status: 'ONLINE',
    currentPowerKw: 5,
    todayEnergyKwh: 10,
    totalEnergyKwh: 200,
    lastDataAt: new Date(),
  };
  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((work: (tx: typeof db) => Promise<unknown>) => work(db));
    db.integration.findUnique.mockResolvedValue(integration);
    registry.obter.mockReturnValue(adapter);
    adapter.listarUsinas.mockResolvedValue([remote]);
    catalog.apply.mockResolvedValue('pending');
    db.alert.updateMany.mockResolvedValue({ count: 0 });
    alerts.avaliarUsinasTx.mockResolvedValue({ abertos: 0, resolvidos: 0 });
  });
  it('nova descoberta não é contabilizada como usina importada', async () => {
    await expect(service.sincronizar('i')).resolves.toMatchObject({
      usinasSincronizadas: 0,
      descobertasPendentes: 1,
    });
    expect(catalog.apply).toHaveBeenCalledTimes(1);
    expect(alerts.avaliarUsinasTx).toHaveBeenCalledWith(db, 'i', expect.any(Date));
  });
  it.each([{ enabled: false }, { archivedAt: new Date() }])(
    'pausa/arquivo bloqueia inclusive sync manual: %j',
    async (state) => {
      db.integration.findUnique.mockResolvedValue({ ...integration, ...state });
      await expect(service.sincronizar('i')).rejects.toThrow(BadRequestException);
      expect(adapter.listarUsinas).not.toHaveBeenCalled();
    },
  );
  it('coleta iniciada antes de mudar os vínculos é descartada na revisão', async () => {
    db.integration.findUnique
      .mockResolvedValueOnce(integration)
      .mockResolvedValueOnce({ ...integration, revision: 1 });
    await expect(service.sincronizar('i')).rejects.toThrow(ConflictException);
    expect(catalog.apply).not.toHaveBeenCalled();
    expect(db.integration.update).not.toHaveBeenCalled();
  });
  it('lote com identidade repetida não grava o catálogo', async () => {
    adapter.listarUsinas.mockResolvedValue([remote, remote]);
    await expect(service.sincronizar('i')).rejects.toThrow(BadRequestException);
    expect(catalog.apply).not.toHaveBeenCalled();
  });
  it('não expõe nem persiste credenciais contidas no erro do provedor', async () => {
    adapter.listarUsinas.mockRejectedValue(new Error('segredo-super-secreto'));
    await expect(service.sincronizar('i')).rejects.toThrow(BadGatewayException);
    expect(JSON.stringify(db.integration.update.mock.calls)).not.toContain('segredo-super-secreto');
    expect(JSON.stringify(db.alert.create.mock.calls)).not.toContain('segredo-super-secreto');
  });
  it('a criação também oculta a mensagem original do provedor', async () => {
    adapter.testarConexao.mockRejectedValue(new ErroDaPlataforma('segredo-no-erro'));
    await expect(service.criar({ name: 'Teste', provider: 'DEMO', credentials: {} })).rejects.toThrow(
      'Não foi possível conectar à plataforma. Confira os dados da integração.',
    );
    expect(db.integration.create).not.toHaveBeenCalled();
  });
  it('importação exige revisar a versão atual da descoberta', async () => {
    db.plantDiscovery.findFirst.mockResolvedValue({ id: 'd', revision: 2, resolvedAt: null });
    await expect(service.importar('i', 'd', 1, 'admin')).rejects.toThrow(ConflictException);
    expect(catalog.apply).not.toHaveBeenCalled();
  });
});
