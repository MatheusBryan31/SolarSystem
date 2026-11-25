import { reportCsv, reportPdf, type Report } from './report-renderer';
import { ReportsService } from './reports.service';
import { MeasurementsService } from '../measurements/measurements.service';
import type { UsuarioAutenticado } from '../auth/auth.types';
const report: Report = {
  plantId: 'plant',
  sourceLinkId: 'source',
  generatedAt: '2026-11-24T12:00:00Z',
  from: '2026-01-01T00:00:00Z',
  to: '2027-01-01T00:00:00Z',
  period: 'month',
  timeZone: 'UTC',
  inverterId: null,
  includesSimulated: false,
  buckets: [
    {
      bucket: '2026-01',
      samples: 2,
      usableSamples: 2,
      peakPowerKw: 3,
      observedPeriodEnergyKwh: null,
      acceptedPeriods: 0,
      excludedPeriods: 0,
      simulated: false,
      coverage: 'NOT_ESTABLISHED',
    },
  ],
};
describe('CSV e PDF com dados persistidos', () => {
  it('CSV mantém desconhecidos vazios, identifica cobertura e protege fórmula', () => {
    const csv = reportCsv(report).toString('utf8');
    expect(csv).toContain('NOT_ESTABLISHED');
    expect(csv).toContain('"3";"";"2"');
    expect(reportCsv({ ...report, plantId: '=formula' }).toString('utf8')).toContain("'=formula");
  });
  it('PDF finalizado inclui estrutura válida mesmo sem medições', async () => {
    for (const data of [report, { ...report, buckets: [] }]) {
      const pdf = await reportPdf(data);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.subarray(-20).toString()).toContain('%%EOF');
      expect(pdf.length).toBeGreaterThan(1000);
    }
  });
  it('relatório reutiliza escopo e usuário da consulta de medições', async () => {
    const aggregate = jest.fn().mockResolvedValue(report);
    const service = new ReportsService({ reportAggregate: aggregate } as unknown as MeasurementsService);
    const user = { id: 'u' } as UsuarioAutenticado;
    const query = {
      from: report.from,
      to: report.to,
      sourceLinkId: 'source',
      period: 'month' as const,
      timeZone: 'UTC',
      includeSimulated: false,
    };
    await service.generate('plant', query, user);
    expect(aggregate).toHaveBeenCalledWith('plant', query, user);
    aggregate.mockRejectedValue(new Error('Sem permissão'));
    await expect(service.pdf('plant', query, user)).rejects.toThrow('Sem permissão');
  });
});
