import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient, Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AlertsModule } from '../src/alerts/alerts.module';
import { AuthModule } from '../src/auth/auth.module';
import { NOME_DO_COOKIE } from '../src/auth/sessao-cookie';
import { ClientsModule } from '../src/clients/clients.module';
import { configurarHttp } from '../src/config/http';
import { InvertersModule } from '../src/inverters/inverters.module';
import { MeasurementsModule } from '../src/measurements/measurements.module';
import { PlantsModule } from '../src/plants/plants.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';

const database = process.env.SOLARSYSTEM_PERMISSIONS_TEST_DATABASE_URL;
const suite = database ? describe : describe.skip;

suite('Isolamento de clientes via HTTP e PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: NestExpressApplication<App>;
  let jwt: JwtService;
  const range = { from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z', includeSimulated: 'true' };
  const zero = '00000000-0000-0000-0000-000000000000';

  beforeAll(async () => {
    const alvo = new URL(database!);
    expect(alvo.hostname).toBe('127.0.0.1');
    expect(alvo.pathname).toBe('/solarsystem_permissions_validation');
    prisma = new PrismaClient({ datasourceUrl: alvo.href });
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          skipProcessEnv: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              JWT_SECRET: 'segredo-exclusivo-do-teste-de-isolamento',
              JWT_EXPIRES_IN: 60,
            }),
          ],
        }),
        PrismaModule,
        AuthModule,
        ClientsModule,
        PlantsModule,
        AlertsModule,
        InvertersModule,
        MeasurementsModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication<NestExpressApplication<App>>();
    configurarHttp(app, { NODE_ENV: 'test', WEB_ORIGIN: 'http://localhost:5173', TRUSTED_PROXY_IPS: [] });
    await app.init();
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  async function sessao(role: Role, clientId: string | null) {
    const usuario = await prisma.user.create({
      data: {
        name: 'Conta de teste',
        email: `${randomUUID()}@example.test`,
        passwordHash: 'fixture',
        role,
        clientId,
      },
    });
    return `${NOME_DO_COOKIE}=${jwt.sign({ sub: usuario.id, role, sv: 0 })}`;
  }

  it('restringe listas, contagens, detalhes, alertas, equipamentos e série temporal ao dono', async () => {
    const nome = randomUUID();
    const a = await prisma.client.create({ data: { name: `Cliente A ${nome}` } });
    const b = await prisma.client.create({ data: { name: `Cliente B ${nome}` } });
    const integracao = await prisma.integration.create({
      data: { provider: 'DEMO', name: 'Conta compartilhada', credentials: { segredo: 'nao-expor' } },
    });
    const criarPlanta = (clientId: string, externalId: string) =>
      prisma.$transaction(async (tx) => {
        const plant = await tx.plant.create({
          data: { name: nome, clientId, integrationId: integracao.id, externalId },
        });
        const link = await tx.plantExternalLink.create({
          data: {
            plantId: plant.id,
            integrationId: integracao.id,
            externalId,
            remoteMetadata: {},
            observedAt: new Date(),
          },
        });
        const inverter = await tx.inverter.create({
          data: {
            plantId: plant.id,
            manufacturer: 'Teste',
            manufacturerKey: 'TESTE',
            model: 'M',
            serialNumber: plant.id,
            serialKey: plant.id.toUpperCase(),
            origin: 'IMPORTED',
            integrationId: integracao.id,
            externalId,
          },
        });
        const alert = await tx.alert.create({
          data: {
            plantId: plant.id,
            integrationId: integracao.id,
            type: 'PLANT_FAULT',
            message: 'Falha da usina',
            severity: 'WARNING',
          },
        });
        await tx.measurement.create({
          data: {
            plantId: plant.id,
            sourceLinkId: link.id,
            sourceProvider: 'DEMO',
            isSimulated: true,
            measuredAt: new Date('2026-01-01T12:00:00Z'),
            quality: 'VALID',
            powerKw: 1,
          },
        });
        return { plant, link, inverter, alert };
      });
    const propria = await criarPlanta(a.id, 'identidade-interna-a');
    const alheia = await criarPlanta(b.id, 'identidade-interna-b');
    await prisma.alert.create({
      data: {
        plantId: propria.plant.id,
        integrationId: integracao.id,
        type: 'SYNC_FAILED',
        message: 'Mensagem interna',
        severity: 'WARNING',
      },
    });

    const cliente = await sessao(Role.CLIENT, a.id);
    const get = (path: string, cookie = cliente) =>
      request(app.getHttpServer())
        .get('/api' + path)
        .set('Cookie', cookie);
    const listas = [
      { path: '/clients', query: { busca: nome }, id: a.id },
      { path: '/plants', query: { busca: nome }, id: propria.plant.id },
      { path: '/alerts', query: {}, id: propria.alert.id },
      { path: `/plants/${propria.plant.id}/inverters`, query: {}, id: propria.inverter.id },
    ];
    for (const lista of listas) {
      const resultado = await get(lista.path)
        .query(lista.query)
        .expect(200)
        .expect('Cache-Control', 'private, no-store');
      const payload = resultado.body as { total: number; itens: { id: string }[] };
      expect(payload.total).toBe(1);
      expect(payload.itens.map((item) => item.id)).toEqual([lista.id]);
    }
    const alertas = await get('/alerts').expect(200);
    expect(alertas.body).toMatchObject({ itens: [{ integrationId: null, integration: null }] });
    await get(`/clients/${a.id}`).expect(200);
    await get(`/clients/${b.id}`).expect(404);
    const planta = await get(`/plants/${propria.plant.id}`).expect(200);
    expect(planta.body).toMatchObject({
      integration: null,
      integrationId: null,
      externalId: null,
      activeLink: { id: propria.link.id },
    });
    const inversor = await get(`/plants/${propria.plant.id}/inverters/${propria.inverter.id}`).expect(200);
    expect(inversor.body).toMatchObject({ integrationId: null, externalId: null });
    for (const path of [
      `/plants/${alheia.plant.id}`,
      `/plants/${alheia.plant.id}/inverters`,
      `/plants/${alheia.plant.id}/inverters/${alheia.inverter.id}`,
      `/plants/${propria.plant.id}/inverters/${alheia.inverter.id}`,
    ])
      await get(path).expect(404);
    const own = `/plants/${propria.plant.id}/measurements`;
    const other = `/plants/${alheia.plant.id}/measurements`;
    const historico = await get(own).query(range).expect(200);
    expect(historico.body).toMatchObject({ total: 1, itens: [{ plantId: propria.plant.id }] });
    await get(other).query(range).expect(404);
    await get(own)
      .query({ ...range, inverterId: alheia.inverter.id })
      .expect(404);
    await get(own)
      .query({ ...range, sourceLinkId: alheia.link.id })
      .expect(404);
    const agregado = { ...range, sourceLinkId: propria.link.id, period: 'day' };
    await get(own + '/aggregations')
      .query(agregado)
      .expect(200);
    await get(other + '/aggregations')
      .query({ ...agregado, sourceLinkId: alheia.link.id })
      .expect(404);
    await get(own + '/aggregations')
      .query({ ...agregado, sourceLinkId: alheia.link.id })
      .expect(404);

    for (const role of [Role.ADMIN, Role.OPERATOR]) {
      const equipe = await sessao(role, null);
      const lista = await get('/plants', equipe).query({ busca: nome }).expect(200);
      expect((lista.body as { itens: { id: string }[] }).itens.map((p) => p.id).sort()).toEqual(
        [propria.plant.id, alheia.plant.id].sort(),
      );
      await get(other, equipe).query(range).expect(200);
    }
    const operador = await sessao(Role.OPERATOR, null);
    await request(app.getHttpServer())
      .patch(`/api/plants/${propria.plant.id}/client`)
      .set('Cookie', operador)
      .set('X-CSRF-Protection', '1')
      .send({ clientId: b.id })
      .expect(200);
    await get(`/plants/${propria.plant.id}`).expect(404);
    await get(own).query(range).expect(404);
    const novoDono = await sessao(Role.CLIENT, b.id);
    await get(`/plants/${propria.plant.id}`, novoDono).expect(200);
  });

  it('cliente sem vínculo recebe listas vazias mesmo se o banco contém um cliente com UUID zero', async () => {
    const cliente = await prisma.client.upsert({
      where: { id: zero },
      update: {},
      create: { id: zero, name: 'Cliente UUID zero' },
    });
    const plant = await prisma.plant.create({
      data: { clientId: cliente.id, origin: 'MANUAL', name: 'Usina UUID zero' },
    });
    await prisma.alert.create({
      data: { plantId: plant.id, message: 'Não pode aparecer', severity: 'WARNING', type: 'PLANT_FAULT' },
    });
    const cookie = await sessao(Role.CLIENT, null);
    for (const path of ['/clients', '/plants', '/alerts']) {
      const resposta = await request(app.getHttpServer())
        .get('/api' + path)
        .set('Cookie', cookie)
        .expect(200);
      expect(resposta.body).toMatchObject({ itens: [], total: 0 });
    }
    for (const path of [`/plants/${plant.id}`, `/plants/${plant.id}/inverters`]) {
      await request(app.getHttpServer())
        .get('/api' + path)
        .set('Cookie', cookie)
        .expect(404);
    }
    await request(app.getHttpServer())
      .get(`/api/plants/${plant.id}/measurements`)
      .set('Cookie', cookie)
      .query(range)
      .expect(404);
  });
});
