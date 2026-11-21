import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

// Um Pipe transforma/valida o dado ANTES de ele chegar ao controller
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const resultado = this.schema.safeParse(value);
    if (!resultado.success) {
      throw new BadRequestException({
        message: 'Dados inválidos',
        erros: resultado.error.issues.map((issue) => ({
          campo: issue.path.join('.'),
          mensagem: issue.message,
        })),
      });
    }
    return resultado.data;
  }
}
