# Alarmes, notificações e relatórios

Implementação validada em 24/11/2026. API NestJS e painel React mantêm autenticação por cookie, CSRF nas escritas e isolamento por cliente. Não foi aplicado SQL em banco real nem enviado e-mail real durante esta implementação.

## Detecção e ciclo de vida

- `PLANT_FAULT`: estado FAULT informado pela fonte, com comunicação recente. Não identifica um defeito específico de inversor sem informação do fabricante.
- `PLANT_OFFLINE`: fonte informa OFFLINE ou último dado ultrapassa a tolerância configurada. Uma fonte recém-vinculada sem leituras recebe a mesma tolerância antes da primeira ocorrência.
- `SYNC_FAILED`: falha de coleta da integração, com mensagem sanitizada; visível somente à equipe.
- `GENERATION_ABNORMAL`: potência persistentemente abaixo/acima da fração configurada da capacidade em kWp. É uma comparação de limites operacionais, sem previsão meteorológica, irradiância ou estimativa de geração ideal.

O agendador avalia integrações habilitadas, não arquivadas e fontes ativas a cada 60 segundos, independentemente de a próxima coleta ter sucesso. A sincronização continua avaliando alarmes dentro da sua transação. Usinas manuais sem fonte não recebem alertas artificiais de comunicação/geração. Integrações pausadas ou desvinculadas não produzem novos episódios; episódios anteriores são preservados e podem ser encerrados pela equipe com justificativa.

A política por usina começa com geração anormal **desabilitada**, comunicação de 60 minutos, limites de 5% e 120% da capacidade, persistência de 10 minutos, mínimo de três leituras, janela civil de 08h a 17h e fuso `America/Sao_Paulo`. ADMIN pode ajustar esses parâmetros. Não existem percentuais ideais universais: revisar capacidade, horários, clima local e intervalo real de coleta antes de habilitar.

A regra de geração consulta até 1.000 leituras persistidas das últimas 24 horas, da mesma fonte e do agregado da usina (`inverterId = null`). Exige qualidade VALID, potência conhecida, finita e não negativa, sequência dentro do mesmo dia/janela, quantidade e duração mínimas, sem lacunas superiores à tolerância. Ausência, PARTIAL/INVALID, leitura futura, noite ou evidência insuficiente não abrem nem resolvem esse alerta. DEMO exige opt-in específico para avaliação de geração e permanece simulado. Não há inferência de falha de um equipamento individual a partir desses limites.

Cada episódio segue `OPEN → ACKNOWLEDGED → RESOLVED`, admitindo resolução direta de OPEN. Reconhecer novamente é idempotente e preserva o primeiro responsável. Um episódio resolvido não reabre; nova ocorrência recebe outro UUID. Recuperação automática exige evidência recente/conclusiva; geração exige uma sequência NORMAL com a mesma persistência. A resolução manual exige justificativa de 3 a 500 caracteres e é recusada enquanto a condição monitorada persiste ou é inconclusiva. Desativar a política/monitoramento permite encerrar um episódio obsoleto após revisão.

Índices únicos parciais impedem dois episódios ativos por usina/tipo ou integração/tipo, inclusive entre processos. Os escritores usam o lock de catálogo existente e a criação tolera conflito de unicidade sem duplicar eventos. Triggers registram abertura, reconhecimento e resolução atomicamente, com ator quando disponível, motivo e marca de simulação. Eventos são imutáveis; tentativas de exclusão ou edição são recusadas. A leitura do histórico é paginada e CLIENT não recebe identificadores de atores internos.

## E-mail configurável e rastreável

ADMIN configura em **Configurações** os destinatários (até dez, únicos), eventos desejados e habilitação global. A política de detecção é configurada separadamente por usina. As revisões de configuração impedem sobrescrita silenciosa por duas telas abertas.

Também é necessário preparar o servidor; valores de exemplo não são credenciais reais:

```dotenv
SMTP_URL=smtps://USUARIO:SENHA@SMTP_EXEMPLO:465
ALERT_EMAIL_FROM=alarmes@example.com
ALERT_EMAIL_WORKER_ENABLED=false
ALERT_EVALUATION_INTERVAL_SECONDS=60
```

