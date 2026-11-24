import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import type { Env } from './env';
import { ApiExceptionFilter } from '../common/api-exception.filter';
import { correlacionarRequisicao } from '../common/request-context';

const METODOS_DE_LEITURA = new Set(['GET', 'HEAD', 'OPTIONS']);
const CABECALHO_CSRF = 'X-CSRF-Protection';

export function configurarHttp(
  app: NestExpressApplication,
  { NODE_ENV, WEB_ORIGIN, TRUSTED_PROXY_IPS }: Pick<Env, 'NODE_ENV' | 'WEB_ORIGIN' | 'TRUSTED_PROXY_IPS'>,
) {
  app.setGlobalPrefix('api');
  app.set('trust proxy', TRUSTED_PROXY_IPS.length ? TRUSTED_PROXY_IPS : false);
  app.use(correlacionarRequisicao);
  app.useGlobalFilters(new ApiExceptionFilter());

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (NODE_ENV === 'production') {
      if (!req.secure) {
        res.set('Cache-Control', 'no-store');
        res.status(403).json({ statusCode: 403, message: 'Esta API exige HTTPS.' });
        return;
      }
      res.set('Strict-Transport-Security', 'max-age=31536000');
    }
    res.vary('Origin');
    next();
  });

  app.enableCors({
    origin: (origem, callback) => callback(null, origem === WEB_ORIGIN),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', CABECALHO_CSRF],
    exposedHeaders: ['Retry-After', 'X-Request-Id'],
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origem = req.get('Origin');
    if (
      !METODOS_DE_LEITURA.has(req.method) &&
      (req.get(CABECALHO_CSRF) !== '1' || (origem !== undefined && origem !== WEB_ORIGIN))
    ) {
      res.set('Cache-Control', 'no-store');
      res.status(403).json({ statusCode: 403, message: 'Requisição bloqueada pela proteção CSRF.' });
      return;
    }
    next();
  });

  app.useBodyParser('json');
  app.useBodyParser('urlencoded', { extended: true });
  app.use((erro: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (erro && typeof erro === 'object' && 'type' in erro && erro.type === 'entity.parse.failed') {
      res.set('Cache-Control', 'no-store');
      res.status(400).json({ statusCode: 400, message: 'Formato do corpo da requisição inválido.' });
      return;
    }
    next(erro);
  });
}
