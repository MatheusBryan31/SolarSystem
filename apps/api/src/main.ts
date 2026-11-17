import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api'); // todas as rotas começam com /api
  await app.listen(3333); // porta do gabarito
  console.log('SolarSystem API em http://localhost:3333/api');
}
void bootstrap();
