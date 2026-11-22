import { Injectable } from '@nestjs/common';
import type { ProviderType } from '@prisma/client';
import { DemoAdapter } from './demo/demo.adapter';
import type { ProviderAdapter } from './provider.types';

/*
 * O REGISTRO: o "catálogo" de adaptadores.
 * Para suportar um fabricante novo: (1) crie a classe que implementa ProviderAdapter,
 * (2) coloque-a na lista abaixo, (3) adicione o valor no enum ProviderType do schema.prisma.
 * Nada mais no sistema muda.
 */
@Injectable()
export class ProviderRegistry {
  private readonly adaptadores = new Map<ProviderType, ProviderAdapter>();

  constructor() {
    for (const adaptador of [new DemoAdapter()]) {
      this.adaptadores.set(adaptador.definicao.tipo, adaptador);
    }
  }

  obter(tipo: ProviderType): ProviderAdapter {
    const adaptador = this.adaptadores.get(tipo);
    if (!adaptador) throw new Error(`Plataforma não suportada: ${tipo}`);
    return adaptador;
  }

  definicoes() {
    return [...this.adaptadores.values()].map((a) => a.definicao);
  }
}
