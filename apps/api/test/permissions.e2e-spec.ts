import { RequestMethod, Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AlertsController } from '../src/alerts/alerts.controller';
import { AlertsService } from '../src/alerts/alerts.service';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { AuthController } from '../src/auth/auth.controller';
import { AuthModule } from '../src/auth/auth.module';
import { AuthService } from '../src/auth/auth.service';
import { PasswordService } from '../src/auth/password.service';
import { NOME_DO_COOKIE } from '../src/auth/sessao-cookie';
import { ClientsController } from '../src/clients/clients.controller';
import { ClientsService } from '../src/clients/clients.service';
import { configurarHttp } from '../src/config/http';
import { IntegrationsController } from '../src/integrations/integrations.controller';
import { IntegrationsService } from '../src/integrations/integrations.service';
import { InvertersController } from '../src/inverters/inverters.controller';
import { InvertersService } from '../src/inverters/inverters.service';
import { MeasurementsController } from '../src/measurements/measurements.controller';
import { MeasurementsService } from '../src/measurements/measurements.service';
import { PlantsController } from '../src/plants/plants.controller';
import { PlantsService } from '../src/plants/plants.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProviderRegistry } from '../src/providers/provider-registry';
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';

const id = '11111111-1111-4111-8111-111111111111';
const email = 'teste@example.test';
const senha = 'SenhaSomenteTeste1';
const token = 't'.repeat(43);
const range = { from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' };
const admin = [Role.ADMIN];
const equipe = [Role.ADMIN, Role.OPERATOR];
const todos = Object.values(Role);

type Rota = {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  allowed: Role[] | 'public';
  status: number;
  body?: object;
  query?: object;
};

const routes: Rota[] = [
  { method: 'get', path: '/health', allowed: 'public', status: 200 },
  { method: 'post', path: '/auth/login', allowed: 'public', status: 200, body: { email, senha } },
  { method: 'post', path: '/auth/logout', allowed: 'public', status: 204 },
  { method: 'post', path: '/auth/password/forgot', allowed: 'public', status: 202, body: { email } },
  {
    method: 'post',
    path: '/auth/password/reset',
    allowed: 'public',
    status: 204,
    body: { token, novaSenha: senha },
  },
  {
    method: 'post',
    path: '/auth/password/change',
    allowed: todos,
    status: 204,
    body: { senhaAtual: senha, novaSenha: senha },
  },
  { method: 'get', path: '/auth/me', allowed: todos, status: 200 },
  { method: 'get', path: '/users', allowed: admin, status: 200 },
  { method: 'get', path: '/users/:id', allowed: admin, status: 200 },
  { method: 'post', path: '/users', allowed: admin, status: 201, body: { name: 'Teste', email, senha } },
  { method: 'patch', path: '/users/:id', allowed: admin, status: 200, body: { name: 'Teste' } },
  { method: 'get', path: '/clients', allowed: todos, status: 200 },
  { method: 'get', path: '/clients/:id', allowed: todos, status: 200 },
  { method: 'post', path: '/clients', allowed: equipe, status: 201, body: { name: 'Teste' } },
  { method: 'patch', path: '/clients/:id', allowed: equipe, status: 200, body: { name: 'Teste' } },
  { method: 'delete', path: '/clients/:id', allowed: admin, status: 204 },
  { method: 'get', path: '/plants', allowed: todos, status: 200 },
  { method: 'get', path: '/plants/:id', allowed: todos, status: 200 },
  { method: 'post', path: '/plants', allowed: equipe, status: 201, body: { name: 'Teste' } },
  {
    method: 'patch',
    path: '/plants/:id',
    allowed: equipe,
    status: 200,
    body: { name: 'Teste', revision: 0 },
  },
  { method: 'patch', path: '/plants/:id/client', allowed: equipe, status: 200, body: { clientId: id } },
  { method: 'get', path: '/plants/:id/external-links', allowed: admin, status: 200 },
  {
    method: 'post',
    path: '/plants/:id/external-link',
    allowed: admin,
    status: 201,
    body: { integrationId: id, externalId: 'externo', revision: 0 },
  },
  {
    method: 'post',
    path: '/plants/:id/external-link/detach',
    allowed: admin,
    status: 201,
    body: { revision: 0, reason: 'Teste' },
  },
  { method: 'get', path: '/plants/:plantId/inverters', allowed: todos, status: 200 },
  { method: 'get', path: '/plants/:plantId/inverters/:id', allowed: todos, status: 200 },
  {
    method: 'post',
    path: '/plants/:plantId/inverters',
    allowed: equipe,
    status: 201,
    body: { manufacturer: 'Teste', model: 'M', serialNumber: 'SN' },
  },
  {
    method: 'patch',
    path: '/plants/:plantId/inverters/:id',
    allowed: equipe,
    status: 200,
    body: { revision: 0, model: 'N' },
  },
  {
    method: 'delete',
    path: '/plants/:plantId/inverters/:id',
    allowed: admin,
    status: 200,
    body: { revision: 0, confirmSerialNumber: 'SN', reason: 'Teste' },
  },
  { method: 'get', path: '/plants/:plantId/measurements', allowed: todos, status: 200, query: range },
  {
    method: 'get',
    path: '/plants/:plantId/measurements/aggregations',
    allowed: todos,
    status: 200,
    query: { ...range, sourceLinkId: id, period: 'day' },
  },
  { method: 'get', path: '/alerts', allowed: todos, status: 200 },
  { method: 'patch', path: '/alerts/:id/ack', allowed: equipe, status: 200 },
  { method: 'get', path: '/providers', allowed: equipe, status: 200 },
  { method: 'get', path: '/integrations', allowed: equipe, status: 200 },
  {
    method: 'post',
    path: '/integrations',
    allowed: admin,
    status: 201,
    body: { name: 'Teste', provider: 'DEMO' },
  },
  {
    method: 'patch',
    path: '/integrations/:id',
    allowed: admin,
    status: 200,
    body: { revision: 0, enabled: true },
  },
  { method: 'post', path: '/integrations/:id/sync', allowed: equipe, status: 200 },
  { method: 'get', path: '/integrations/:id/discoveries', allowed: equipe, status: 200 },
  {
    method: 'post',
    path: '/integrations/:id/discoveries/:discoveryId/import',
    allowed: admin,
    status: 201,
    body: { revision: 0 },
  },
];

const controllers = [
  AppController,
  AlertsController,
  ClientsController,
  IntegrationsController,
  InvertersController,
  MeasurementsController,
  PlantsController,
  UsersController,
];
const services = [
  AppService,
  AlertsService,
  ClientsService,
  IntegrationsService,
  InvertersService,
  MeasurementsService,
  PlantsService,
  ProviderRegistry,
  UsersService,
];

function double(service: Type) {
  return Object.fromEntries(
    Object.getOwnPropertyNames(service.prototype as object)
      .filter((key) => key !== 'constructor')
      .map((key) => [key, jest.fn(() => ({ ok: true }))]),
  );
}

describe('Matriz HTTP de autorização', () => {
  let app: NestExpressApplication<App>;
  let jwt: JwtService;
  const findUnique = jest.fn(({ where: { id: role } }: { where: { id: Role } }) => ({
    id: role,
    role,
    email,
    name: role,
    active: true,
    clientId: id,
    sessionVersion: 0,
  }));

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          skipProcessEnv: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              JWT_SECRET: 'segredo-exclusivo-da-matriz-de-testes',
              JWT_EXPIRES_IN: 60,
            }),
          ],
        }),
        PrismaModule,
        AuthModule,
      ],
      controllers,
      providers: services.map((service) => ({ provide: service, useValue: double(service) })),
    })
      .overrideProvider(PrismaService)
      .useValue({ user: { findUnique } })
      .overrideProvider(AuthService)
      .useValue({ login: () => ({ accessToken: 'teste', usuario: {} }) })
      .overrideProvider(PasswordService)
      .useValue(double(PasswordService))
      .compile();
    app = module.createNestApplication<NestExpressApplication<App>>();
    configurarHttp(app, { NODE_ENV: 'test', WEB_ORIGIN: 'http://localhost:5173', TRUSTED_PROXY_IPS: [] });
    await app.init();
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('inclui todos os métodos HTTP registrados nos controllers auditados', () => {
    const declaradas = [...controllers, AuthController].flatMap((controller) => {
      const prefixo = Reflect.getMetadata(PATH_METADATA, controller) as string;
      const prototype = controller.prototype as object;
      return Object.values(Object.getOwnPropertyDescriptors(prototype)).flatMap((descriptor) => {
        const handler: unknown = descriptor.value;
        if (typeof handler !== 'function' || !Reflect.hasMetadata(METHOD_METADATA, handler)) return [];
        const metodo = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod;
        const caminho = Reflect.getMetadata(PATH_METADATA, handler) as string;
        return `${RequestMethod[metodo].toLowerCase()} /${[prefixo, caminho]
          .map((parte) => parte.replace(/^\/|\/$/g, ''))
          .filter(Boolean)
          .join('/')}`;
      });
    });
    expect(routes.map(({ method, path }) => `${method} ${path}`).sort()).toEqual(declaradas.sort());
  });

  it.each(routes)('$method $path verifica anônimo, ADMIN, OPERATOR e CLIENT', async (rota) => {
    for (const role of [null, ...todos]) {
      const url = '/api' + rota.path.replace(/:\w+/g, id);
      const req = request(app.getHttpServer())[rota.method](url).set('X-CSRF-Protection', '1');
      if (role) req.set('Cookie', `${NOME_DO_COOKIE}=${jwt.sign({ sub: role, role, sv: 0 })}`);
      if (rota.body) req.send(rota.body);
      if (rota.query) req.query(rota.query);
      const status =
        rota.allowed === 'public' || (role && rota.allowed.includes(role)) ? rota.status : role ? 403 : 401;
      await req.expect(status);
    }
  });

  it('não ecoa conteúdo do corpo em erros de parsing ou validação da integração', async () => {
    const post = () =>
      request(app.getHttpServer())
        .post('/api/integrations')
        .set('X-CSRF-Protection', '1')
        .set('Cookie', `${NOME_DO_COOKIE}=${jwt.sign({ sub: Role.ADMIN, role: Role.ADMIN })}`);
    const malformado = await post()
      .type('json')
      .send('{"credentials":{"amostra-secreta": falha}}')
      .expect(400);
    expect(malformado.text).not.toContain('amostra-secreta');
    const invalido = await post()
      .send({ name: 'Conta teste', provider: 'DEMO', credentials: { 'amostra-secreta': 123 } })
      .expect(400);
    expect(invalido.text).not.toContain('amostra-secreta');
  });
});
