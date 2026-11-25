import { Injectable } from '@nestjs/common';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { MeasurementsService } from '../measurements/measurements.service';
import type { AggregationQuery } from '../measurements/measurements.schemas';
import { reportCsv, reportPdf } from './report-renderer';
@Injectable()
export class ReportsService {
  constructor(private readonly measurements: MeasurementsService) {}
  async generate(plantId: string, query: AggregationQuery, user: UsuarioAutenticado) {
    return {
      plantId,
      generatedAt: new Date().toISOString(),
      ...(await this.measurements.reportAggregate(plantId, query, user)),
      from: new Date(query.from).toISOString(),
      to: new Date(query.to).toISOString(),
    };
  }
  async csv(plantId: string, query: AggregationQuery, user: UsuarioAutenticado) {
    return reportCsv(await this.generate(plantId, query, user));
  }
  async pdf(plantId: string, query: AggregationQuery, user: UsuarioAutenticado) {
    return reportPdf(await this.generate(plantId, query, user));
  }
}
