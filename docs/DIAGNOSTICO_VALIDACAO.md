# Diagnóstico de build, testes e qualidade

## 1. Escopo e conclusão

Auditoria da Tarefa 02 em 23/11/2026, no checkout local do SolarSystem. Resultado: **validação parcial; não é possível certificar a estabilidade do projeto inteiro neste ambiente**.

Os seis testes de navegador do HTML passaram, assim como a análise sintática dos nove scripts dessa interface. Builds, verificações TypeScript, Prettier, ESLint e testes unitários da API estão bloqueados por ferramentas/dependências ausentes. O E2E da API não foi iniciado por falta de isolamento comprovado e por efeitos de escrita possíveis na inicialização. Nenhum desses impedimentos deve ser apresentado como erro de compilação ou teste reprovado.

Esta tarefa acrescenta somente este documento. Não corrige fontes/configurações, não instala dependências, não modifica lockfiles, não acessa banco e não executa migrations, reset, seed, commit ou push.

## 2. Ambiente e Git

| Item | Evidência |
| --- | --- |
| Sistema | Windows NT 10.0.26200.0 |
| Shell | Windows PowerShell 5.1.26100.9818 |
| Repositório | `C:\Users\atosm\OneDrive\Desktop\web\SolarSystem` |
| Branch | `main` |
| HEAD | `6a08999` — adiciona estratégia de consolidação do frontend em React |
| Estado inicial | `git status --short` vazio; nenhuma alteração local preexistente encontrada |
| Origem da revisão | Checkout local; sem fetch/pull ou afirmação de atualização em relação ao servidor |
| Node no PATH | `Get-Command node,npm` não encontrou os comandos |
| Node alternativo | Runtime já instalado do Codex: **v24.22.3** |
| npm | Ausente no PATH e sem `npm-cli.js` na instalação Node do runtime consultada; versão não determinada |
| Versão declarada | `.nvmrc`: **26**; `package.json` raiz: **>=22.12.0** |
| Dependências raiz/API/painel | `node_modules` ausente na raiz e em `apps/api`/`apps/painel` |
| Dependências HTML | `apps/web/tests/node_modules` presente; Playwright instalado **1.62.1**, igual ao lockfile isolado |
| Navegador utilizado | Microsoft Edge **158.0.4370.33**, executável já instalado |
| Banco | Nenhuma conexão iniciada; disponibilidade, dados e natureza do banco não foram investigados |

O executável utilizado foi obtido do pacote instalado `OpenAI.CodexPrimaryRuntime.v26-1119-907-0`, sem download:

```powershell
$runtimeAudit = (Get-AppxPackage 'OpenAI.CodexPrimaryRuntime*' |
  Select-Object -First 1).InstallLocation
$nodeAudit = Join-Path $runtimeAudit 'dependencies\node\bin\node.exe'
& $nodeAudit --version
```

O caminho expandido está sob `C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt\dependencies\node\bin\node.exe`. Nenhuma variável de ambiente persistente do sistema foi alterada.

## 3. Scripts, ferramentas e dependências

### Scripts disponíveis e cuidados

- Raiz: `format` aplica `prettier --write .`; **não executado**. `format: check` executa `prettier --check .` (o nome contém espaço; uso via npm requer aspas).
- Painel: `dev`, `build` (`tsc --noEmit && vite build`), `preview`, `format` (`--write`; não executado). Não há scripts de teste ou lint próprios.
- API: build Nest, start/dev/debug/prod, testes Jest/unitários/cobertura/E2E e scripts Prisma. O script `lint` inclui **`--fix`**; não foi utilizado. `format` também escreve arquivos e não foi utilizado.
- API: `postinstall` roda `prisma generate`. Uma instalação futura gera artefatos; não confundir geração de cliente com migration. Nenhum script de instalação foi acionado nesta tarefa.
- HTML: pacote de testes isolado, com `test` equivalente a `node --test frontend.test.cjs`.
- `.prettierignore` exclui `node_modules`, `dist`, `coverage` e `package-lock.json`. `.prettierrc` define aspas simples, ponto e vírgula, largura 110 e LF.
- ESLint configurado somente na API (`apps/api/eslint.config.mjs`), com regras TypeScript tipadas e integração Prettier. Não foi localizado arquivo de configuração ESLint próprio para painel/HTML.

