import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import type { UsuarioAutenticado } from './auth.types';
import { loginSchema } from './login.schema';

const JANELA_MS = 60_000;
const LIMITE_POR_ORIGEM = 60;
const LIMITE_POR_ORIGEM_E_EMAIL = 5;
const MAXIMO_DE_CONTADORES = 50_000;

interface Contador {
  tentativas: number;
  expiraEm: number;
}

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly contadores = new Map<string, Contador>();
  private proximaLimpeza = 0;

  canActivate(contexto: ExecutionContext): boolean {
    const http = contexto.switchToHttp();
    const requisicao = http.getRequest<
      Request<unknown, unknown, { email?: unknown }> & { user?: UsuarioAutenticado }
    >();
    const operacao = contexto.getHandler().name;
    const agora = Date.now();
    if (agora >= this.proximaLimpeza) {
      for (const [chave, contador] of this.contadores) {
        if (contador.expiraEm <= agora) this.contadores.delete(chave);
      }
      this.proximaLimpeza = agora + JANELA_MS;
    }

    const origem = requisicao.ip ?? requisicao.socket.remoteAddress ?? 'desconhecida';
    const esperaDaOrigem = this.registrar(`${operacao}:ip:${origem}`, LIMITE_POR_ORIGEM, agora);
    if (esperaDaOrigem) this.bloquear(http.getResponse<Response>(), esperaDaOrigem, operacao);

    const email = loginSchema.shape.email.safeParse(requisicao.body?.email);
    if (email.success) {
      const identificador = createHash('sha256').update(email.data).digest('hex');
      const espera = this.registrar(
        `${operacao}:${origem}:${identificador}`,
        LIMITE_POR_ORIGEM_E_EMAIL,
        agora,
      );
      if (espera) this.bloquear(http.getResponse<Response>(), espera, operacao);
    }
    if (requisicao.user) {
      const espera = this.registrar(
        `${operacao}:user:${requisicao.user.id}`,
        LIMITE_POR_ORIGEM_E_EMAIL,
        agora,
      );
      if (espera) this.bloquear(http.getResponse<Response>(), espera, operacao);
    }

    return true;
  }

  private registrar(chave: string, limite: number, agora: number): number {
    const contador = this.contadores.get(chave);
    if (contador && contador.expiraEm > agora) {
      if (contador.tentativas >= limite) return contador.expiraEm - agora;
      contador.tentativas++;
      return 0;
    }
    if (!contador && this.contadores.size >= MAXIMO_DE_CONTADORES) return this.proximaLimpeza - agora;
    this.contadores.set(chave, { tentativas: 1, expiraEm: agora + JANELA_MS });
    return 0;
  }

  private bloquear(resposta: Response, esperaMs: number, operacao: string): never {
    resposta.setHeader('Retry-After', Math.ceil(esperaMs / 1000).toString());
    resposta.setHeader('Cache-Control', 'no-store');
    throw new HttpException(
      operacao === 'login'
        ? 'Muitas tentativas de login. Tente novamente em instantes.'
        : 'Muitas tentativas. Tente novamente em instantes.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
