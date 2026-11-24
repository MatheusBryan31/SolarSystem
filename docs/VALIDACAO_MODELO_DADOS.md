# Validação do modelo de dados — Tarefa 11

Revisão de 24/11/2026 sobre as tarefas 07 a 10, até a revisão `c9c286d`.

## Estrutura final

| Modelo / tabela                              | Responsabilidade e garantias principais                                                                                                                                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Client` / `clients`                         | Titular de usuários e usinas. Documento opcional e único quando informado.                                                                                                                                                                                                            |
| `User` / `users`                             | Conta com e-mail único, perfil, estado ativo e cliente opcional. Índice por cliente.                                                                                                                                                                                                  |
| `Integration` / `integrations`               | Conta de monitoramento, credenciais JSONB, estado, arquivamento, revisão e sincronização. O enum de provedor contém apenas `DEMO`.                                                                                                                                                    |
| `Plant` / `plants`                           | Cadastro canônico com UUID e origem imutáveis, cliente opcional, campos técnicos, projeção externa e última telemetria. Índice por cliente. O par externo é opcional, preenchido em conjunto e único quando presente.                                                                 |
| `PlantExternalLink` / `plant_external_links` | Identidade remota reservada por integração e ID externo, inclusive após desvincular. Índice parcial limita a um vínculo ativo por usina. Triggers diferidos conferem a projeção ao fim da transação.                                                                                  |
| `PlantDiscovery` / `plant_discoveries`       | Descobertas identificadas por integração e ID externo, com usina opcional.                                                                                                                                                                                                            |
| `PlantAuditEvent` / `plant_audit_events`     | Auditoria por usina e data. O ator é um identificador textual opcional.                                                                                                                                                                                                               |
| `Inverter` / `inverters`                     | Equipamento com usina obrigatória, origem, identidade remota opcional e arquivamento. Unicidade por fabricante e serial normalizados e por identidade remota. Índice por usina e arquivamento.                                                                                        |
| `Measurement` / `measurements`               | Série temporal com usina e fonte obrigatórias, equipamento opcional, qualidade e timestamps com fuso. Unicidade por fonte, inversor e instante, com índice único parcial para leituras da usina. Índices por usina/instante/ID e inversor/instante. Um trigger bloqueia atualizações. |
| `Alert` / `alerts`                           | Ocorrência com tipo, severidade e ciclo de vida. Usina, integração e usuário de reconhecimento opcionais. Índices por estado e por usina/tipo/estado.                                                                                                                                 |

## Relacionamentos e ações referenciais

As referências abaixo são de muitos registros filhos para um registro pai. As FKs compostas de medição garantem que inversor e vínculo pertençam à mesma usina da leitura.

| Filho → pai                                  | Obrigatoriedade                   | ON DELETE | ON UPDATE |
| -------------------------------------------- | --------------------------------- | --------- | --------- |
| User → Client e Plant → Client               | Opcional                          | SET NULL  | CASCADE   |
| Plant → Integration                          | Opcional                          | RESTRICT  | CASCADE   |
| PlantExternalLink → Plant e Integration      | Obrigatória                       | RESTRICT  | CASCADE   |
| PlantDiscovery → Integration                 | Obrigatória                       | RESTRICT  | CASCADE   |
| PlantDiscovery → Plant                       | Opcional                          | RESTRICT  | CASCADE   |
| PlantAuditEvent → Plant                      | Obrigatória                       | RESTRICT  | CASCADE   |
| Inverter → Plant                             | Obrigatória                       | RESTRICT  | CASCADE   |
| Inverter → Integration                       | Obrigatória para origem importada | RESTRICT  | CASCADE   |
| Measurement → Plant                          | Obrigatória                       | RESTRICT  | CASCADE   |
| Measurement → Inverter (ID e usina)          | Opcional                          | RESTRICT  | RESTRICT  |
| Measurement → PlantExternalLink (ID e usina) | Obrigatória                       | RESTRICT  | RESTRICT  |
| Alert → Plant e Integration                  | Opcional                          | RESTRICT  | CASCADE   |
| Alert → User                                 | Opcional                          | SET NULL  | CASCADE   |

Na prática, os triggers de identidade bloqueiam a alteração de IDs de usina e de campos da identidade do vínculo. Por exemplo, renomear o ID de uma integração com vínculos falha quando a cascata tenta reescrever o vínculo. `archived_by_id` e `actor_id` são referências históricas textuais sem FK.

## Migrations revisadas

| Migration                                | Efeito                                                                                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261118125254_init`                    | Base de clientes, usuários e perfis.                                                                                                                                        |
| `20261122171401_integracoes_e_usinas`    | Base de integração e usina. A integração era obrigatória e sua exclusão propagava para usinas.                                                                              |
| `20261122190956_alertas`                 | Base de alertas. Exclusões de usina e integração se propagavam para alertas.                                                                                                |
| `20261124010000_plant_catalog`           | Expande o catálogo, substitui as três cascatas de exclusão por `RESTRICT`, copia identidade e telemetria existente para vínculos, grava overrides e cria auditoria inicial. |
| `20261124020000_plant_catalog_integrity` | Interrompe a implantação se houver divergência entre projeção e vínculo ativo. Adiciona triggers de identidade e consistência.                                              |
| `20261124030000_inverters`               | Cria inversores, índices e checks de origem, identidade normalizada, revisão e arquivamento.                                                                                |
| `20261124040000_plant_details`           | Adiciona campos técnicos opcionais com checks de potência finita, inclinação, CEP, par de coordenadas e limites de texto. Preserva UF e demais campos antigos.              |
| `20261124050000_measurements`            | Cria o histórico e as FKs compostas, índices e checks de métricas, período, qualidade e simulação. O histórico começa vazio.                                                |

