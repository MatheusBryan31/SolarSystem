# Revisão e conclusão do núcleo da API

Data: 24/11/2026. Base inspecionada: branch `main`, HEAD `2402618`, árvore inicialmente limpa. Escopo: autenticação, segurança, usuários, clientes, usinas, inversores, relações/validações/permissões e execução do backend. Não houve recriação dos módulos, alteração visual nem execução de SQL contra banco real.

## Diagnóstico do núcleo existente

| Área             | Implementação preservada                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autenticação     | JWT em cookie httpOnly, SameSite Strict, Secure em produção; usuário ativo e versão da sessão conferidos no banco em cada acesso                                          |
| Segurança HTTP   | HTTPS obrigatório em produção, proxy confiável explícito, origem CORS exata, header CSRF nas escritas, limite de tentativas, respostas sem cache e erros sanitizados      |
| Senhas           | bcrypt com limite de 72 bytes UTF-8; troca/redefinição revogam sessões; token de recuperação aleatório, digest persistido, expiração e consumo atômico; SMTP configurável |
| Usuários         | Gestão exclusiva de ADMIN; whitelist de resposta sem hash/token; CLIENT vinculado a cliente existente; proteção contra desativar/rebaixar a si próprio                    |
| Clientes         | ADMIN/OPERATOR criam/editam; ADMIN exclui; CLIENT consulta somente seu cadastro; documento único e paginação                                                              |
| Usinas           | Cadastro único MANUAL/IMPORTED, UUID preservado, revisão, overrides por campo, cliente, detalhes técnicos e fonte externa reservada; isolamento por cliente               |
| Inversores       | Usina obrigatória, fabricante/série únicos normalizados, origem, revisão e arquivamento confirmado por ADMIN; consulta com escopo de cliente                              |
| Prisma/auditoria | Migrations aditivas, FKs restritivas de equipamento/fonte/histórico, constraints e triggers SQL, auditoria transacional sem payloads sensíveis                            |

A revisão usou os arquivos atuais, e não os resultados das tarefas anteriores. O checkout contém recuperação de senha, criptografia de credenciais e auditoria adicionadas depois da tarefa de medições; essas implementações foram preservadas.

## Falhas corrigidas

### Sessões e concorrência em alterações de usuário

Antes, somente a alteração da senha por administrador incrementava `sessionVersion`. Desativar e depois reativar uma conta permitia que seu cookie antigo voltasse a ser aceito. Agora mudanças efetivas de perfil, cliente, atividade ou e-mail também revogam todas as sessões e limpam links de recuperação; mudanças somente de nome não revogam sessões.

A leitura do estado atual e a validação de vínculo passaram para dentro da transação, depois de um advisory lock específico de alterações de usuários. Isso evita validar um perfil antigo e depois gravar uma combinação incompatível de perfil/cliente. O hash bcrypt é calculado antes de adquirir o lock.

Além da proteção contra o administrador remover seu próprio acesso, alterações que retirariam o último ADMIN ativo são recusadas com 409. A contagem é feita sob o mesmo lock; assim, requisições concorrentes de dois administradores não podem validar simultaneamente a remoção de ambos pelo fluxo da API. SQL administrativo direto continua sob responsabilidade do operador; não foi introduzida constraint de último administrador no banco.

### Preservação de vínculos de clientes

Antes, DELETE podia acionar as FKs `SetNull`, desligando usuários/usinas do cliente. Agora o serviço bloqueia a linha do cliente com `FOR UPDATE`, conta usuários/usinas na mesma transação e retorna 409 enquanto houver vínculos, inclusive com usuários desativados. O lock também protege contra novas referências por FK durante a exclusão.

Clientes sem vínculos continuam podendo ser excluídos por ADMIN com HTTP 204. Cliente inexistente retorna 404. Nenhuma FK ou migration existente foi alterada: a proteção é aplicada pela API, sem apagar dados nem desvincular cadastros automaticamente. A aplicação mantém a auditoria transacional da exclusão.