### Consistência local dos lockfiles

A comparação por script Node entre declarações diretas e resoluções do `package-lock.json` raiz retornou **zero divergências** para os manifestos raiz, API e painel. A verificação conferiu faixas semver, existência das entradas e correspondência das declarações com as entradas de workspace. Não é auditoria completa de dependências transitivas, integridade de downloads ou vulnerabilidades.

| Dependência | Resolução no lockfile | Observação |
| --- | --- | --- |
| React / React DOM | 19.3.1 / 19.3.1 | Declaradas pelo painel |
| React Router | 8.5.2 | Exige Node >=22.22.0 no lockfile |
| Vite | 8.3.8 | Engine `^20.19.0 || >=22.12.0` |
| TypeScript da API/raiz | 5.9.3 | Resolução da faixa ^5.7.3 |
| TypeScript do painel | 7.0.2 | Entrada separada `apps/painel/node_modules/typescript` |
| Nest core | 11.2.10 | Engine >=20 |
| Jest / ts-jest | 30.5.2 / 29.4.15 | O peer de Jest em ts-jest aceita 29 ou 30; não concluir incompatibilidade apenas pelos números principais |
| TypeScript aceito por ts-jest | >=4.3 <7 | API resolve TS 5.9.3; não usar o compilador TS 7 do painel para os testes da API |
| Prettier / ESLint | 3.10.1 / 9.39.5 | Resolvidos no lockfile, mas não instalados neste checkout |
| Playwright HTML | 1.62.1 | Manifesto, lock isolado e pacote instalado coincidem |

**Inconsistência confirmada de requisito:** a raiz permite Node 22.12.0, mas o React Router resolvido exige >=22.22.0. Assim, nem toda versão aceita pelo manifesto raiz atende à árvore resolvida. O Node 24.22.3 desta auditoria satisfaz essas engines consultadas, porém não reproduz o Node 26 indicado em `.nvmrc`. Definir uma versão comum e testá-la é pendência, sem editar manifestos nesta tarefa.

## 4. Comandos executados e resultados

Os comandos foram executados a partir da raiz do repositório, salvo indicação. `Get-Content`/`rg` também foram usados para leitura de manifestos, configuração, schema e testes; nenhum `.env` real ou segredo foi impresso.

| Comando/verificação efetivamente executado | Resultado |
| --- | --- |
| `git status --short`, `git branch --show-current`, `git log -1 --oneline` | `main`, HEAD `6a08999`, árvore inicial limpa |
| `Get-Command node,npm -ErrorAction SilentlyContinue` | Comandos não encontrados no PATH; impedimento do ambiente |
| `Get-AppxPackage '*Codex*'` e inspeção do diretório Node do runtime | Localizado executável Node alternativo já instalado; npm não encontrado nessa instalação |
| `& $nodeAudit --version` | v24.22.3; exit 0 |
| `Test-Path node_modules`, `apps/api/node_modules`, `apps/painel/node_modules` e verificação dos CLIs locais | Ausentes: Nest CLI, tsc, Vite, Prettier, ESLint e Jest do projeto |
| Script Node de leitura dos manifestos/lock com semver do runtime | Zero divergências diretas raiz/API/painel; engines e peers relevantes inventariados |
| Script Node de leitura do pacote/lock HTML | Playwright 1.62.1 coincide com o instalado |
| `$env:BROWSER_CHANNEL = 'msedge'; & $nodeAudit --test apps/web/tests/frontend.test.cjs` | **6 passaram, 0 falharam, 0 ignorados**, exit 0; duração reportada 11.206,058 ms (aprox. 11,2 s) |
| `& $nodeAudit --check <arquivo>` para cada um dos nove arquivos de `apps/web/scripts/*.js` | Todos passaram; checagem de parsing, não lint nem validação funcional completa |
| Script Node de inventário dos `*.spec.ts` da API | 6 arquivos, 26 chamadas `it(...)` encontradas estaticamente; não significa 26 testes executados |
| `git diff --check` | Passou para alterações rastreadas; antes da criação do relatório, sem alterações |

