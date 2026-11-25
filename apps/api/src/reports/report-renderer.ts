import PDFDocument from 'pdfkit';
import type { MeasurementsService } from '../measurements/measurements.service';

export type Report = Awaited<ReturnType<MeasurementsService['aggregate']>> & {
  plantId: string;
  generatedAt: string;
};
const value = (number: number | null) => (number === null ? 'Não disponível' : String(number));
export function reportCsv(report: Report): Buffer {
  const lines: (string | number | boolean | null | undefined)[][] = [
    [
      'Usina',
      'Fonte',
      'Início UTC',
      'Fim exclusivo UTC',
      'Agrupamento',
      'Fuso',
      'Período',
      'Pico observado kW',
      'Energia de períodos observados kWh',
      'Amostras',
      'Períodos aceitos',
      'Períodos excluídos',
      'Simulado',
      'Cobertura',
    ],
  ];
  for (const b of report.buckets)
    lines.push([
      report.plantId,
      report.sourceLinkId,
      report.from,
      report.to,
      report.period,
      report.timeZone,
      b.bucket,
      b.peakPowerKw,
      b.observedPeriodEnergyKwh,
      b.samples,
      b.acceptedPeriods,
      b.excludedPeriods,
      b.simulated ? 'SIMULADO' : 'NÃO SIMULADO',
      b.coverage,
    ]);
  return Buffer.from(
    '\ufeff' +
      lines
        .map((line) =>
          line
            .map(
              (cell) =>
                `"${String(cell ?? '')
                  .replace(/^[=+@-]/, "'$&")
                  .replaceAll('"', '""')}"`,
            )
            .join(';'),
        )
        .join('\r\n'),
    'utf8',
  );
}
export function reportPdf(report: Report): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 42,
      bufferPages: true,
      info: { Title: 'SolarSystem - relatório de geração', Author: 'SolarSystem' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const header = () => {
      doc.fillColor('#081f41').fontSize(21).text('SolarSystem | Relatório de geração');
      doc
        .fontSize(9)
        .moveDown()
        .text(
          `Usina: ${report.plantId}\nFonte: ${report.sourceLinkId}\n${report.from} até ${report.to} (fim exclusivo)\nAgrupamento: ${report.period} | Fuso: ${report.timeZone}\nEmitido em UTC: ${report.generatedAt}`,
        );
      doc
        .moveDown()
        .fillColor('#855b13')
        .text(
          'Energia desconhecida não é zero. Não somamos potência nem acumuladores. Cobertura completa não estabelecida.',
        );
      if (report.buckets.some((b) => b.simulated))
        doc.text('CONTÉM DADOS SIMULADOS (DEMO). Não representa geração real.');
      doc.fillColor('#102341').moveDown();
    };
    header();
    if (!report.buckets.length) doc.fontSize(12).text('Sem medições para os filtros informados.');
    const max = Math.max(1, ...report.buckets.map((b) => b.peakPowerKw ?? 0));
    for (const bucket of report.buckets) {
      if (doc.y > 700) {
        doc.addPage();
        header();
      }
      const y = doc.y;
      doc
        .fillColor('#081f41')
        .fontSize(11)
        .text(`${bucket.bucket}${bucket.simulated ? ' | SIMULADO' : ''}`);
      doc
        .fontSize(9)
        .fillColor('#102341')
        .text(
          `Pico observado: ${value(bucket.peakPowerKw)} kW | Energia de período: ${value(bucket.observedPeriodEnergyKwh)} kWh`,
        );
      doc.text(
        `${bucket.samples} amostras | ${bucket.acceptedPeriods} períodos aceitos | ${bucket.excludedPeriods} excluídos`,
      );
      if (bucket.peakPowerKw !== null)
        doc.rect(42, doc.y + 3, Math.max(1, (430 * bucket.peakPowerKw) / max), 5).fill('#0878ed');
      doc.y = Math.max(doc.y + 18, y + 65);
    }
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .fillColor('#526880')
        .text(`Página ${i + 1} de ${range.count}`, 42, doc.page.height - 55, { lineBreak: false });
    }
    doc.end();
  });
}