Campos opcionais de cliente (`document`, `email`, `phone`) agora aceitam null explícito para limpeza; omitir continua preservando o valor. PATCH vazio é recusado, em vez de gerar uma atualização sem conteúdo. Validações anteriores de formato permanecem.

Erros Prisma de referência concorrente (`P2003`) e registro desaparecido (`P2025`) nos serviços de usuários/clientes são convertidos em 409/404, respectivamente; duplicidade continua 409. Erros inesperados continuam sendo propagados ao filtro seguro, não são escondidos como sucesso.

### Execução e tipos

O build atual inclui fontes de `src` e utilitários de `prisma`; seu entrypoint é `dist/src/main.js`. O script `start:prod` apontava para `dist/main`. Foi corrigido para `node dist/src/main.js`, sem alterar a estrutura do build. Um teste verifica a existência do entrypoint compilado; não inicia servidor nem conecta a banco.

Os três arquivos E2E usavam o tipo `App` do Supertest como parâmetro de `NestExpressApplication`. Esse tipo também aceita string e não satisfaz o contrato de servidor do Nest/Express. Foram usados os tipos padrão corretos, sem casts para mascarar incompatibilidade e sem reduzir a cobertura dos guards.

Payload JSON acima do limite do parser agora retorna 413 com mensagem genérica e `no-store`, em vez de virar erro 500. A proteção CSRF continua obrigatória; não houve enfraquecimento de CORS, cookies ou permissões.

## Contratos e dados

As rotas existentes foram preservadas. Mudanças observáveis:

- Alterar acesso/identidade de um usuário invalida cookies e links de recuperação anteriores; o usuário deve entrar novamente.
- DELETE de cliente vinculado retorna 409 e exige revisar/reassociar os vínculos antes de excluir. Nenhum endpoint novo de desvinculação automática foi criado.
- PATCH vazio de cliente retorna 400; null pode limpar seus campos opcionais.
- Corpo HTTP excessivo retorna 413 sanitizado.

Nenhum schema, migration, UUID ou registro existente foi alterado. Não foram executados migrate deploy/dev/reset, db push, seed, conversão de credenciais ou comandos de banco real. A validação SQL foi exclusivamente em PostgreSQL embarcado em memória com fixtures descartáveis.

## Ambiente e comandos

Windows/PowerShell, Node 24.22.3, npm 11.6.2, Prisma 6.19.3. Node não estava no PATH padrão; os comandos foram chamados pelo runtime instalado e pelo npm local de apoio. No início, faltava `nodemailer` instalado e o Prisma Client estava desatualizado em relação ao schema: o build/TypeScript/E2E falhavam por isso. Foi executado `npm ci --ignore-scripts --no-audit --no-fund` na raiz, seguindo o lockfile, depois `prisma generate` no workspace da API. A geração não conecta ao banco. Manifestos de dependências e lockfile não foram atualizados.

| Verificação final                                                                                 | Resultado                                                                                                        |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Jest API `--runInBand --no-cache`                                                                 | PASSOU: 159 testes, 20 suítes, 16 testes novos                                                                   |
| E2E API `--experimental-vm-modules ...jest.js --config test/jest-e2e.json --runInBand --no-cache` | PASSOU: 104 testes HTTP; 3 testes de PostgreSQL real não executados (suite ignorada por ausência de URL isolada) |
| TypeScript API sem emissão/incremental                                                            | PASSOU                                                                                                           |
| ESLint API `--no-fix`                                                                             | PASSOU                                                                                                           |
| Build API                                                                                         | PASSOU                                                                                                           |
| Prisma generate/validate                                                                          | PASSOU, sem banco                                                                                                |
| Prettier dos arquivos alterados e `git diff --check`                                              | PASSOU                                                                                                           |
| Integração PGlite + verificação do entrypoint                                                     | PASSOU: 7 testes (6 SQL/serviços e 1 de arquivo compilado)                                                       |
| `npm audit --omit=dev --json`                                                                     | PENDÊNCIA: 4 alertas altos, nenhum crítico                                                                       |

