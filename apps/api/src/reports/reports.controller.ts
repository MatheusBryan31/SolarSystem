import { Controller, Get, Param, ParseUUIDPipe, Query, StreamableFile } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { aggregationSchema, type AggregationQuery } from '../measurements/measurements.schemas';
import { ReportsService } from './reports.service';
@Controller('plants/:plantId/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get() generate(
    @Param('plantId', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(aggregationSchema)) query: AggregationQuery,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.reports.generate(id, query, user);
  }
  @Get('csv') async csv(
    @Param('plantId', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(aggregationSchema)) query: AggregationQuery,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return new StreamableFile(await this.reports.csv(id, query, user), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="solarsystem-${query.period}.csv"`,
    });
  }
  @Get('pdf') async pdf(
    @Param('plantId', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(aggregationSchema)) query: AggregationQuery,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return new StreamableFile(await this.reports.pdf(id, query, user), {
      type: 'application/pdf',
      disposition: `attachment; filename="solarsystem-${query.period}.pdf"`,
    });
  }
}