Substituir host/credenciais em ambiente autorizado, proteger o `.env` e só definir `ALERT_EMAIL_WORKER_ENABLED=true` quando o envio real for desejado. Em produção o transporte exige TLS. `SMTP_URL` pode ser compartilhado com recuperação de senha; `ALERT_EMAIL_FROM` é independente de `PASSWORD_RESET_FROM`. O exemplo versionado mantém remetente/SMTP vazios e worker falso. Intervalo zero desliga apenas o agendador de detecção; não desativa a avaliação da sincronização nem, se habilitado separadamente, o worker de e-mail. Em NODE_ENV=test nenhum timer é iniciado.

A mesma transação do evento insere um item por destinatário na fila persistida. A chave `(eventId, recipient)` impede duplicação. Não há e-mail retroativo para o histórico existente nem para eventos que ocorreram com notificações desabilitadas. Antes de enviar, o worker verifica novamente habilitação, destinatário, tipo de evento e simulação. Desabilitar no painel faz itens pendentes deixarem de ser elegíveis; não cancela uma transmissão SMTP já iniciada.

O worker consulta a fila a cada minuto, processa até 20 itens por passagem/processo e reserva cada item com `FOR UPDATE SKIP LOCKED`. A reserva é confirmada antes da chamada SMTP; não há transação de banco aberta durante a rede. O timer de avaliação é independente do de entrega.

| Estado  | Significado                                                                   |
| ------- | ----------------------------------------------------------------------------- |
| PENDING | Aguarda processamento; não significa enviado                                  |
| SENDING | Reservado para tentativa                                                      |
| SENT    | Destinatário aceito pelo servidor SMTP; não comprova entrega/leitura          |
| FAILED  | Rejeição explícita retornada pelo transporte                                  |
| UNKNOWN | Resultado incerto, exceção SMTP ou reserva interrompida há mais de 15 minutos |
| SKIPPED | Configuração deixou de permitir envio ou evento é simulado                    |

Não há reenvio automático de FAILED/UNKNOWN: uma repetição após resultado incerto poderia duplicar e-mails. Reconciliação operacional/reenvio manual controlado é uma evolução futura. Não há garantia de exactly-once na caixa postal. Mensagens usam assunto fixo e texto simples, sem anexos/URLs/arquivos externos ou erros brutos de provedores.

**DEMO nunca gera notificação real.** Marca de simulação acompanha o episódio e seus eventos. Na migration, alertas antigos ligados a DEMO são reconhecidos conservadoramente pelo histórico de vínculos, inclusive fontes já desvinculadas; a marca acompanha resoluções posteriores. A fila e o transporte têm verificações adicionais. O único adaptador atual continua sendo DEMO; nenhum fabricante novo foi implementado.

## Consultas e permissões

Prefixo público `/api`; UUIDs nos parâmetros. Escritas exigem cookie de sessão e `X-CSRF-Protection: 1`, com verificação de origem conforme o fluxo existente.

| Endpoint                                    | Perfis / comportamento                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| GET `/alerts`                               | Equipe: todos; CLIENT: somente alertas das próprias usinas, sem SYNC_FAILED; filtros status, ativos, type, plantId e paginação |
| PATCH `/alerts/:id/ack`                     | ADMIN/OPERATOR; reconhecimento idempotente                                                                                     |
| PATCH `/alerts/:id/resolve`                 | ADMIN/OPERATOR; corpo `{ "reason": "Condição revisada e encerrada" }`                                                          |
| GET `/alerts/:id/history`                   | Escopo do alerta e paginação pagina/porPagina                                                                                  |
| GET/PATCH `/plants/:plantId/alert-policy`   | ADMIN; PATCH exige revision e campos que deseja alterar                                                                        |
| GET/PATCH `/alerts/notification-settings`   | ADMIN; PATCH exige revision; enabled, recipients e statuses opcionais, validados em conjunto                                   |
| GET `/alerts/notifications`                 | ADMIN; histórico paginado de tentativas, sem expor credenciais SMTP                                                            |
| GET `/plants/:plantId/measurements/sources` | Equipe/CLIENT autorizado; fontes atuais e históricas com UUID, provedor, datas e estado, sem credenciais/identidade externa    |
| GET `/plants/:plantId/reports`              | Equipe/CLIENT autorizado; agrupamento JSON                                                                                     |
| GET `/plants/:plantId/reports/csv`          | Mesmos filtros/escopo; anexo CSV de todos os períodos do recorte                                                               |
| GET `/plants/:plantId/reports/pdf`          | Mesmos filtros/escopo; anexo PDF paginado                                                                                      |

