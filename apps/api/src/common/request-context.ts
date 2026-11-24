import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

interface ContextoDaRequisicao {
  requestId: string;
  actorId?: string;
}

export const contextoDaRequisicao = new AsyncLocalStorage<ContextoDaRequisicao>();

export function correlacionarRequisicao(_req: Request, res: Response, next: NextFunction) {
  const requestId = randomUUID();
  res.setHeader('X-Request-Id', requestId);
  contextoDaRequisicao.run({ requestId }, next);
}
