# Implementação do cadastro único de usinas

Implementação da [modelagem aprovada](MODELAGEM_USINAS.md). A migration está preparada, **não aplicada ao banco do usuário**. A aprovação do código não substitui a conferência de backup, dados reais e janela de implantação.

## O que foi implementado

- Plant única com UUID preservado, origem MANUAL/IMPORTED imutável e metadados com overrides por campo.
- PlantExternalLink com identidade única por integração/externalId, reserva DETACHED e índice parcial para somente um ACTIVE por Plant.
- Descobertas pendentes: novas identidades remotas não entram silenciosamente como usinas. ADMIN confirma importação ou vínculo; conflitos com identidade pertencente a outra Plant retornam 409, sem fusão/exclusão.
- Edição manual protegida por `revision`; exclusão explícita do override via `useRemote`. Omissão preserva valores; null é limpeza explícita quando o campo aceita null.
- Vínculo/desvínculo/reconexão administrativa, auditoria, pausa e arquivamento de integração. Não existe endpoint de edição de credenciais/conta; a nova configuração só aceita estado e revisão.
- Sync com allowlist, validação de lote/timestamp, snapshot remoto e amostra histórica. Não reativa DETACHED, não altera cliente/origem/overrides, não soma novamente energia de amostras repetidas e rejeita leitura anterior ou conflitante no mesmo timestamp.
- Coletores obsoletos são descartados pela revisão da integração. Sync, vínculo/desvínculo e avaliação de alertas compartilham transação e lock de catálogo no PostgreSQL. A versão inicial serializa as gravações do catálogo; chamadas externas ocorrem fora do lock. Isso prioriza integridade sobre paralelismo e pode exigir locks mais granulares se o volume crescer.
- FKs de integração/usina/alertas/vínculos passam a restringir exclusão; desvinculação não apaga histórico nem marca alertas como recuperação.
- React: rota `/usinas`, cadastro/edição, origem de campos, revisão de descobertas e associação explícita, pausa/reativação, desvinculação e reconexão pelo histórico. CLIENT tem somente leitura; backend mantém guards como autoridade.
- Visão geral percorre páginas e diferencia ausência de leitura de zero. Telemetria com mais de 60 minutos é apresentada como antiga, com métricas correntes nulas; a amostra permanece armazenada. A janela inicial alinha-se à regra atual de comunicação e está centralizada em `TELEMETRY_MAX_AGE_MS`.

## Contratos

O envelope de listagem e os campos efetivos existentes foram mantidos. `integrationId`, `externalId` e `integration` agora podem ser nulos nas manuais/desvinculadas; continuam como projeção de compatibilidade do vínculo ativo. O vínculo é a autoridade de identidade remota; não há dual-write com o binário antigo. Novos campos de leitura: `origin`, `revision`, `monitoring`, `metadataSources` e `activeLink`.

Estados de monitoramento: UNLINKED, PAUSED, WAITING, STALE, ACTIVE. Não são novos valores do enum de saúde; `status` mantém o contrato existente e assume UNKNOWN quando não existe leitura corrente utilizável.

| Método/rota sob `/api`                                   | Perfil         | Corpo/uso                                                                                    |
| -------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------- |
| POST `/plants`                                           | ADMIN/OPERATOR | `name`, opcionais `city`, `state`, `capacityKwp`, `clientId`                                 |
| PATCH `/plants/:id`                                      | ADMIN/OPERATOR | `revision`, campos editados e/ou `useRemote` com chaves de metadados                         |
| POST `/plants/:id/external-link`                         | ADMIN          | `integrationId`, `externalId`, `revision` da Plant; `discoveryRevision` para descoberta nova |
| POST `/plants/:id/external-link/detach`                  | ADMIN          | `revision`, `reason` (3 a 500 caracteres)                                                    |
| GET `/plants/:id/external-links`                         | ADMIN          | Histórico de identidades e estado da integração, sem credenciais                             |
| GET `/integrations/:id/discoveries`                      | ADMIN/OPERATOR | Paginação existente; somente descobertas pendentes                                           |
| POST `/integrations/:id/discoveries/:discoveryId/import` | ADMIN          | `revision` da descoberta; confirmação de novo cadastro                                       |
| PATCH `/integrations/:id`                                | ADMIN          | `revision` e `enabled`, ou `archive: true` para arquivo definitivo                           |

Consultas de usinas, vínculo de cliente, auth e ações existentes permanecem. A resposta de sync mantém `usinasSincronizadas`/`alertas` e acrescenta `descobertasPendentes`/`identidadesReservadas`: descobertas não contam como usinas. Não há autoimportação habilitada por padrão. Importações confirmadas são idempotentes pela identidade; não existe fusão automática de duplicatas já materializadas.

