import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { AuthModule } from '../src/auth/auth.module';
import { NOME_DO_COOKIE } from '../src/auth/sessao-cookie';
import { configurarHttp } from '../src/config/http';
import { PlantsModule } from '../src/plants/plants.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersModule } from '../src/users/users.module';
import { MeasurementsModule } from '../src/measurements/measurements.module';

const SENHA = 'SenhaApenasParaTeste123';
const ADMIN = '11111111-1111-4111-8111-111111111111';
const OPERADOR = '22222222-2222-4222-8222-222222222222';
const CLIENTE = '33333333-3333-4333-8333-333333333333';
const USINA = '44444444-4444-4444-8444-444444444444';
const DONO = '55555555-5555-4555-8555-555555555555';
const ORIGEM_LOCAL = 'http://localhost:5173';
const ORIGEM_PUBLICA = 'https://painel.example.test';

interface TestUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  sessionVersion: number;
  role: Role;
  active: boolean;
  clientId: string | null;
}

describe('API HTTP — saúde, sessão e permissões com Prisma isolado', () => {
  let app: NestExpressApplication;
  let jwt: JwtService;
  let passwordHash: string;
  let users: TestUser[];
  const prisma = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    user: { findUnique: jest.fn(), count: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    plant: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    plantAuditEvent: { create: jest.fn() },
    measurement: { count: jest.fn(), findMany: jest.fn() },
    plantExternalLink: { findFirst: jest.fn() },
    inverter: { findFirst: jest.fn() },
  };

  beforeAll(async () => {
    passwordHash = await hash(SENHA, 4); // Custo baixo apenas nas fixtures, compare real.
  });

  async function iniciarApp(ambiente: 'development' | 'production', proxies: string[] = []) {
    // Não importar AppModule: evita .env, banco e bootstrap do SyncScheduler.
    // Controllers, serviços, validação, JWT e ambos os guards permanecem reais.
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [
            () => ({
              NODE_ENV: ambiente,
              JWT_SECRET: 'segredo-exclusivo-dos-testes-nao-usar-em-producao',
              JWT_EXPIRES_IN: 60,
            }),
          ],
        }),
        PrismaModule,
        AuthModule,
        UsersModule,
        PlantsModule,
        MeasurementsModule,
      ],
      controllers: [AppController],
      providers: [AppService],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    configurarHttp(app, {
      NODE_ENV: ambiente,
      WEB_ORIGIN: ambiente === 'production' ? ORIGEM_PUBLICA : ORIGEM_LOCAL,
      TRUSTED_PROXY_IPS: proxies,
    });
    await app.init();
    jwt = app.get(JwtService);
  }

  beforeEach(async () => {
    await iniciarApp('development');
    jest.resetAllMocks();
    users = [
      { id: ADMIN, name: 'Admin teste', email: 'admin@example.test', role: Role.ADMIN, clientId: null },
      {
        id: OPERADOR,
        name: 'Operador teste',
        email: 'operator@example.test',
        role: Role.OPERATOR,
        clientId: null,
      },
      { id: CLIENTE, name: 'Cliente teste', email: 'client@example.test', role: Role.CLIENT, clientId: DONO },
    ].map((user) => ({ ...user, active: true, passwordHash, sessionVersion: 0 }));
    prisma.$queryRaw.mockResolvedValue([{ resultado: 1 }]);
    prisma.user.findUnique.mockImplementation(({ where }: { where: { id?: string; email?: string } }) =>
      Promise.resolve(
        users.find((user) => (where.id ? user.id === where.id : user.email === where.email)) ?? null,
      ),
    );
    prisma.user.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.plant.count.mockResolvedValue(0);
    prisma.plant.findMany.mockResolvedValue([]);
    prisma.plant.findFirst.mockResolvedValue({ id: USINA, clientId: null });
    prisma.plant.update.mockResolvedValue({ id: USINA, clientId: null });
    prisma.$transaction.mockImplementation(
      (queries: Promise<unknown>[] | ((tx: typeof prisma) => Promise<unknown>)) =>
        typeof queries === 'function' ? queries(prisma) : Promise.all(queries),
    );
    prisma.plant.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: USINA,
        clientId: null,
        client: null,
        integration: null,
        integrationId: null,
        externalId: null,
        lastDataAt: null,
        currentPowerKw: null,
        todayEnergyKwh: null,
        totalEnergyKwh: null,
        externalLinks: [],
        revision: 0,
        ...data,
      }),
    );
  });

  afterEach(async () => {
    await app?.close();
  });

  async function login(email = 'admin@example.test') {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-CSRF-Protection', '1')
      .send({ email, senha: SENHA })
      .expect(200);
    const setCookie = response.get('Set-Cookie')?.[0];
    if (!setCookie) throw new Error('Login não emitiu cookie');
    return { response, setCookie, cookie: setCookie.split(';')[0] };
  }

  it('permite CORS com credenciais somente para a origem exata configurada', async () => {
    const preflight = (origem: string) =>
      request(app.getHttpServer())
        .options('/api/auth/login')
        .set('Origin', origem)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,x-csrf-protection');

    const permitido = await preflight(ORIGEM_LOCAL)
      .expect(204)
      .expect('Access-Control-Allow-Origin', ORIGEM_LOCAL)
      .expect('Access-Control-Allow-Credentials', 'true')
      .expect('Vary', /\bOrigin\b/);
    expect(permitido.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain('x-csrf-protection');

    for (const origem of ['null', 'http://localhost:5174', 'http://painel.localhost:5173']) {
      const negado = await preflight(origem);
      expect(negado.get('Access-Control-Allow-Origin')).toBeUndefined();
      expect(negado.get('Access-Control-Allow-Credentials')).toBeUndefined();
    }
  });

  it('bloqueia login, logout e escrita autenticada sem proteção CSRF ou com origem indevida', async () => {
    const { cookie } = await login();
    prisma.user.findUnique.mockClear();
    const negado = (origem: string) =>
      request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .set('Origin', origem)
        .set('X-CSRF-Protection', '1');

    const loginNegado = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', ORIGEM_LOCAL)
      .send({ email: 'admin@example.test', senha: SENHA })
      .expect(403)
      .expect('Access-Control-Allow-Origin', ORIGEM_LOCAL);
    expect(loginNegado.get('Set-Cookie')).toBeUndefined();
    for (const origem of ['null', 'http://localhost:5174']) {
      const logoutNegado = await negado(origem).expect(403);
      expect(logoutNegado.get('Set-Cookie')).toBeUndefined();
    }
    await request(app.getHttpServer())
      .patch(`/api/plants/${USINA}`)
      .set('Cookie', cookie)
      .set('Origin', ORIGEM_LOCAL)
      .send({ name: 'Mudança' })
      .expect(403);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.plant.update).not.toHaveBeenCalled();

    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Origin', ORIGEM_LOCAL)
      .set('X-CSRF-Protection', '1')
      .set('Cookie', cookie)
      .expect(204);
  });

  it('em produção rejeita HTTP e ignora indicação de HTTPS de um proxy sem confiança', async () => {
    await app.close();
    await iniciarApp('production');
    const resposta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-Proto', 'https')
      .set('X-CSRF-Protection', '1')
      .send({ email: 'admin@example.test', senha: SENHA })
      .expect(403);
    expect(resposta.get('Set-Cookie')).toBeUndefined();
    expect(resposta.get('Strict-Transport-Security')).toBeUndefined();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('em produção reconhece HTTPS pelo proxy permitido e emite e limpa cookie Secure', async () => {
    await app.close();
    await iniciarApp('production', ['127.0.0.1', '::1']);
    await request(app.getHttpServer()).get('/api/health').set('X-Forwarded-Proto', 'http').expect(403);
    const loginSeguro = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-Proto', 'https')
      .set('Origin', ORIGEM_PUBLICA)
      .set('X-CSRF-Protection', '1')
      .send({ email: 'admin@example.test', senha: SENHA })
      .expect('Access-Control-Allow-Origin', ORIGEM_PUBLICA)
      .expect('Strict-Transport-Security', 'max-age=31536000')
      .expect(200);
    const logoutSeguro = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('X-Forwarded-Proto', 'https')
      .set('Origin', ORIGEM_PUBLICA)
      .set('X-CSRF-Protection', '1')
      .expect(204);
    for (const resposta of [loginSeguro, logoutSeguro]) {
      const cookie = resposta.get('Set-Cookie')?.[0];
      for (const atributo of ['Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/api']) {
        expect(cookie).toContain(atributo);
      }
      expect(cookie).not.toContain('Domain=');
    }
    expect(logoutSeguro.get('Set-Cookie')?.[0]).toContain(`${NOME_DO_COOKIE}=;`);
  });

  it.each([
    ['admin@example.test', 201],
    ['operator@example.test', 201],
    ['client@example.test', 403],
  ])('cadastro manual respeita perfil %s (HTTP %i)', async (email, status) => {
    const { cookie } = await login(email);
    const response = await request(app.getHttpServer())
      .post('/api/plants')
      .set('X-CSRF-Protection', '1')
      .set('Cookie', cookie)
      .send({ name: 'Minha usina', capacityKwp: 30 })
      .expect(status);
    if (status === 201) {
      expect(response.body).toMatchObject({
        id: USINA,
        origin: 'MANUAL',
        integrationId: null,
        monitoring: 'UNLINKED',
        status: 'UNKNOWN',
        currentPowerKw: null,
      });
      expect(prisma.plantAuditEvent.create).toHaveBeenCalled();
    } else expect(prisma.plant.create).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'Usina teste', integrationId: ADMIN },
    { name: 'Usina teste', origin: 'IMPORTED' },
    { name: 'Usina teste', status: 'ONLINE' },
    { name: 'Usina teste', capacityKwp: -1 },
  ])('não aceita controle de identidade/telemetria ou capacidade inválida: %j', async (body) => {
    const { cookie } = await login();
    await request(app.getHttpServer())
      .post('/api/plants')
      .set('X-CSRF-Protection', '1')
      .set('Cookie', cookie)
      .send(body)
      .expect(400);
    expect(prisma.plant.create).not.toHaveBeenCalled();
  });

  it('revisão antiga impede sobrescrever cadastro', async () => {
    const { cookie } = await login();
    prisma.plant.findUnique.mockResolvedValue({ id: USINA, revision: 2 });
    await request(app.getHttpServer())
      .patch(`/api/plants/${USINA}`)
      .set('X-CSRF-Protection', '1')
      .set('Cookie', cookie)
      .send({ revision: 1, name: 'Nome novo' })
      .expect(409);
    expect(prisma.plant.update).not.toHaveBeenCalled();
  });

  it.each(['external-link', 'external-link/detach'])('operador não altera %s', async (route) => {
    const { cookie } = await login('operator@example.test');
    await request(app.getHttpServer())
      .post(`/api/plants/${USINA}/${route}`)
      .set('X-CSRF-Protection', '1')
      .set('Cookie', cookie)
      .send({ revision: 0, integrationId: ADMIN, externalId: '001', reason: 'Teste seguro' })
      .expect(403);
  });

  it('GET /api/health é público e informa banco disponível', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);
    const { horario } = response.body as { horario: string };
    expect(response.body).toEqual({
      status: 'ok',
      banco: 'ok',
      servico: 'solarsystem-api',
      horario,
    });
    expect(typeof horario).toBe('string');
    expect(Number.isNaN(Date.parse(horario))).toBe(false);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('falha de banco mantém saúde degradada com HTTP 200, sem expor erro interno', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('erro interno confidencial'));
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(response.body).toMatchObject({ status: 'degradado', banco: 'erro', servico: 'solarsystem-api' });
    expect(JSON.stringify(response.body)).not.toContain('erro interno confidencial');
  });

  it('correlaciona a falha interna sem devolver ou registrar dados da requisição e da exceção', async () => {
    const { cookie } = await login();
    const segredo = 'ana-secreta@example.test';
    prisma.plant.findMany.mockRejectedValue(new Error(`Falha com ${segredo}`));
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    try {
      const resposta = await request(app.getHttpServer())
        .get('/api/plants')
        .query({ busca: segredo })
        .set('X-Request-Id', segredo)
        .set('Cookie', cookie)
        .expect(500)
        .expect('Cache-Control', 'no-store');
      const requestId = resposta.get('X-Request-Id');
      expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(resposta.body).toEqual({
        statusCode: 500,
        message: 'Não foi possível concluir a requisição.',
        requestId,
      });
      expect(logger.mock.calls).toEqual([[{ event: 'api.request_failed', statusCode: 500, requestId }]]);
      expect(resposta.text).not.toContain(segredo);
    } finally {
      logger.mockRestore();
    }
  });

  it('rota inexistente não ecoa o caminho fornecido', async () => {
    const resposta = await request(app.getHttpServer()).get('/api/dado-pessoal-no-caminho').expect(404);
    expect(resposta.text).not.toContain('dado-pessoal-no-caminho');
    expect(resposta.get('X-Request-Id')).toBeDefined();
  });

  it.each(['/health', '/', '/api'])('não publica a rota antiga/sem prefixo %s', async (path) => {
    await request(app.getHttpServer()).get(path).expect(404);
  });

  it.each(['/api/auth/me', '/api/plants', '/api/users'])(
    '%s rejeita acesso sem autenticação',
    async (path) => {
      await request(app.getHttpServer()).get(path).expect(401);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.plant.findMany).not.toHaveBeenCalled();
    },
  );

  it('login retorna somente usuário e cookie HttpOnly, SameSite=Strict e Path=/api', async () => {
    const { response, setCookie } = await login();
    expect(response.body).toEqual({
      usuario: { id: ADMIN, nome: 'Admin teste', email: 'admin@example.test', role: 'ADMIN' },
    });
    expect(setCookie).toMatch(new RegExp(`^${NOME_DO_COOKIE}=`));
    for (const flag of ['HttpOnly', 'SameSite=Strict', 'Path=/api', 'Max-Age=60'])
      expect(setCookie).toContain(flag);
    expect(setCookie).not.toContain('Secure');
    expect(setCookie).not.toContain('Domain=');
    expect(response.get('Strict-Transport-Security')).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain(SENHA);
    expect(JSON.stringify(response.body)).not.toContain(passwordHash);
  });

  it('login normaliza e-mail usando o schema real', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-CSRF-Protection', '1')
      .send({ email: ' ADMIN@EXAMPLE.TEST ', senha: SENHA })
      .expect(200);
  });

  it('recuperação pública dá a mesma resposta para e-mail existente, inativo e desconhecido', async () => {
    users[1].active = false;
    const respostas = [];
    for (const email of ['ADMIN@example.test', 'operator@example.test', 'desconhecido@example.test']) {
      const resposta = await request(app.getHttpServer())
        .post('/api/auth/password/forgot')
        .set('X-CSRF-Protection', '1')
        .send({ email })
        .expect('Cache-Control', 'no-store')
        .expect(202);
      expect(resposta.get('Set-Cookie')).toBeUndefined();
      respostas.push(resposta.text);
    }
    expect(new Set(respostas).size).toBe(1);
    expect(respostas[0]).toContain('Se houver uma conta elegível');
  });

  it('troca de senha exige sessão e redefinição exige o cabeçalho CSRF', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/password/change')
      .set('X-CSRF-Protection', '1')
      .send({ senhaAtual: SENHA, novaSenha: 'OutraSenha123' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/password/reset')
      .send({ token: 'x'.repeat(43), novaSenha: 'OutraSenha123' })
      .expect(403);
  });

  it('o guard rejeita sessões de uma versão anterior à troca de senha', async () => {
    const { cookie } = await login();
    users[0].sessionVersion++;
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
    const novaSessao = await login();
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', novaSessao.cookie).expect(200);
  });

  it('limita tentativas concorrentes por origem e conta normalizada e libera após a janela', async () => {
    let agora = Date.now();
    const relogio = jest.spyOn(Date, 'now').mockImplementation(() => agora);
    try {
      const respostas = await Promise.all(
        Array.from({ length: 8 }, (_, indice) =>
          request(app.getHttpServer())
            .post('/api/auth/login')
            .set('X-CSRF-Protection', '1')
            .set('X-Forwarded-For', `192.0.2.${indice + 1}`)
            .send({
              email: indice % 2 ? ' ADMIN@EXAMPLE.TEST ' : 'admin@example.test',
              senha: 'incorreta',
            }),
        ),
      );
      expect(respostas.filter((resposta) => resposta.status === 401)).toHaveLength(5);
      const bloqueadas = respostas.filter((resposta) => resposta.status === 429);
      expect(bloqueadas).toHaveLength(3);
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(5);
      for (const resposta of bloqueadas) {
        expect(resposta.get('Retry-After')).toBe('60');
        expect(resposta.get('Cache-Control')).toBe('no-store');
        expect(resposta.get('Set-Cookie')).toBeUndefined();
        expect(resposta.body).toMatchObject({
          statusCode: 429,
          message: 'Muitas tentativas de login. Tente novamente em instantes.',
        });
      }

      await login('operator@example.test');
      agora += 59_000;
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-CSRF-Protection', '1')
        .send({ email: 'admin@example.test', senha: SENHA })
        .expect('Retry-After', '1')
        .expect(429);
      agora += 1000;
      await login();
    } finally {
      relogio.mockRestore();
    }
  });

  it('limita a origem mesmo com corpos inválidos e mantém a sessão existente', async () => {
    const { cookie } = await login();
    for (let tentativa = 0; tentativa < 59; tentativa++) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-CSRF-Protection', '1')
        .send({})
        .expect(400);
    }
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-CSRF-Protection', '1')
      .send({ email: 'operator@example.test', senha: SENHA })
      .expect(429);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('X-CSRF-Protection', '1')
      .set('Cookie', cookie)
      .expect(204);
  });

  it('separa clientes atrás de um proxy explicitamente confiável', async () => {
    app.set('trust proxy', ['127.0.0.1', '::1']);
    const tentar = (origem: string, senha: string) =>
      request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-CSRF-Protection', '1')
        .set('X-Forwarded-For', origem)
        .send({ email: 'admin@example.test', senha });

    for (let tentativa = 0; tentativa < 5; tentativa++) {
      await tentar('192.0.2.1', 'incorreta').expect(401);
    }
    await tentar('192.0.2.200, 192.0.2.1', SENHA).expect(429);
    await tentar('192.0.2.2', SENHA).expect(200);
  });

  it.each([
    { email: 'admin@example.test', senha: 'incorreta' },
    { email: 'inexistente@example.test', senha: SENHA },
  ])('login inválido não emite cookie e mantém mensagem genérica: $email', async (body) => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-CSRF-Protection', '1')
      .send(body)
      .expect(401);
    expect((response.body as { message: unknown }).message).toBe('E-mail ou senha incorretos');
    expect(response.get('Set-Cookie')).toBeUndefined();
  });

  it('usuário inativo não faz login', async () => {
    users[0].active = false;
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-CSRF-Protection', '1')
      .send({ email: users[0].email, senha: SENHA })
      .expect(401);
  });

  it.each([{ email: 'invalido', senha: SENHA }, { email: 'admin@example.test', senha: '' }, {}])(
    'entrada inválida é 400: %j',
    async (body) => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-CSRF-Protection', '1')
        .send(body)
        .expect(400);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    },
  );

  it('/api/auth/me retorna o usuário atual sem senha/hash/token', async () => {
    const { cookie } = await login('client@example.test');
    const response = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(response.body).toEqual({
      id: CLIENTE,
      nome: 'Cliente teste',
      email: 'client@example.test',
      role: 'CLIENT',
      clientId: DONO,
    });
  });

  it('cookie adulterado é rejeitado antes de consultar usuários', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `${NOME_DO_COOKIE}=invalido`)
      .expect(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('token assinado mas expirado é rejeitado', async () => {
    const token = jwt.sign({ sub: ADMIN, role: Role.ADMIN }, { expiresIn: -1 });
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `${NOME_DO_COOKIE}=${token}`)
      .expect(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('token assinado sem identificador de usuário é recusado antes de consultar o banco', async () => {
    const token = jwt.sign({ role: Role.ADMIN });
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `${NOME_DO_COOKIE}=${token}`)
      .expect(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('cookie com codificação inválida retorna 401 sem consultar usuários', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', `${NOME_DO_COOKIE}=%ZZ`).expect(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('permite reautenticação após expirar e após sair', async () => {
    const agent = request.agent(app.getHttpServer());
    const credenciais = { email: 'client@example.test', senha: SENHA };
    const expirado = jwt.sign({ sub: CLIENTE, role: Role.CLIENT }, { expiresIn: -1 });
    await agent.get('/api/auth/me').set('Cookie', `${NOME_DO_COOKIE}=${expirado}`).expect(401);
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      await agent
        .post('/api/auth/login')
        .set('X-CSRF-Protection', '1')
        .send(credenciais)
        .expect('Cache-Control', 'no-store')
        .expect(200);
      const sessao = await agent.get('/api/auth/me').expect('Cache-Control', 'no-store').expect(200);
      expect(sessao.body).toMatchObject({ id: CLIENTE, role: Role.CLIENT, clientId: DONO });
      await agent
        .post('/api/auth/logout')
        .set('X-CSRF-Protection', '1')
        .expect('Cache-Control', 'no-store')
        .expect(204);
      await agent.get('/api/auth/me').expect(401);
    }
  });

  it('Bearer sozinho não substitui o cookie de sessão', async () => {
    const token = jwt.sign({ sub: ADMIN, role: Role.ADMIN });
    await request(app.getHttpServer()).get('/api/auth/me').auth(token, { type: 'bearer' }).expect(401);
  });

  it('desativar o usuário bloqueia uma sessão previamente válida', async () => {
    const { cookie } = await login();
    users[0].active = false;
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
  });

  it('logout remove o cookie do agente e bloqueia sua próxima requisição', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .set('X-CSRF-Protection', '1')
      .send({ email: 'admin@example.test', senha: SENHA })
      .expect(200);
    await agent.get('/api/auth/me').expect(200);
    const response = await agent.post('/api/auth/logout').set('X-CSRF-Protection', '1').expect(204);
    expect(response.text).toBe('');
    const expired = response.get('Set-Cookie')?.[0];
    expect(expired).toBeDefined();
    for (const flag of [`${NOME_DO_COOKIE}=;`, 'Path=/api', 'HttpOnly', 'SameSite=Strict'])
      expect(expired).toContain(flag);
    const expires = expired?.match(/Expires=([^;]+)/)?.[1];
    expect(expires).toBeDefined();
    expect(Date.parse(expires!)).toBeLessThan(Date.now());
    await agent.get('/api/auth/me').expect(401);
  });

  it('logout é público e repetível com cookie ausente ou inválido', async () => {
    await request(app.getHttpServer()).post('/api/auth/logout').set('X-CSRF-Protection', '1').expect(204);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('X-CSRF-Protection', '1')
      .set('Cookie', `${NOME_DO_COOKIE}=invalido`)
      .expect(204);
  });

  it.each([
    ['admin@example.test', 200],
    ['operator@example.test', 403],
    ['client@example.test', 403],
  ])('GET /api/users verifica perfil de %s (HTTP %i)', async (email, status) => {
    const { cookie } = await login(email);
    await request(app.getHttpServer()).get('/api/users').set('Cookie', cookie).expect(status);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
  });

  it.each([
    ['admin@example.test', 200],
    ['operator@example.test', 200],
    ['client@example.test', 403],
  ])('PATCH /api/plants/:id/client verifica perfil de %s (HTTP %i)', async (email, status) => {
    const { cookie } = await login(email);
    await request(app.getHttpServer())
      .patch(`/api/plants/${USINA}/client`)
      .set('X-CSRF-Protection', '1')
      .set('Cookie', cookie)
      .send({ clientId: null })
      .expect(status);
    expect(prisma.plant.update).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
  });

  it('CLIENT consulta usinas com filtro do cliente no serviço real', async () => {
    const { cookie } = await login('client@example.test');
    await request(app.getHttpServer()).get('/api/plants').set('Cookie', cookie).expect(200);
    expect(prisma.plant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: DONO } }),
    );
  });

  it('permissão usa o papel atual do usuário, não o papel antigo do JWT', async () => {
    const { cookie } = await login();
    users[0].role = Role.CLIENT;
    await request(app.getHttpServer()).get('/api/users').set('Cookie', cookie).expect(403);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
  it('desativar e reativar usuário não ressuscita sua sessão antiga', async () => {
    prisma.user.update.mockImplementation(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: { active?: boolean; sessionVersion?: { increment: number } };
      }) => {
        const target = users.find((item) => item.id === where.id)!;
        if (data.active !== undefined) target.active = data.active;
        if (data.sessionVersion) target.sessionVersion += data.sessionVersion.increment;
        return Promise.resolve({ id: target.id, active: target.active });
      },
    );
    const operator = await login('operator@example.test');
    const admin = await login();
    for (const active of [false, true]) {
      await request(app.getHttpServer())
        .patch(`/api/users/${OPERADOR}`)
        .set('Cookie', admin.cookie)
        .set('X-CSRF-Protection', '1')
        .send({ active })
        .expect(200);
      await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', operator.cookie).expect(401);
    }
    const fresh = await login('operator@example.test');
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', fresh.cookie).expect(200);
  });
  it('payload excessivo retorna 413 genérico sem ecoar dados', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-CSRF-Protection', '1')
      .send({ email: 'a@example.test', senha: 'x'.repeat(110000) })
      .expect(413);
    expect(response.body).toEqual({
      statusCode: 413,
      message: 'Corpo da requisição excede o limite permitido.',
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
  it('histórico exige sessão autenticada', async () => {
    await request(app.getHttpServer()).get(`/api/plants/${USINA}/measurements`).expect(401);
  });
  it('histórico valida datas e fuso no transporte HTTP', async () => {
    const { cookie } = await login();
    await request(app.getHttpServer())
      .get(`/api/plants/${USINA}/measurements`)
      .set('Cookie', cookie)
      .query({ from: 'invalid', to: '2026-01-02T00:00:00Z' })
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/plants/${USINA}/measurements/aggregations`)
      .set('Cookie', cookie)
      .query({
        sourceLinkId: ADMIN,
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-02T00:00:00Z',
        period: 'day',
        timeZone: 'Invalid/Zone',
      })
      .expect(400);
  });
  it('CLIENT não consulta histórico de usina alheia', async () => {
    const { cookie } = await login('client@example.test');
    prisma.plant.findFirst.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get(`/api/plants/${USINA}/measurements`)
      .set('Cookie', cookie)
      .query({ from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' })
      .expect(404);
    expect(prisma.measurement.findMany).not.toHaveBeenCalled();
  });
  it('consulta histórica real aplica escopo, intervalo e filtro de simulação', async () => {
    const { cookie } = await login('client@example.test');
    prisma.plant.findFirst.mockResolvedValue({ id: USINA });
    prisma.measurement.findMany.mockResolvedValue([]);
    prisma.measurement.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation((promises: Promise<unknown>[]) => Promise.all(promises));
    await request(app.getHttpServer())
      .get(`/api/plants/${USINA}/measurements`)
      .set('Cookie', cookie)
      .query({ from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' })
      .expect(200, { itens: [], total: 0, pagina: 1, porPagina: 100 });
    const call = (prisma.measurement.findMany.mock.calls[0] as [{ where: Record<string, unknown> }])[0];
    expect(call.where).toMatchObject({
      plantId: USINA,
      plant: { clientId: DONO },
      inverterId: null,
      isSimulated: false,
    });
  });
});