A leitura do lockfile com `ConvertFrom-Json` do PowerShell 5.1 falhou com `InvalidArgument`; a análise foi refeita com `JSON.parse` no Node e concluiu com sucesso. Isso é limitação da ferramenta de inspeção usada, **não evidência de JSON inválido** no projeto.

### Testes HTML executados

A suíte sobe servidor temporário em `127.0.0.1` com porta aleatória, abre contextos de navegador isolados e usa fixtures próprias. Não usa o perfil pessoal do Edge nem conecta à API/PostgreSQL. Servidor/contextos são encerrados pelos hooks da suíte. O canal Edge foi selecionado explicitamente; não se pressupôs um Chromium Playwright baixado.

Todos estes seis casos passaram:

1. Login demonstrativo, preferência de e-mail, recuperação e diálogo de cadastro.
2. Cadastro/edição de usina, validação de séries, edição e remoção de equipamentos.
3. Relatórios com homônimos, exportação protegida, alarmes e indicadores.
4. Dados inválidos, falha de gravação, conflito entre abas e restauração aditiva.
5. Leitura bloqueada, lista vazia e links para cadastros inexistentes.
6. Oito telas em sete larguras e reflow equivalente a 200% em 1366 × 768, incluindo controles, menu e perfil por teclado.

O último caso verifica reflow/DOM, e não uma inspeção visual humana ou certificação completa WCAG. A aprovação no Edge não comprova compatibilidade com todos os navegadores.

Parsing JavaScript aprovado: `app.js`, `dashboard.js`, `internal-shell.js`, `internal.js`, `login.js`, `plant-store.js`, `registration.js`, `sidebar.js` e `user-profile.js`.

## 5. Verificações bloqueadas ou não executadas

Estes comandos são **roteiro para execução posterior**, não resultados obtidos. Evitou-se invocar `npx`, que poderia baixar ferramentas implicitamente, ou scripts de correção. Instalar ferramentas globalmente diferentes das resolvidas também não comprovaria o build do checkout.

| Verificação | Comando previsto, após ambiente preparado | Estado e motivo |
| --- | --- | --- |
| Build React | `npm run build -w apps/painel` | Bloqueado: npm e dependências/CLIs do workspace ausentes |
| Build NestJS | `npm run build -w apps/api` | Bloqueado: npm, Nest CLI e dependências ausentes |
| TypeScript painel | Na pasta `apps/painel`: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | Bloqueado: compilador TS 7 local ausente |
| TypeScript API | Na pasta `apps/api`: `node ../../node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json` | Bloqueado: compilador/dependências e cliente Prisma gerado não disponíveis; inclui fontes de teste conforme tsconfig |
| Prettier | Na raiz: `node node_modules/prettier/bin/prettier.cjs --check .` | Bloqueado: CLI ausente; não há conclusão sobre quantidade de arquivos fora do padrão |
| ESLint API sem correção | Na pasta `apps/api`: `node ../../node_modules/eslint/bin/eslint.js "{src,apps,libs,test}/**/*.ts" --no-fix` | Bloqueado: CLI/parser/plugins ausentes; não foi usado `npm run lint` |
| ESLint React/HTML | Definir escopo/configuração antes de executar | Não configurado; não aplicar automaticamente a configuração Nest ao React |
| Unitários API | `npm run test -w apps/api -- --runInBand --no-cache` | Bloqueado: Jest, transformador e dependências ausentes |
| Cobertura API | `npm run test -w apps/api -- --runInBand --no-cache --coverage --coverageReporters=text --coverageDirectory=<pasta-de-auditoria>` | Não executado; mesma barreira; não há percentual medido |
| E2E API | `npm run test:e2e -w apps/api -- --runInBand --no-cache` | **Não executado por segurança**, além das dependências ausentes; precisa ambiente de teste separado |

