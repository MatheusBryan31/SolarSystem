import { Module } from '@nestjs/common';
import { InvertersController } from './inverters.controller';
import { InvertersService } from './inverters.service';

@Module({ controllers: [InvertersController], providers: [InvertersService] })
export class InvertersModule {}