Com ambiente habitual preparado, comandos equivalentes na raiz:

```powershell
npm run db:generate -w apps/api
npm run test:api -- --no-cache
npm run test:e2e -- --no-cache
npm run typecheck -w apps/api
npm run lint:check -w apps/api
npm run build -w apps/api
```

Os testes adicionais verificam revogação em mudanças de acesso e reativação, preservação de sessão em edição de nome, último administrador, remoção com vínculos, escopo de cliente, limpeza explícita de campos, payload excessivo e correção do entrypoint.

O teste `apps/api/test/core-integrity.test.cjs` utiliza serviços compilados reais e um adaptador SQL mínimo para PGlite. Aplica todo o histórico numa base vazia descartável e testa locks SQL, auditoria, bloqueio de exclusão vinculada e versões de sessão. Não é teste do driver Prisma em servidor nem prova de concorrência entre processos.

Depois do build, com a ferramenta PGlite externa já instalada e `PGLITE_MODULE_PATH` definido conforme [IMPLEMENTACAO_USINAS.md](IMPLEMENTACAO_USINAS.md):

```powershell
node --test apps/api/test/core-integrity.test.cjs apps/api/test/plant-migration.test.cjs apps/api/test/inverter-migration.test.cjs apps/api/test/plant-details-migration.test.cjs apps/api/test/measurement-migration.test.cjs
```

Não foram executados testes PostgreSQL de senha/credenciais ou isolamento com URLs reais. Não foi iniciado serviço de banco nem enviado e-mail real. Os E2E usam Prisma controlado e exercitam HTTP, controllers, serviços, cookies, CSRF e guards reais. A matriz de permissões existente foi preservada.

## Pendências para implantação

1. **Dependências:** `npm audit --omit=dev` identificou `deepmerge-ts` e `effect`, propagados por `@prisma/config`/`prisma`. `npm ls` confirma a cadeia pelo CLI Prisma 6.19.3. O npm sugere Prisma 7.10.1, mudança principal incompatível com a configuração atual; não foi aplicado `audit fix --force` nem override de versão principal transitiva. É necessária uma atualização planejada e teste das migrations, client, utilitários e implantação. O resultado do audit não prova exploração pela API; também não permite declarar a cadeia livre de vulnerabilidades.
2. **Banco real isolado:** executar a suíte existente com `SOLARSYSTEM_PERMISSIONS_TEST_DATABASE_URL` apontando somente ao banco descartável permitido pelos testes, testar concorrência de administradores/exclusão de clientes e ensaiar o histórico em cópia dos dados. PGlite não substitui isso.
3. **Migrations/credenciais:** nenhuma foi aplicada ao banco do usuário. Em bases antigas, seguir o procedimento existente de conversão de credenciais antes da migration de restrição criptográfica; não executar deploy cego em banco com credenciais legadas.
4. **Produção:** validar HTTPS/proxy, chave de criptografia, SMTP, backup/restauração e versão Node 26 indicada pelo projeto. A sessão foi validada com Node 24.22.3. O limite de tentativas atual é em memória por processo; implantação com várias instâncias exige coordenação compartilhada.
5. **Limites funcionais preservados:** apenas provedor DEMO, edição de inversor importado exige conciliação, histórico de medições sem estimativa artificial de energia e sem importador de backlog individual. Não são recursos recriados ou anunciados como integrações prontas nesta revisão.
6. **Logout:** limpa o cookie do navegador; não há blacklist por token. Revogação de todas as sessões é feita por versão ao mudar senha/acesso. Não foi alterado o contrato de logout para encerrar sessões de todos os dispositivos.

O núcleo foi revisado e corrigido dentro desse escopo, mas não está certificado para produção sem resolver/verificar essas pendências. Nenhum commit ou push foi executado.