Os caminhos acima refletem o layout do lockfile atual; confirmar a resolução depois da instalação. O build gera `dist`; Nest tem `deleteOutDir: true`, portanto verificar artefatos existentes antes de executá-lo. Nenhum build foi iniciado e nenhum `dist` foi apagado nesta tarefa.

### Motivo específico para não executar o E2E da API

`apps/api/test/app.e2e-spec.ts` importa `AppModule` e chama `app.init()`. `ConfigModule` pode carregar configuração real, `PrismaService.onModuleInit()` conecta ao banco e `SyncScheduler.onApplicationBootstrap()` pode executar sincronização e gravar usinas/alertas (intervalo padrão 10 minutos, com primeira execução na inicialização). Não há configuração isolada de banco comprovada nem override do agendador nesse teste. Definir apenas `NODE_ENV=test` não garante isolamento.

Além disso, o teste ainda espera `GET /` responder `Hello World!`. O controlador atual é `@Controller('health')`, com `getHealth()`, não a rota raiz do template. O teste também cria a aplicação sem o prefixo `/api` definido em `main.ts`. Trata-se de **incompatibilidade estática confirmada** entre teste e implementação, não de uma falha observada em execução.

Pré-condições para futura execução: banco descartável separado, variáveis de teste explícitas sem fallback para credenciais reais, sincronização desativada (`SYNC_INTERVAL_MIN=0`) ou substituída por mock, teste atualizado para a configuração HTTP desejada e encerramento das conexões. Não preparar esse banco por reset/seed de ambiente existente.

## 6. Cobertura existente e lacunas

Não foi gerado relatório de cobertura; “sem teste dedicado” não significa percentual de linhas igual a zero. Testes podem alcançar módulos indiretamente.

| Área | Evidência de testes | Lacuna |
| --- | --- | --- |
| HTML legado | 6 casos de navegador executados e aprovados | Sem cobertura de linhas instrumentada; execução apenas em Edge nesta auditoria |
| React | Não encontrados arquivos de teste nem scripts de teste no workspace | Login real, contexto, API client, rotas, Layout e Inicio sem testes dedicados encontrados |
| API usuários | `users.service.spec.ts` (8 casos), `users.schemas.spec.ts` (3) | Não executados; controllers/permissões HTTP precisam testes de integração |
| Cookie de sessão | `auth/sessao-cookie.spec.ts` (4) | Sem testes dedicados encontrados para `auth.service.ts`, `auth.guard.ts`, `roles.guard.ts` e fluxo login/logout/me completo |
| Saúde | `app.controller.spec.ts` (2), Prisma mockado | Não valida conexão real/isolada nem endpoint publicado |
| Adaptador DEMO | `providers/demo/demo.adapter.spec.ts` (4) | Sem validação de fabricantes externos; somente DEMO no catálogo atual |
| Regras de alerta | `alerts/alert-rules.spec.ts` (5) | Sem testes dedicados encontrados para persistência/reconhecimento em `alerts.service.ts` |
| Demais serviços API | Sem specs dedicadas encontradas para clients, plants, integrations e scheduler | Priorizar isolamento por cliente, falhas parciais e concorrência/sincronização |
| E2E API | Um arquivo de template | Desatualizado e sem isolamento demonstrado |

O Jest define `collectCoverageFrom: ["**/*.(t|j)s"]`, mas não define `coverageThreshold`. Não foi localizada pasta `.github` com pipeline neste checkout. Não há verificação automatizada de qualidade do painel configurada no manifesto além do build.

