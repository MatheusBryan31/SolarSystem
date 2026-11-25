# SolarSystem

O SolarSystem centraliza o monitoramento de usinas fotovoltaicas e o acesso de equipes e clientes aos seus dados. O repositório reúne uma API NestJS, um painel React em evolução e um protótipo HTML legado preservado durante a transição.

## Arquitetura atual

```text
Navegador → apps/painel (React + TypeScript + Vite)
                    /api → API NestJS → Prisma → PostgreSQL
                                      → adaptador DEMO
                                      → sincronização e regras de alertas

apps/web → protótipo HTML independente → localStorage do navegador
```

O painel React já possui login real e Visão geral integrada à API. Sua adoção como interface principal completa depende da [estratégia de transição](docs/ESTRATEGIA_FRONTEND.md): ele ainda não substitui todos os fluxos do HTML. Não há migração automática entre localStorage e banco.

| Camada           | Tecnologias                                                                 |
| ---------------- | --------------------------------------------------------------------------- |
| API              | Node.js, TypeScript, NestJS, Express, Zod                                   |
| Persistência     | PostgreSQL, Prisma 6                                                        |
| Autenticação     | JWT em cookie httpOnly, bcrypt para senhas, guards de autenticação e perfil |
| Painel           | React 19, TypeScript, Vite 8, React Router 8                                |
| Protótipo legado | HTML, CSS e JavaScript, armazenamento local                                 |
| Qualidade        | Jest, ts-jest, Supertest, Playwright, ESLint e Prettier                     |

## Funcionalidades implementadas

**API:** saúde em `/api/health`; login, sessão e logout; gestão de usuários/clientes conforme perfil; cadastro/edição manual de usinas, vínculo com cliente e com plataforma, desvinculação segura e histórico de identidades; descobertas remotas com importação explícita, pausa/arquivamento de integrações, inversores e medições persistidas. Alarmes oferecem reconhecimento, resolução e histórico; relatórios diários/mensais/anuais têm exportação CSV/PDF e e-mails de alarmes são configuráveis. Perfis `ADMIN`, `OPERATOR` e `CLIENT` preservam isolamento por cliente. Veja [núcleo da API](docs/NUCLEO_API.md) e [alarmes e relatórios](docs/ALARMES_RELATORIOS.md), incluindo migrations preparadas e requisitos de ativação.

**Painel React:** rotas `/login`, `/` e `/usinas`, formulário com mostrar/ocultar senha, sessão consultada na abertura, layout com usuário/perfil e Sair; Visão geral com indicadores, ranking, status e alertas consultados a cada minuto. As consultas percorrem as páginas disponíveis e os indicadores distinguem ausência de leitura atual de zero. A gestão de usinas separa cadastro manual, identidade remota e origem dos campos.

O [painel operacional](docs/PAINEL_OPERACIONAL.md) inclui cadastro/detalhes, inversores, clientes, usuários, alarmes, relatórios e configurações. Relatórios consultam fontes atuais/históricas, mostram gráficos e exportam dados persistidos. ADMIN pode configurar políticas e destinatários; o envio depende de SMTP e worker explicitamente habilitados. DEMO não envia notificações reais.

**HTML legado:** cadastro/edição local de usinas, adição/edição/remoção de inversores, busca e filtros, consulta e alteração local de alarmes, relatórios e exportação resumida em CSV, configurações informativas, menu e modal de perfil compartilhados.

## O que é demonstrativo

- O único provedor implementado na API é `DEMO`: gera telemetria simulada e a sincroniza no banco. Dados recebidos pela API não significam integração com fabricantes reais.
- No HTML, login e cadastro de conta não autenticam nem enviam e-mails. Sair apenas volta à tela de login; perfil “Técnico”, gráficos de produção e mapa são ilustrativos.
- Relatórios HTML de capacidade e contagem de alarmes usam os cadastros locais; a série temporal de produção é fictícia.

## Funcionalidades pendentes

- Homologar os fluxos do painel com API/PostgreSQL isolados e revisar critérios de descontinuação do legado.
- Definir compatibilidade dos cadastros locais e contratos de escrita necessários, com backup integral e aprovação antes de migrar.
- Adaptadores para Sungrow, Growatt, Huawei, Deye/Solarman, GoodWe e demais fabricantes.
- Cadastro público real e confirmação por e-mail. Recuperação de senha e notificações implementadas dependem de SMTP/configuração e homologação de entrega.
- Medições de fabricantes reais, energia explícita de período quando fornecida, demais indicadores planejados, carga/retenção e configuração de CI/publicação.

## Estrutura de pastas

