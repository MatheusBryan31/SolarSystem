import { BadRequestException, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../auth/roles.guard';
import { PlantsController } from './plants.controller';
import { BRAZILIAN_STATES, checkCoordinates, detailsForDatabase } from './plant-details';
import { criarUsinaSchema, editarUsinaSchema } from './plants.schemas';

describe('Informações técnicas e cadastrais', () => {
  it('preserva cadastro mínimo e campos opcionais sem defaults que sobrescrevam dados', () => {
    expect(criarUsinaSchema.parse({ name: 'Usina mínima' })).toEqual({ name: 'Usina mínima' });
    expect(editarUsinaSchema.parse({ revision: 0, technicalNotes: null })).toEqual({
      revision: 0,
      technicalNotes: null,
      useRemote: [],
    });
    expect(editarUsinaSchema.safeParse({ revision: 0 }).success).toBe(false);
  });
  it('aceita as 27 UFs, normaliza caixa/bordas e rejeita siglas inexistentes', () => {
    expect(new Set(BRAZILIAN_STATES).size).toBe(27);
    for (const state of BRAZILIAN_STATES) {
      expect(criarUsinaSchema.parse({ name: 'Usina', state: ` ${state.toLowerCase()} ` }).state).toBe(state);
    }
    for (const state of ['ZZ', 'BR', 'Minas Gerais', '']) {
      expect(criarUsinaSchema.safeParse({ name: 'Usina', state }).success).toBe(false);
    }
  });
  it('normaliza CEP sem perder zeros e aceita número de endereço textual', () => {
    expect(
      criarUsinaSchema.parse({ name: 'Usina', postalCode: ' 01234-567 ', addressNumber: 's/n' }),
    ).toMatchObject({ postalCode: '01234567', addressNumber: 's/n' });
    expect(criarUsinaSchema.parse({ name: 'Usina', postalCode: '01234567' }).postalCode).toBe('01234567');
    for (const postalCode of ['1234-567', '123456789', 'ABCDE-FGH', 12345678]) {
      expect(criarUsinaSchema.safeParse({ name: 'Usina', postalCode }).success).toBe(false);
    }
  });
  it.each([
    ['nominalPowerKw', -1],
    ['nominalPowerKw', Infinity],
    ['nominalPowerKw', NaN],
    ['capacityKwp', -1],
    ['moduleTiltDegrees', -0.1],
    ['moduleTiltDegrees', 90.1],
    ['latitude', -90.1],
    ['latitude', 90.1],
    ['longitude', -180.1],
    ['longitude', 180.1],
  ])('rejeita %s=%s', (key, value) => {
    expect(criarUsinaSchema.safeParse({ name: 'Usina', [key]: value }).success).toBe(false);
  });
  it('aceita limites numéricos sem inventar relação AC/DC entre as potências', () => {
    expect(
      criarUsinaSchema.safeParse({
        name: 'Usina',
        nominalPowerKw: 100,
        capacityKwp: 80,
        moduleTiltDegrees: 90,
        latitude: -90,
        longitude: 180,
      }).success,
    ).toBe(true);
  });
  it('valida datas civis, ano bissexto, formato e futuro sem ajuste silencioso', () => {
    expect(
      criarUsinaSchema.parse({ name: 'Usina', operationStartDate: '2024-02-29' }).operationStartDate,
    ).toBe('2024-02-29');
    for (const operationStartDate of [
      '2023-02-29',
      '2024-02-30',
      '2024-13-01',
      '2024-1-01',
      '0000-01-01',
      '9999-01-01',
      '2024-01-01T00:00:00Z',
    ]) {
      expect(criarUsinaSchema.safeParse({ name: 'Usina', operationStartDate }).success).toBe(false);
    }
    expect(detailsForDatabase({ operationStartDate: '2024-02-29' }).operationStartDate?.toISOString()).toBe(
      '2024-02-29T00:00:00.000Z',
    );
    expect(detailsForDatabase({ operationStartDate: null })).toEqual({ operationStartDate: null });
    expect(detailsForDatabase({})).toEqual({});
  });
  it('exige par de coordenadas no estado resultante e permite remoção explícita', () => {
    expect(() => checkCoordinates({ latitude: 0 })).toThrow(BadRequestException);
    expect(() => checkCoordinates({ longitude: 0 })).toThrow(BadRequestException);
    expect(() => checkCoordinates({ latitude: null, longitude: 10 })).toThrow(BadRequestException);
    expect(() => checkCoordinates({ latitude: 0, longitude: 0 })).not.toThrow();
    expect(() => checkCoordinates({ latitude: null, longitude: null })).not.toThrow();
  });
  it('limita textos, valida enum e impede usar fonte remota para campos locais', () => {
    for (const fields of [
      { technicalNotes: 'x'.repeat(5001) },
      { street: '  ' },
      { installationType: 'inventado' },
      { useRemote: ['technicalNotes'] },
    ]) {
      expect(editarUsinaSchema.safeParse({ revision: 0, ...fields }).success).toBe(false);
    }
    expect(criarUsinaSchema.safeParse({ name: 'Usina', installationType: 'HYBRID' }).success).toBe(true);
    expect(editarUsinaSchema.safeParse({ revision: 0, status: 'ONLINE' }).success).toBe(false);
  });
  it.each(['criar', 'editar'] as const)('CLIENT não pode %s; OPERATOR conserva permissão', (method) => {
    const guard = new RolesGuard(new Reflector());
    const context = (role: Role) =>
      ({
        getClass: () => PlantsController,
        getHandler: () => Reflect.get(PlantsController.prototype, method) as unknown,
        switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      }) as unknown as ExecutionContext;
    expect(() => guard.canActivate(context(Role.CLIENT))).toThrow(ForbiddenException);
    expect(guard.canActivate(context(Role.OPERATOR))).toBe(true);
  });
});