As cinco migrations novas têm transações explícitas. A expansão do catálogo atualiza todas as usinas para popular overrides e cria um vínculo e um evento por usina legada. A amostra mais recente é copiada para o JSON do vínculo quando há timestamp. Sua serialização acrescenta `Z` a um `timestamp` sem fuso. Confirme que os dados legados representam UTC antes da implantação.

## Comandos e resultados

Ambiente Windows, Node.js 26.0.0, npm 11.12.1 e Prisma 6.19.3.

| Comando                                                                                                                       | Resultado                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                                                                                      | Dependências do lockfile instaladas. O npm reportou 19 vulnerabilidades moderadas e 4 altas no grafo instalado.                                                         |
| `npm exec -w apps/api -- prisma validate`                                                                                     | Schema válido.                                                                                                                                                          |
| `npm run db:generate -w apps/api`                                                                                             | Prisma Client 6.19.3 e tipos gerados. O Prisma avisou sobre a futura remoção de `package.json#prisma`.                                                                  |
| `npm run build:api`                                                                                                           | Build NestJS aprovado após geração do cliente.                                                                                                                          |
| `npm run test:api`                                                                                                            | 16 suítes e 124 testes unitários passaram.                                                                                                                              |
| `initdb`, `pg_ctl start` e `createdb`                                                                                         | Instância portátil PostgreSQL 17.12 em diretório temporário, escutando em `127.0.0.1:55439`. Banco `solarsystem_validation`, fuso `America/Sao_Paulo`, sem dados reais. |
| `prisma migrate deploy --schema <cópia-temporária>/schema.prisma`                                                             | Aplicou as três migrations de base, copiadas com o lock para um diretório temporário.                                                                                   |
| `psql -X -v ON_ERROR_STOP=1 -f fixture.sql`                                                                                   | Inseriu dados sintéticos no esquema anterior e guardou cópias das linhas legadas de usinas e alertas para comparação.                                                   |
| `npm run db:deploy -w apps/api`                                                                                               | Aplicou as cinco migrations novas sobre os dados de teste.                                                                                                              |
| `psql -X -v ON_ERROR_STOP=1 -f checks.sql`                                                                                    | Passaram as asserções de preservação e os testes de inserção, alteração, consulta e exclusão controlada descritos abaixo.                                               |
| `npm exec -w apps/api -- prisma migrate status`                                                                               | Oito migrations reconhecidas e banco atualizado.                                                                                                                        |
| `npm exec -w apps/api -- prisma migrate diff --from-url <URL-isolada> --to-schema-datamodel prisma/schema.prisma --exit-code` | Código 0, sem diferenças nas estruturas representáveis pelo Prisma. O SQL versionado também contém checks, índices parciais e triggers.                                 |

### Ensaio de atualização e operações

- A amostra legada continha uma integração, um cliente, um usuário, uma usina associada ao cliente com telemetria e UF livre, uma segunda usina com campos nulos e um alerta reconhecido. A comparação antes/depois confirmou que todos os campos legados das duas usinas e do alerta foram preservados, incluindo IDs, referências, datas e métricas. O backfill criou dois vínculos ativos e dois eventos de auditoria, preservou os overrides, manteve nula a amostra ausente e deixou vazio o histórico inicial.
- As operações criaram e editaram uma usina manual, cadastraram dois inversores e gravaram e consultaram leituras de usina e de inversor. A consulta temporal confirmou que o instante local das 11h foi recuperado como 14h UTC.
- O banco rejeitou projeção divergente, alteração de identidade da usina, cascata que alteraria a identidade do vínculo, coordenada incompleta, duplicidade de serial normalizado e de amostra agregada, equipamento ou fonte de outra usina e alteração da medição. As verificações exigiram os códigos SQLSTATE esperados (`23514`, `23505`, `23503`).
- As tentativas de exclusão de integração, usina, inversor medido e vínculo referenciado foram bloqueadas. A exclusão controlada do usuário limpou a referência no alerta, e a do cliente limpou a referência na usina. As operações ocorreram em transação com `ROLLBACK`, exclusivamente sobre a amostra sintética.
- O ensaio cobre a atualização de uma base representativa pequena. Tempo de implantação, planos de execução em escala e dados específicos de cada ambiente seguem pendentes para homologação.