Clientes sem vínculo ou acessando usina/fonte/inversor alheio recebem resposta sem dados. Consultas SQL de relatório e fontes repetem o filtro de cliente, além da autorização inicial. Respostas autenticadas mantêm `Cache-Control: private, no-store`.

## Relatórios e integridade energética

Exemplo de filtros (UUID apenas ilustrativo):

```text
from=2026-01-01T00:00:00Z
to=2027-01-01T00:00:00Z
sourceLinkId=11111111-1111-4111-8111-111111111111
period=month
timeZone=America/Sao_Paulo
includeSimulated=false
```

`period` aceita day/month/year; o agrupamento respeita o fuso civil IANA/UTC informado. Datas aceitam offsets e são normalizadas a UTC nos metadados do relatório. `to` é exclusivo para amostras instantâneas. Um intervalo energético que termina exatamente em `to` pode ser aceito, pois representa `[periodStartAt, measuredAt)`. O intervalo máximo é 3.660 dias. `sourceLinkId` é obrigatório para evitar misturar fontes; `inverterId` é opcional e, ausente, consulta somente medições agregadas da usina. O painel oferece fontes ativas e históricas, inclusive após desvinculação.

Os novos relatórios agregam no PostgreSQL e retornam somente períodos agrupados. Não transportam nem truncam as leituras no limite de 50.000 do endpoint antigo `/measurements/aggregations`, que foi preservado. O teste anual usa 105.120 leituras de cinco minutos e confirma processamento completo.

- **Potência:** pico observado das amostras não INVALID, nunca soma de kW ou média suposta de intervalos. PARTIAL permanece contada como amostra utilizável, sem ser aceita como energia confiável.
- **Energia acumulada:** não é somada nem convertida em energia diária por diferenças sem política de resets e cobertura.
- **Energia produzida:** somente `periodEnergyKwh` explícito, qualidade VALID, intervalo inteiramente dentro do recorte e do período civil. Intervalos sobrepostos, parciais, inválidos ou cruzando períodos são excluídos; não se rateia arbitrariamente.
- **Ausência:** valores desconhecidos permanecem null/vazios/“Não disponível”. Dias ausentes não viram zero. Contadores de amostras/períodos aceitos/excluídos e cobertura `NOT_ESTABLISHED` impedem interpretar soma observada como geração total certificada.
- **Simulação:** excluída por padrão; opt-in explícito e marcação no resultado, gráfico, CSV e PDF. O DEMO atual não fornece energia explícita de período, portanto esse total pode permanecer indisponível.

O painel mantém filtros, loading, erros e permissões. Gráfico SVG mostra os últimos 24 períodos disponíveis e a tabela/exportação mantém o recorte completo; rolagem do gráfico fica contida em telas pequenas. O CSV completo inclui fonte, UTC, agrupamento, fuso, qualidade/cobertura e simulação, escapa células e protege fórmulas. CSV de leituras continua identificado como exportação da página. O PDF usa PDFKit, inclui identificação do recorte/fonte, barras de pico, avisos, dados por período e paginação. Não há gravação de PDF/CSV no banco nem criação de medições durante consultas/exportação.

## Banco e implantação

Migration nova: `apps/api/prisma/migrations/20261125010000_alerts_reporting/migration.sql`. Adiciona tipo de alerta, colunas, tabelas de políticas/eventos/configuração/fila, índices e triggers. Preserva UUIDs, alertas, campos antigos e demais tabelas. Preenche somente a coluna nova de simulação nos episódios legados identificados como DEMO. Cria uma linha de base com os horários antigos interpretados em UTC e sem enfileirar e-mails. Ator permanece como identificador histórico opcional, sem exclusão em cascata.

