import { Module } from '@nestjs/common';
import { PlantsController } from './plants.controller';
import { PlantsService } from './plants.service';

@Module({
  controllers: [PlantsController],
  providers: [PlantsService],
})
export class PlantsModule {}
