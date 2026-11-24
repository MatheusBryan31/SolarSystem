import { Module } from '@nestjs/common';
import { PlantsController } from './plants.controller';
import { PlantsService } from './plants.service';
import { PlantCatalogService } from './plant-catalog.service';

@Module({
  controllers: [PlantsController],
  providers: [PlantsService, PlantCatalogService],
  exports: [PlantCatalogService],
})
export class PlantsModule {}
