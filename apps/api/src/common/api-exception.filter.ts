import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { contextoDaRequisicao } from './request-context';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const statusCode = exception instanceof HttpException ? exception.getStatus() : 500;
    const requestId = contextoDaRequisicao.getStore()?.requestId;
    if (statusCode >= 500) {
      this.logger.error({
        event: 'api.request_failed',
        statusCode,
        requestId,
        ...(exception instanceof Prisma.PrismaClientKnownRequestError && /^P\d{4}$/.test(exception.code)
          ? { prismaCode: exception.code }
          : {}),
      });
    }
    if (response.headersSent) {
      response.end();
      return;
    }
    response.setHeader('Cache-Control', 'no-store');
    if (statusCode < 500 && exception instanceof HttpException) {
      // O roteador inclui o caminho solicitado em alguns erros, inclusive em rotas inexistentes.
      if (!host.switchToHttp().getRequest<Request>().route) {
        response.status(statusCode).json({
          statusCode,
          message: statusCode === 404 ? 'Recurso não encontrado.' : 'Requisição inválida.',
        });
        return;
      }
      const dados = exception.getResponse();
      if (typeof dados === 'string') {
        response.status(statusCode).json({ statusCode, message: dados });
      } else {
        const { message, error, erros } = dados as { message?: unknown; error?: unknown; erros?: unknown };
        response.status(statusCode).json({ statusCode, message, error, erros });
      }
      return;
    }
    response
      .status(statusCode)
      .json({ statusCode, message: 'Não foi possível concluir a requisição.', requestId });
  }
}
