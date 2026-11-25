import { Module } from '@nestjs/common';
import { MeasurementsModule } from '../measurements/measurements.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
@Module({ imports: [MeasurementsModule], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
