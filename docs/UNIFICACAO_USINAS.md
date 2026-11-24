# Unificação do modelo de usinas — Tarefa 07

Data: 23/11/2026. Base: `main`, commit `e4f273d`, árvore inicialmente limpa. A aprovação da [proposta da Tarefa 06](MODELAGEM_USINAS.md) foi concedida na conversa: “li e aprovo, pode implementar”. Isso autoriza a implementação, não a aplicação em banco real.

## Modelo e situação encontrada

A base já continha a implementação descrita em [IMPLEMENTACAO_USINAS.md](IMPLEMENTACAO_USINAS.md). Esta tarefa complementa essa implementação incrementalmente; não recria tabelas nem reescreve a migration anterior.

- `Plant` é o cadastro único, com UUID interno preservado, origem imutável MANUAL/IMPORTED, cliente opcional, metadados efetivos e overrides manuais. Vincular uma manual não muda sua origem.
- `PlantExternalLink` concentra identidade externa, snapshot remoto, última amostra e estado ACTIVE/DETACHED. Há uma identidade por `(integrationId, externalId)` e no máximo uma fonte ACTIVE por usina. Identidades desvinculadas continuam reservadas à mesma usina.
- `Plant.integrationId` e `externalId` são opcionais e mantidos como projeção compatível do vínculo ativo. Cliente e alertas continuam referenciando o mesmo cadastro.
- `PlantDiscovery` permite revisar identidades novas antes de importar ou vincular. Não há associação automática por nome nem fusão de cadastros existentes.
- `PlantAuditEvent` registra operações sem copiar credenciais. Revisões e transações de catálogo protegem contra gravações e coletas obsoletas.

O diagrama e as regras de negócio aprovadas continuam em MODELAGEM_USINAS.md. A unicidade externa não comprova que duas identidades de fabricantes diferentes sejam a mesma instalação física; isso exige conciliação explícita.

## Serviços, contratos e regras de atualização

`PlantsController`, `IntegrationsController`, `IntegrationsService`, `ProviderAdapter` e a avaliação de alertas foram inspecionados junto com os modelos do painel. Não foi necessário alterar seus contratos nesta tarefa. As rotas existentes e seus controles de autenticação/perfil permanecem.

`PlantCatalogService`, `PlantsService` e o DTO passam a ler metadados persistidos com uma validação de compatibilidade separada da validação de novas entradas. O schema anterior permitia, por exemplo, nomes curtos, UF livre e capacidade negativa. Esses valores não podem tornar a consulta/edição ou sincronização de um cadastro antigo indisponível após o backfill. Eles são preservados até correção explícita; entradas novas continuam com validação restritiva. A allowlist de overrides continua proibindo cliente, identidade e telemetria.

Na sincronização, metadados remotos atualizam o snapshot; somente campos sem override seguem a plataforma. `clientId`, UUID e origem não são sobrescritos. Retirar um override é uma decisão explícita (`useRemote`). Desvincular congela os metadados efetivos e conserva o histórico e a reserva da identidade. Integração pausada/arquivada não fornece telemetria atual.

A comparação de amostras agora normaliza o timestamp para UTC: representações com fusos diferentes do mesmo instante são idempotentes. Valores divergentes no mesmo instante e amostras anteriores continuam gerando conflito. Isso evita falsos conflitos sem aceitar energia divergente.

`catalogTransaction` converte também violações de constraint Prisma `P2004` em HTTP 409. O comportamento foi testado com erro controlado; o mapeamento exato emitido por um servidor/driver real ainda exige ensaio de integração.

## Migration preparada

Nova migration: `apps/api/prisma/migrations/20261124020000_plant_catalog_integrity/migration.sql`.

