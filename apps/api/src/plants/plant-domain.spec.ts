import { BadRequestException, ConflictException } from '@nestjs/common';
import { project, snapshot, telemetry, Snapshot, overridesSchema, readOverrides } from './plant-domain';

const remote: Snapshot = {
  externalId: '001',
  name: 'Nome remoto',
  city: 'Almenara',
  state: 'MG',
  capacityKwp: 50,
  status: 'ONLINE',
  currentPowerKw: 12,
  todayEnergyKwh: 20,
  totalEnergyKwh: 300,
  lastDataAt: '2026-11-23T12:00:00.000Z',
};

describe('Política do cadastro único', () => {
  it('preserva metadados históricos sem relaxar a validação de entradas novas', () => {
    const legacy = { name: 'A', state: 'minas gerais', capacityKwp: -3 };
    expect(project(remote, readOverrides(legacy))).toMatchObject(legacy);
    expect(overridesSchema.safeParse({ name: 'A' }).success).toBe(false);
    expect(overridesSchema.safeParse({ state: 'minas gerais' }).success).toBe(false);
    expect(overridesSchema.safeParse({ capacityKwp: -3 }).success).toBe(false);
    expect(() => readOverrides({ clientId: 'outro-cliente' })).toThrow();
  });
  it('compara instantes equivalentes entre fusos e rejeita divergência de valores', () => {
    const previous = telemetry(remote, null).lastSample;
    const equivalent = { ...remote, lastDataAt: '2026-11-23T09:00:00-03:00' };
    expect(telemetry(equivalent, previous).lastSample).toEqual(previous);
    expect(() => telemetry({ ...equivalent, currentPowerKw: 1 }, previous)).toThrow(ConflictException);
  });
  it('mantém nome/capacidade manuais e null explícito, sem apagar metadados remotos', () => {
    expect(project(remote, { name: 'Meu cadastro', capacityKwp: 30, city: null })).toEqual({
      name: 'Meu cadastro',
      capacityKwp: 30,
      city: null,
      state: 'MG',
    });
    expect(remote.name).toBe('Nome remoto');
  });
  it('chave ausente segue remoto; override não aceita cliente, identidade ou telemetria', () => {
    expect(project(remote, {}).capacityKwp).toBe(50);
    for (const key of ['clientId', 'integrationId', 'externalId', 'status', 'currentPowerKw']) {
      expect(overridesSchema.safeParse({ [key]: 'injetado' }).success).toBe(false);
    }
  });
  it('amostra repetida não soma energia nem modifica valores', () => {
    const first = telemetry(remote, null);
    expect(telemetry(remote, first.lastSample).fields.totalEnergyKwh).toBe(300);
  });
  it('rejeita leitura antiga e timestamp igual com valor divergente', () => {
    const previous = telemetry(remote, null).lastSample;
    expect(() => telemetry({ ...remote, lastDataAt: '2026-11-23T11:00:00.000Z' }, previous)).toThrow(
      ConflictException,
    );
    expect(() => telemetry({ ...remote, currentPowerKw: 2 }, previous)).toThrow(ConflictException);
  });
  it('preserva última amostra no histórico quando leitura não tem timestamp', () => {
    const previous = telemetry(remote, null).lastSample;
    const result = telemetry({ ...remote, lastDataAt: null }, previous);
    expect(result.lastSample).toEqual(previous);
    expect(result.fields).toMatchObject({ status: 'UNKNOWN', currentPowerKw: null, todayEnergyKwh: null });
    expect(result.fields.lastDataAt?.toISOString()).toBe(remote.lastDataAt);
  });
  it('valida unidade, datas futuras e identidade externa opaca', () => {
    const now = new Date(remote.lastDataAt!);
    const value = { ...remote, lastDataAt: now };
    expect(snapshot(value, now).externalId).toBe('001');
    expect(() => snapshot({ ...value, capacityKwp: -2 }, now)).toThrow(BadRequestException);
    expect(() => snapshot({ ...value, lastDataAt: new Date('2026-11-24T12:00:00Z') }, now)).toThrow(
      BadRequestException,
    );
  });
});
