import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  const prismaFalso = { $queryRaw: jest.fn() };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: PrismaService, useValue: prismaFalso }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('responde ok quando o banco responde', async () => {
    prismaFalso.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    await expect(appController.getHealth()).resolves.toMatchObject({ status: 'ok', banco: 'ok' });
  });

  it('responde degradado quando o banco falha', async () => {
    prismaFalso.$queryRaw.mockRejectedValue(new Error('sem conexão'));
    await expect(appController.getHealth()).resolves.toMatchObject({ status: 'degradado', banco: 'erro' });
  });
});
