import { plantDto } from './plant-dto';
type RecordPlant = Parameters<typeof plantDto>[0];
describe('DTO do cadastro único', () => {
  it('retorna data de operação como data civil sem horário', () => {
    expect(
      plantDto({ ...base, operationStartDate: new Date('2024-02-29T00:00:00Z') }, now).operationStartDate,
    ).toBe('2024-02-29');
  });
  const now = new Date('2026-11-23T12:00:00Z');
  const base = {
    integrationId: 'i',
    integration: { enabled: true, archivedAt: null },
    lastDataAt: now,
    manualOverrides: { name: 'Nome manual' },
    externalLinks: [{ id: 'link', revision: 0 }],
    currentPowerKw: 12,
    status: 'ONLINE',
  } as unknown as RecordPlant;
  it('separa origem manual de vínculo e exclui estruturas internas do retorno', () => {
    const dto = plantDto(base, now);
    expect(dto.monitoring).toBe('ACTIVE');
    expect(dto.metadataSources.name).toBe('MANUAL');
    expect(dto.metadataSources.capacityKwp).toBe('REMOTE');
    expect(dto).not.toHaveProperty('externalLinks');
  });
  it.each([
    [{ ...base, integrationId: null }, 'UNLINKED'],
    [{ ...base, integration: { enabled: false } }, 'PAUSED'],
    [{ ...base, lastDataAt: null }, 'WAITING'],
    [{ ...base, lastDataAt: new Date('2026-11-23T10:00:00Z') }, 'STALE'],
  ])('não apresenta potência antiga/sem fonte como geração corrente: %s', (value, state) => {
    const dto = plantDto(value as unknown as RecordPlant, now);
    expect(dto.monitoring).toBe(state);
    expect(dto.currentPowerKw).toBeNull();
    expect(dto.status).toBe('UNKNOWN');
  });
});