1. Recusa divergências preexistentes entre a projeção em Plant e o vínculo ACTIVE. Interrompe com rollback, sem escolher automaticamente um lado nem apagar registros.
2. Impede alteração de UUID/origem da usina e transferência da identidade de um vínculo para outra usina/integração.
3. Instala constraint triggers diferidos que verificam, no commit, a correspondência entre Plant e vínculo ACTIVE. Vincular/desvincular exige transação atômica, permitindo qualquer ordem das duas escritas.

A migration anterior `20261124010000_plant_catalog` permanece sem alteração. Ela contém a expansão/backfill que preserva IDs, clientes, métricas, datas e alertas e substitui exclusões em cascata por restrições. Quem ainda não aplicou nenhuma delas deverá usar a sequência normal do histórico, após autorização específica.

Nenhuma migration foi aplicada a servidor PostgreSQL local, real ou de produção. O único SQL executado foi em instâncias descartáveis em memória, sem ler `.env` ou URLs de banco. Não foram usados `db push`, reset ou seeds.

## Validação

Ambiente: Windows/PowerShell, Node 24.22.3, dependências locais e Prisma Client já gerado. Executáveis foram chamados diretamente pelo Node disponível no runtime, pois Node/npm não estavam no PATH da sessão.

| Verificação                                                                                              | Resultado                    |
| -------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Jest unitário da API, `jest --runInBand --no-cache`                                                      | PASSOU: 60 testes            |
| Jest E2E, `node --experimental-vm-modules ...jest.js --config test/jest-e2e.json --runInBand --no-cache` | PASSOU: 41 testes com mocks  |
| TypeScript, `tsc --noEmit --incremental false -p tsconfig.json`                                          | PASSOU                       |
| ESLint, `eslint "src/**/*.ts" "test/**/*.ts" --no-fix`                                                   | PASSOU                       |
| Build API, `nest build`                                                                                  | PASSOU                       |
| Prisma, `prisma validate`                                                                                | PASSOU, sem conexão ao banco |
| `node --test apps/api/test/plant-migration.test.cjs`, com PGlite externo                                 | PASSOU: 2 testes             |
| Prettier dos arquivos TypeScript/CJS/Markdown alterados e `git diff --check`                             | PASSOU                       |
| Migration em banco real, carga e concorrência multiprocessos                                             | NÃO EXECUTADO                |

Os testes SQL percorrem o histórico e conferem backfill preservando campos/alertas, unicidade incluindo identidades DETACHED, restrições de exclusão, imutabilidade e coerência no commit, rollback de inconsistências e vínculo/desvínculo atômicos. Um segundo cenário comprova a recusa de uma base já divergente sem apagar o cadastro nem instalar parcialmente os triggers. A ferramenta opcional e o comando reproduzível estão em IMPLEMENTACAO_USINAS.md.

Avisos observados: VM Modules experimental no Node/Jest e configuração `package.json#prisma` descontinuada para Prisma 7. Não bloqueiam as verificações atuais. O projeto indica Node 26 em `.nvmrc`; a execução nessa versão permanece pendente neste ambiente.

## Riscos e próximos passos sujeitos a autorização

- Aplicar migrations em um banco escolhido exige autorização, backup restaurável e ensaio em cópia isolada. Quantidade/qualidade dos registros reais continuam desconhecidas.
- Conflitos preexistentes e metadados históricos inválidos exigem revisão; não são corrigidos automaticamente. Tipos JSON inválidos ou números não finitos não são aceitos pela leitura compatível.
- Triggers e índice parcial são SQL customizado: migrations futuras devem preservá-los. Escritores antigos que atualizam somente Plant não são compatíveis; implantação requer interromper esses escritores.
- PostgreSQL embarcado e mocks não comprovam desempenho, locks/concorrência de múltiplos processos nem todos os códigos retornados pelo Prisma em servidor real.
- Migração de localStorage do HTML legado, conciliação de duplicatas existentes e provedores reais permanecem fora do escopo. Nenhum arquivo visual do painel foi alterado.

Nenhum commit ou push foi executado. Tarefa 08 depende de nova autorização.