A consulta final a `pg_indexes` confirmou os dois índices únicos parciais. Após o rollback, o banco continha duas usinas, um alerta, um cliente, um usuário e zero medições. O servidor temporário foi encerrado com `pg_ctl stop -m smart`.

## Riscos e pendências

- **Dados legados fora da regra nova.** Um ID externo vazio era legal na base anterior e bloqueia a criação do vínculo. Em bancos já expandidos, divergências na projeção também bloqueiam a migration de integridade. O tratamento requer conciliação explícita por ambiente.
- **Janela de implantação.** O catálogo altera FKs, copia linhas e atualiza toda a tabela de usinas. As constraints e os índices seguintes exigem locks e podem concorrer com sincronizações e escritas. Meça duração, WAL, espaço e espera por locks em uma cópia representativa.
- **Integridade além das FKs.** A medição garante a usina do vínculo e do inversor. A escrita via aplicação obtém o provedor da integração. O SQL, sozinho, permite gravar com vínculo desvinculado e não compara a integração do inversor com a integração do vínculo. Uma futura ampliação de provedores também exigirá verificar coerência entre `source_provider` e a fonte real.
- **Escritas administrativas.** A imutabilidade da medição cobre `UPDATE`. Um papel com permissão de `DELETE` pode remover leituras diretamente. Use permissões coerentes com a retenção esperada. `SET NULL` preserva a linha filha, mas remove o vínculo com o cliente ou reconhecedor.
- **Alertas.** FKs opcionais permitem alvos ausentes ou simultâneos e não garantem que só um alerta ativo exista por alvo e tipo. A busca antes da criação pode disputar com outra escrita. Consultas por integração/tipo/status e verificações de FK em `alerts.integration_id`, `alerts.acknowledged_by_id` e `plant_discoveries.plant_id` merecem avaliação com dados reais.
- **Crescimento do histórico.** Cada leitura mantém múltiplos índices. Contagens, paginação e exportações podem encarecer com o volume. Meça com `EXPLAIN (ANALYZE, BUFFERS)` em homologação e dados representativos antes de decidir sobre novos índices ou retenção.

## Implantação segura em outros ambientes

1. Identifique o ambiente e o alvo da conexão pelo host, banco e schema. Confirme o histórico com `npm exec -w apps/api -- prisma migrate status`. Examine migrations pendentes ou falhas antes de prosseguir.
2. Faça backup consistente e valide uma restauração em uma instância separada, com controle de acesso sobre credenciais e dados pessoais. Em homologação, ensaie a partir do mesmo histórico e de um volume equivalente.
3. Antes do catálogo, consulte IDs externos vazios em `plants` e exporte uma referência verificável das contagens, IDs, clientes, alertas, datas e métricas. Se o catálogo já estiver aplicado e faltar a integridade, confira o vínculo ativo com um `LEFT JOIN` por usina e compare os pares com `IS DISTINCT FROM`. Resolva divergências por um procedimento aprovado antes do deploy.
4. Em janela acordada, suspenda escritas e jobs de sincronização. Com o artefato da mesma revisão já gerado e validado, confirme o alvo e execute `npm run db:deploy -w apps/api` com a credencial de migration.
5. Confira `prisma migrate status`, contagens e amostras preservadas, vínculos, integrações, alertas e leituras esperadas. Suba a API compatível, faça testes de leitura e de saúde e reative os jobs acompanhando erros e latência.
6. Em falha, mantenha os escritores suspensos, preserve logs e confira `_prisma_migrations` e o estado efetivo de cada transação. Defina recuperação com backup validado ou migration corretiva versionada. Use `prisma migrate resolve` somente após confirmar o estado e a estratégia formal de recuperação.

## Parecer da Etapa 2

**Pronta para aprovação da modelagem.** Schema, geração, build, testes unitários, aplicação das migrations e preservação da amostra legada passaram. A liberação da implantação depende de backup com restauração verificada, pré-checagem dos dados de destino e ensaio da janela em homologação representativa.
