import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // qualquer módulo pode injetar o PrismaService sem importar este módulo
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
