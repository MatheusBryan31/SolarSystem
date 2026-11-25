import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  aggregationSchema,
  historySchema,
  type AggregationQuery,
  type HistoryQuery,
} from './measurements.schemas';
import { MeasurementsService } from './measurements.service';

@Controller('plants/:plantId/measurements')
export class MeasurementsController {
  constructor(private readonly service: MeasurementsService) {}
  @Get('sources')
  sources(@Param('plantId', ParseUUIDPipe) id: string, @CurrentUser() user: UsuarioAutenticado) {
    return this.service.sources(id, user);
  }
  @Get()
  history(
    @Param('plantId', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(historySchema)) input: HistoryQuery,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.service.history(id, input, user);
  }
  @Get('aggregations')
  aggregate(
    @Param('plantId', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(aggregationSchema)) input: AggregationQuery,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.service.aggregate(id, input, user);
  }
}