Exemplo de edição:

```json
{ "revision": 3, "name": "Nome cadastrado", "city": null, "useRemote": ["capacityKwp"] }
```

Não enviar o mesmo campo simultaneamente como valor manual e em `useRemote`. Para reconectar uma identidade DETACHED da mesma Plant, enviar seus IDs e a revisão atual da Plant; não é exigida nova descoberta. A tela pode consultar esses IDs em Ver vínculos.

## Migration e implantação

Arquivo: `apps/api/prisma/migrations/20261124010000_plant_catalog/migration.sql`.

É uma expansão transacional: novas estruturas/índices, IDs de compatibilidade opcionais e substituição das cascatas por restrições. O backfill cria um vínculo para cada Plant atual, sem mudar UUID, cliente, datas, métricas ou Alert. Snapshot remoto não inclui credenciais. Os valores existentes são conservadoramente preservados em overrides; seguir novamente a plataforma exige remover o override explicitamente. Cada cadastro recebe evento de auditoria da linha de base.

Antes de aplicar, o responsável deve:

1. Conferir destino e backup restaurável, registros inseridos fora do fluxo normal e validade dos metadados (nome, UF, capacidades e IDs externos). Não remover dados para fazer validação passar.
2. Ensaio em cópia/ambiente isolado e conferência das contagens, vínculos e histórico. O teste embarcado descrito abaixo não conhece os registros reais.
3. Planejar janela sem os escritores antigos/sync. Não manter binário antigo gravando no novo catálogo.
4. Aplicar somente após autorização específica ao banco escolhido, gerar o Prisma Client e publicar backend/painel compatíveis juntos. Não há comando automático de migration no `dev`.
5. Após manuais criadas, rollback não pode ser apenas voltar o binário antigo, que exige integração para toda Plant. Preservar novos dados e preferir correção para frente/versão compatível.

Nenhum dado de `apps/web`/localStorage foi importado. Conciliação de duplicatas materializadas e migração do legado continuam trabalhos separados, com preservação e aprovação próprias. A integração continua suportando somente DEMO.

## Validação reproduzível sem banco real

Com dependências instaladas e Prisma Client gerado:

```powershell
npm run typecheck
npm run lint:check
npm run test:api
npm run test:e2e
npm run build
```

Testes de domínio cobrem overrides/nulos, timestamp, identidade, atualização sem alterar cliente/origem, vínculo/reconexão, reserva DETACHED, revisões e descarte de coleta obsoleta. Os E2E usam Prisma controlado; não iniciam AppModule/scheduler nem leem `.env`.

Teste de interface com API interceptada e navegador isolado (precisa das dependências de `apps/web/tests`):

```powershell
$env:BROWSER_CHANNEL = 'msedge'
node --test apps/painel/tests/catalogo.test.cjs
Remove-Item Env:BROWSER_CHANNEL
```

Esse teste cria cadastro, revisa descoberta e vincula sem duplicar, verificando reflow em 1366, 683, 390 e 320 px. Não é um teste completo de integração com banco nem autenticação real no navegador.

Teste opcional de DDL/backfill com PostgreSQL WASM em memória, sem servidor, URL de banco ou credenciais. A ferramenta fica fora do monorepo e não é dependência de produção:

```powershell
# Exemplo: pasta temporária escolhida fora do repositório
npm install --prefix C:/temp/solarsystem-sql-check --ignore-scripts --no-audit --no-fund @electric-sql/pglite
$env:PGLITE_MODULE_PATH = 'C:/temp/solarsystem-sql-check/node_modules/@electric-sql/pglite'
node --test apps/api/test/plant-migration.test.cjs
Remove-Item Env:PGLITE_MODULE_PATH
```

O teste aplica o histórico de DDL numa instância descartável em memória, insere fixtures e aplica a nova migration somente nela. Confere preservação de campos/alertas, unicidade de identidade inclusive DETACHED, vários históricos com somente um ACTIVE e restrições contra exclusão em cascata. Não comprova carga/concorrência multiprocessos num servidor PostgreSQL real.

Resultado desta implementação: 57 testes unitários e 41 E2E HTTP aprovados, além do teste de DDL/backfill em memória e do fluxo React no Edge. TypeScript, ESLint sem correção, builds da API/painel e formatação dos arquivos alterados também passaram. A migration SQL é aplicada uma vez pelo histórico do Prisma; não executar o arquivo manualmente repetidas vezes. O índice parcial e os CHECKs customizados precisam ser preservados em migrations futuras.

A validação do código foi feita com Node 24.22.3; `.nvmrc` continua apontando Node 26. Banco do usuário, configuração HTTPS de produção e migração dos cadastros reais não foram exercitados. O aviso experimental de VM Modules no Jest permanece esperado.