```text
apps/
  api/
    src/                 # módulos NestJS, autenticação, serviços e adaptadores
    prisma/              # schema, migrations e seed do administrador
    test/                # E2E HTTP com Prisma mockado
  painel/
    src/                 # páginas React, layout, autenticação e cliente HTTP
    public/              # imagens estáticas
  web/
    paginas/             # oito páginas HTML legadas
    estilos/             # CSS compartilhado e específico
    scripts/             # operações locais e componentes compartilhados
    imgs/                # imagens
    tests/               # testes Playwright com pacote/lockfile próprios
docs/                    # instalação, estratégia, auditoria e ADRs
package.json             # npm workspaces: apps/*
package-lock.json        # versões resolvidas dos workspaces
```

## Executar localmente

Siga o [guia completo para Windows 10/11](docs/INSTALACAO.md) para preparar banco, variáveis e administrador. Use Node **26**, conforme `.nvmrc`, npm e PostgreSQL **17**. O mínimo declarado na raiz (`>=22.12.0`) ainda é mais permissivo que o React Router resolvido (`>=22.22.0`); não use o mínimo da raiz como garantia de compatibilidade.

Depois de configurar o ambiente e instalar as dependências, na raiz do repositório:

```powershell
# Terminal 1
npm run dev:api

# Terminal 2
npm run dev:painel
```