## 7. Problemas e prioridades

| Prioridade | Achado | Evidência/classificação | Correção recomendada, não executada |
| --- | --- | --- | --- |
| P1 | Ambiente não reproduzível para build/qualidade | npm e dependências raiz ausentes; `.nvmrc` 26 versus runtime 24 | Preparar Node/npm aprovados e instalar via lockfile em ambiente de desenvolvimento; então executar todos os checks bloqueados |
| P1 | Requisito mínimo de Node inconsistente | Raiz >=22.12.0 permite versões rejeitadas pelo Router >=22.22.0 | Harmonizar engines, `.nvmrc`, documentação e CI por decisão do projeto |
| P1 | E2E pode atingir banco real e disparar escritas | AppModule + Prisma + bootstrap de SyncScheduler, sem override isolado | Isolar banco/configuração e agendador antes de rodar |
| P1 | E2E espera contrato antigo do template | `GET /`/`Hello World!` versus controlador `health` | Reescrever teste para saúde e sessão reais, com bootstrap de teste coerente |
| P1 | Caminhos críticos React e autorização sem testes dedicados | Inventário de fontes/specs | Testar login/401/expiração/logout, perfil CLIENT e isolamento de usinas/alertas |
| P1 | Visão geral limita agregação à primeira página | `Inicio.tsx` pede `porPagina=100` e agrega `itens`, sem percorrer páginas | Cobrir >100 usinas/alertas e definir agregação sem truncamento; nenhuma alteração de contrato nesta auditoria |
| P2 | Logout React ignora falha do servidor | `auth.tsx` captura erro e limpa estado local | Testar retorno de sessão após falha; discutir correção separadamente sem modificar autenticação aqui |
| P2 | Indicadores podem confundir ausência com zero/normalidade | Somas com `?? 0`, rótulo “Ao vivo” e status sem validar idade da leitura em `Inicio.tsx` | Testar null/offline/leituras antigas e definir estados honestos de telemetria |
| P2 | Lint padrão da API aplica correções | `lint` inclui `--fix` | Criar posteriormente script separado de leitura; nesta auditoria usar comando direto `--no-fix` |
| P2 | Falta lint/teste dedicado do painel e gate de cobertura | Manifestos/configuração; nenhuma pipeline `.github` localizada | Configurar checks explícitos e limites de cobertura baseados em medição |
| P2 | Formatação não medida | Prettier não instalado | Rodar `--check`, revisar resultado antes de qualquer `--write` |
| P3 | Nome incomum do script `format: check` | Espaço na chave do manifesto | Padronizar nome se aprovado; não é um script intrinsecamente inválido |

P1 indica prioridade alta para certificar estabilidade; não significa exploração de segurança comprovada. Não foram confirmados erros de compilação nem falhas de testes executados. Também não se conclui ausência desses erros: os builds/unitários não puderam ser executados.

## 8. Limites e próximos passos

1. Preparar ambiente Node/npm alinhado à versão adotada e instalar dependências sem trocar lockfiles; conferir scripts de instalação antes de rodar.
2. Executar build React/API, TypeScript, Prettier e ESLint somente leitura e unitários/cobertura; acrescentar saídas reais a este diagnóstico.
3. Corrigir isolamento e expectativa do E2E em tarefa autorizada; só depois rodar contra ambiente descartável comprovado.
4. Priorizar testes de sessão, autorização e paginação do painel antes de usá-lo como substituto operacional do legado.

Não houve `npm install`, `npm ci`, `npm audit`, verificação online de vulnerabilidades, download de navegador, geração Prisma, migration, seed ou mudança em autenticação/API. As versões registradas são as evidências locais dos manifestos, lockfiles e executáveis; não uma recomendação das versões mais recentes.

Único arquivo novo desta entrega: `docs/DIAGNOSTICO_VALIDACAO.md`. Alterações de correção permanecem pendentes de autorização.
