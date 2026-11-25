import { DEFAULT_POLICY, generationCondition, policySchema } from './alert-policy';
const now = new Date('2026-11-24T15:00:00Z');
const policy = { ...DEFAULT_POLICY, generationEnabled: true };
const samples = (power: number) =>
  [0, 5, 10].map((min) => ({
    measuredAt: new Date(now.getTime() - min * 60000),
    powerKw: power,
    quality: 'VALID' as const,
    isSimulated: false,
  }));
describe('Geração anormal com evidência persistida', () => {
  it('detecta baixa/alta sustentadas e recuperação normal', () => {
    expect(generationCondition(samples(0), 10, policy, now)).toBe('LOW');
    expect(generationCondition(samples(20), 10, policy, now)).toBe('HIGH');
    expect(generationCondition(samples(5), 10, policy, now)).toBe('NORMAL');
  });
  it('regra desabilitada, potência desconhecida e capacidade inválida não inventam condição', () => {
    expect(generationCondition(samples(0), 10, DEFAULT_POLICY, now)).toBeNull();
    expect(generationCondition(samples(0), null, policy, now)).toBeNull();
    expect(generationCondition(samples(0), Infinity, policy, now)).toBeNull();
  });
  it('ignora noite, amostras antigas, futuras e falta de persistência', () => {
    expect(generationCondition(samples(0), 10, policy, new Date('2026-11-24T23:00:00Z'))).toBeNull();
    expect(generationCondition(samples(0), 10, policy, new Date(now.getTime() - 1000))).toBeNull();
    expect(generationCondition(samples(0).slice(0, 2), 10, policy, now)).toBeNull();
  });
  it('não atravessa amostra inválida, sem potência ou lacuna para concluir', () => {
    const rows = samples(0);
    expect(
      generationCondition([{ ...rows[0], powerKw: null }, ...rows.slice(1)], 10, policy, now),
    ).toBeNull();
    expect(
      generationCondition([{ ...rows[0], quality: 'INVALID' }, ...rows.slice(1)], 10, policy, now),
    ).toBeNull();
    expect(
      generationCondition([{ ...rows[0], quality: 'PARTIAL' }, ...rows.slice(1)], 10, policy, now),
    ).toBeNull();
    expect(
      generationCondition([{ ...rows[0], quality: 'PARTIAL' }, ...rows.slice(1)], 10, policy, now),
    ).toBeNull();
    expect(
      generationCondition(
        [rows[0], { ...rows[1], measuredAt: new Date(now.getTime() - 61 * 60000) }, rows[2]],
        10,
        policy,
        now,
      ),
    ).toBeNull();
  });
  it('DEMO exige opt-in e não vira dado real', () => {
    const rows = samples(0).map((r) => ({ ...r, isSimulated: true }));
    expect(generationCondition(rows, 10, policy, now)).toBeNull();
    expect(generationCondition(rows, 10, { ...policy, allowSimulated: true }, now)).toBe('LOW');
  });
  it('valida limites, janela e fuso', () => {
    expect(policySchema.safeParse({ ...policy, timeZone: 'Invalid/Zone' }).success).toBe(false);
    expect(policySchema.safeParse({ ...policy, dayStartHour: 17, dayEndHour: 8 }).success).toBe(false);
    expect(policySchema.safeParse({ ...policy, lowPowerRatio: 2, highPowerRatio: 1 }).success).toBe(false);
  });
});