- Painel: [http://localhost:5173](http://localhost:5173), login em `/login`.
- Saúde da API: [http://localhost:3333/api/health](http://localhost:3333/api/health). A raiz `/` não oferece uma página ou “Hello World”.
- O painel inicialmente vazio é esperado quando não há usinas sincronizadas. O seed cria apenas o administrador, não exemplos de usinas.

### Comunicação e sessão

O navegador chama `/api` na origem do painel. O proxy de desenvolvimento do Vite encaminha essas requisições a `http://localhost:3333`. O cliente HTTP React usa `credentials: 'same-origin'`; não há URL de API ou token configurado em variável `VITE_*` atualmente.

O login envia `{ email, senha }` a `/api/auth/login`. A resposta contém o usuário e um cookie `solarsystem_sessao`, com `HttpOnly`, `SameSite=Strict`, caminho `/api` e `Secure` em produção. O token não fica no localStorage. `/api/auth/me` consulta o usuário atual e `/api/auth/logout` remove o cookie. HttpOnly limita a leitura do token por JavaScript, mas não substitui as demais proteções da aplicação.

`WEB_ORIGIN` define a origem exata autorizada pelo CORS e pela proteção CSRF. Em produção, sirva o painel e `/api` na mesma origem HTTPS, configure o proxy reverso confiável e habilite o fallback das rotas SPA. O proxy Vite atende ao desenvolvimento. Consulte a configuração de produção no [guia de instalação](docs/INSTALACAO.md#https-cors-e-csrf-em-produção).

### Protótipo HTML legado

Opcional, sem API ou banco, com Python 3 instalado:

```powershell
py -m http.server 5174 --bind 127.0.0.1 --directory apps/web
```

Abra [http://127.0.0.1:5174/paginas/login.html](http://127.0.0.1:5174/paginas/login.html). A porta 5174 evita conflito com o React. **Se já possui cadastros, mantenha o navegador, esquema, hostname e porta originais**: trocar de `localhost` para `127.0.0.1` ou mudar porta não transporta localStorage. Para usar a antiga porta 5173, pare o React antes.

Cadastros: `solaris.plants.v1`. Preferência de e-mail: `solarsystem.rememberedEmail`. Senhas são descartadas. Sem chave persistida, três exemplos são mostrados em memória; lista vazia é preservada. A restauração em Configurações acrescenta exemplos ausentes e dados ilegíveis bloqueiam gravação. O CSV de usinas filtradas não é backup integral de inversores, alarmes e campos adicionais.

## Comandos padronizados na raiz

Após configurar o banco local, o `.env` e instalar as dependências, use os comandos abaixo na raiz. Os comandos anteriores com `-w apps/api` e `-w apps/painel` continuam disponíveis.

| Comando                                      | Função                                                             |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `npm run dev:api`                            | Inicia a API NestJS em modo watch                                  |
| `npm run dev:painel`                         | Inicia o Vite do painel                                            |
| `npm run dev`                                | Inicia API e painel juntos com concurrently                        |
| `npm run build`                              | Compila API e depois painel; para se houver erro                   |
| `npm run build:api` / `npm run build:painel` | Compila somente o aplicativo escolhido                             |
| `npm run test:api`                           | Executa unitários da API em série                                  |
| `npm run test:e2e`                           | Executa E2E HTTP em série, com Prisma mockado                      |
| `npm run test:web`                           | Executa os testes isolados do HTML legado                          |
| `npm run format:check`                       | Verifica Prettier sem escrever arquivos                            |
| `npm run typecheck`                          | Verifica TypeScript da API e do painel sem emitir arquivos         |
| `npm run lint:check`                         | Verifica ESLint da API com `--no-fix`                              |
| `npm run check`                              | Executa formatação, TypeScript e ESLint, parando na primeira falha |

`dev` mantém portas e proxy existentes (API 3333 e Vite 5173). Não inicia PostgreSQL nem executa migrations ou seeds. Se um processo encerrar, concurrently encerra o outro; `Ctrl+C` encerra ambos. A API ainda depende do banco configurado e pode sincronizar integrações ao iniciar, conforme `SYNC_INTERVAL_MIN`; os atalhos não mudam esse comportamento.

`check` não faz build, não inicia serviços, não roda testes, não conecta ao banco e não aplica correções. O lint abrange somente a API; o painel participa pela checagem TypeScript. `format` e o `lint` antigo da API continuam comandos de escrita. O alias anterior `npm run "format: check"` foi preservado.

Os testes HTML precisam de dependências separadas e navegador. Exemplo PowerShell com Edge já instalado:

```powershell
npm --prefix apps/web/tests ci
$env:BROWSER_CHANNEL = 'msedge'
npm run test:web
Remove-Item Env:BROWSER_CHANNEL
```

Em outros sistemas, use Chromium instalado pelo Playwright e deixe `BROWSER_CHANNEL` ausente, ou selecione canal compatível. Os scripts npm não usam atribuição de variáveis exclusiva de PowerShell; apenas o exemplo de seleção de navegador acima é específico do Windows.

### Validação dos atalhos — Tarefa 05

Em Node 24.22.3/npm 11.6.2 no Windows, passaram `build` (API e painel), `typecheck`, `lint:check`, 26 unitários, 31 E2E e seis testes HTML no Edge. Os três comandos `dev` foram verificados apenas pelas opções de ajuda, sem iniciar API ou conectar ao banco; a execução simultânea com serviços reais não foi validada.

`check` retorna falha de formatação em `docs/DIAGNOSTICO_VALIDACAO.md` e `docs/ESTRATEGIA_FRONTEND.md`, anteriores à padronização. Esses documentos não foram reformatados automaticamente. TypeScript e ESLint foram executados separadamente e passaram. O aviso experimental de VM Modules nos E2E permanece. `.nvmrc` continua indicando Node 26; não houve execução desses atalhos em Node 26 ou Linux/macOS nesta tarefa.

## Testes e verificações

Após instalar dependências e gerar o Prisma Client:

```powershell
npm run test:api
npm run test:e2e
npm run build
npm run check
```

Os E2E atuais exercitam HTTP, autenticação, cookies e permissões reais com Prisma mockado, sem banco, sem `.env` e sem agendador. O script habilita VM Modules para as dependências ESM do Jest; pode aparecer aviso experimental. Não certifica integração com PostgreSQL ou configuração de produção.

Na validação da Tarefa 03: **31 E2E e 26 unitários aprovados**, em Node 24.22.3, além de TypeScript da API e checks dos arquivos alterados. Esses resultados não representam uma execução de todos os checks em Node 26. Veja no [guia](docs/INSTALACAO.md#testes-e-qualidade) os testes HTML e comandos de lint sem correções. O script `lint` da API inclui `--fix`; não o use para auditoria somente leitura.

## Documentação

- [Alarmes, notificações configuráveis, relatórios CSV/PDF e homologação](docs/ALARMES_RELATORIOS.md).
- [Painel React operacional, integrações e testes de páginas](docs/PAINEL_OPERACIONAL.md).
- [Revisão atual do núcleo da API, correções, testes e pendências](docs/NUCLEO_API.md).
- [Instalação no Windows e solução de problemas](docs/INSTALACAO.md).
- [Estratégia de consolidação do front-end](docs/ESTRATEGIA_FRONTEND.md).
- [Modelagem aprovada de usinas](docs/MODELAGEM_USINAS.md) e [implementação, contratos e implantação](docs/IMPLEMENTACAO_USINAS.md).
- [Auditoria da Tarefa 02](docs/DIAGNOSTICO_VALIDACAO.md) — registro histórico; os bloqueios e o E2E antigo ali descritos antecedem as correções da Tarefa 03.
- [ADR 0001 — Monorepo com npm workspaces](docs/adr/0001-monorepo-com-npm-workspaces.md).
- [ADR 0002 — Arquitetura do backend](docs/adr/0002-arquitetura-do-back-end.md).