Antes de criar os índices, a migration **interrompe se encontrar episódios ativos duplicados**, sem apagar nem resolver registros. A conciliação precisa ser revisada e autorizada; não foi executada automaticamente. O novo valor do enum é confirmado antes da transação principal e pode permanecer após falha posterior. Um deploy que falhar exige investigar causa e estado do histórico Prisma antes de nova tentativa; não editar migrations aplicadas nem usar reset/db push.

Aplicar pelo procedimento autorizado de implantação, com backup e ensaio em PostgreSQL isolado, antes de iniciar esta versão da API. Nenhuma migration foi aplicada à instância do usuário. Os índices parciais, checks e triggers são SQL deliberado e não devem ser substituídos somente pela representação Prisma. Políticas, histórico e fila aumentam o volume persistido; retenção/arquivamento devem preservar auditoria. A consulta por fonte/usina/período usa os índices já existentes de medições; carga concorrente e planos de consulta exigem aferição no servidor de destino.

## Validação e limites

Ambiente: Windows, Node 24.22.3, Prisma 6.19.3, Edge/Playwright. PDFKit 0.21.0 e tipos adicionados ao workspace da API; dependências prévias do lockfile preservadas. Testes unitários usam VM Modules como os E2E por causa de dependências ESM; o aviso experimental do Node permanece. Prisma avisa que `package.json#prisma` será descontinuado na versão 7; não houve atualização de versão/configuração para ocultar o aviso.

Com Node no PATH e dependências instaladas:

```powershell
npm run db:generate -w apps/api
npm run test:api
npm run test:e2e
npm run typecheck
npm run lint:check
npm run build
$env:BROWSER_CHANNEL = 'msedge'
npm test -w apps/painel
Remove-Item Env:BROWSER_CHANNEL
```

Integração SQL opcional, após build, com PGlite instalado em diretório de testes separado (não acessa URLs ou `.env`):

```powershell
$env:PGLITE_MODULE_PATH = 'C:\FERRAMENTAS_TESTE\node_modules\@electric-sql\pglite'
node --test apps/api/test/alerts-reports.test.cjs
Remove-Item Env:PGLITE_MODULE_PATH
```

O teste SQL cobre preservação, deduplicação de episódios/fila, transições, imutabilidade, bloqueio de duplicatas antigas, DEMO desvinculado, fusos/limites/overlaps, isolamento e ano completo. Testes HTTP usam autenticação/CSRF e serializers reais, com Prisma mockado; testes de navegador interceptam `/api/**` com fixtures somente de teste. SMTP é mockado: aceite/rejeição/resultado incerto/desabilitação/DEMO não enviam mensagens. PDF efetivo foi gerado, renderizado e inspecionado visualmente, incluindo múltiplas páginas.

| Verificação                                                    | Resultado                                                                                                             |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Unitários API                                                  | PASSOU: 192 testes em 27 suítes                                                                                       |
| E2E HTTP/API                                                   | PASSOU: 117 testes; três testes de PostgreSQL real pulados                                                            |
| Integração SQL WASM e regressões das migrations                | PASSOU: 11 testes, incluindo quatro de alarmes/relatórios                                                             |
| Navegador Edge                                                 | PASSOU: três testes/fluxos, incluindo reconhecimento, resolução, histórico, política, e-mail, gráficos e download PDF |
| Prisma format/validate/generate                                | PASSOU, sem conexão ao banco                                                                                          |
| TypeScript e builds API/painel                                 | PASSOU                                                                                                                |
| ESLint sem fix, formatação dos arquivos alterados e diff check | PASSOU                                                                                                                |
| Inspeção PDF                                                   | PASSOU: exportação anual e documento de três páginas sem cortes/sobreposição                                          |
| SMTP real e migrations no banco do usuário                     | NÃO EXECUTADOS                                                                                                        |

Pendências de homologação: aplicar migrations em PostgreSQL isolado autorizado e testar driver Prisma/concorrência entre processos, aferir carga e retenção, validar TLS/SMTP e entrega com destinatários autorizados, testar Node 26 e acessibilidade assistiva. Três E2E de PostgreSQL real permanecem pulados sem ambiente seguro configurado. Não houve commit, push, reset ou limpeza de banco.
