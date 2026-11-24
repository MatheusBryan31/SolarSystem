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

**API:** saúde em `/api/health`; login, consulta da sessão e logout; gestão de usuários e clientes conforme perfil; consulta de usinas e vínculo com cliente; cadastro e sincronização de integrações; consulta e reconhecimento de alertas. Perfis `ADMIN`, `OPERATOR` e `CLIENT`, com isolamento dos dados de usinas/alertas por cliente. A API não oferece cadastro/edição manual geral de usinas nem recurso independente de inversores equivalente ao legado.

**Painel React:** rotas `/login` e `/`, formulário com mostrar/ocultar senha, sessão consultada na abertura, layout com usuário/perfil e Sair; Visão geral com indicadores, ranking de geração, status e alertas consultados na API a cada minuto. As métricas agregam atualmente uma página de até 100 registros; conjuntos maiores e leituras ausentes/antigas precisam de refinamento.

**HTML legado:** cadastro/edição local de usinas, adição/edição/remoção de inversores, busca e filtros, consulta e alteração local de alarmes, relatórios e exportação resumida em CSV, configurações informativas, menu e modal de perfil compartilhados.

## O que é demonstrativo

- O único provedor implementado na API é `DEMO`: gera telemetria simulada e a sincroniza no banco. Dados recebidos pela API não significam integração com fabricantes reais.
- No HTML, login e cadastro de conta não autenticam nem enviam e-mails. Sair apenas volta à tela de login; perfil “Técnico”, gráficos de produção e mapa são ilustrativos.
- Relatórios HTML de capacidade e contagem de alarmes usam os cadastros locais; a série temporal de produção é fictícia.

## Funcionalidades pendentes

- Portar ao React Usinas, Detalhes, Cadastro/Edição, Inversores, Alarmes completos, Relatórios, Configurações e modal de perfil.
- Definir compatibilidade dos cadastros locais e contratos de escrita necessários, com backup integral e aprovação antes de migrar.
- Adaptadores para Sungrow, Growatt, Huawei, Deye/Solarman, GoodWe e demais fabricantes.
- Cadastro público real, recuperação de senha, confirmação por e-mail e notificações por e-mail.
- Histórico temporal real, demais indicadores planejados, ampliação dos testes do painel e configuração de CI/publicação.

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
npm run start:dev -w apps/api

# Terminal 2
npm run dev -w apps/painel
```

- Painel: [http://localhost:5173](http://localhost:5173), login em `/login`.
- Saúde da API: [http://localhost:3333/api/health](http://localhost:3333/api/health). A raiz `/` não oferece uma página ou “Hello World”.
- O painel inicialmente vazio é esperado quando não há usinas sincronizadas. O seed cria apenas o administrador, não exemplos de usinas.

### Comunicação e sessão

O navegador chama `/api` na origem do painel. O proxy de desenvolvimento do Vite encaminha essas requisições a `http://localhost:3333`. O cliente HTTP React usa `credentials: 'same-origin'`; não há URL de API ou token configurado em variável `VITE_*` atualmente.

O login envia `{ email, senha }` a `/api/auth/login`. A resposta contém o usuário e um cookie `solarsystem_sessao`, com `HttpOnly`, `SameSite=Strict`, caminho `/api` e `Secure` em produção. O token não fica no localStorage. `/api/auth/me` consulta o usuário atual e `/api/auth/logout` remove o cookie. HttpOnly limita a leitura do token por JavaScript, mas não substitui as demais proteções da aplicação.

`WEB_ORIGIN` configura o CORS da API; não muda o destino do proxy nem o cliente HTTP. Em produção, será necessário servir painel e `/api` sob uma origem coerente, com HTTPS e fallback de rotas SPA. O proxy descrito é o de desenvolvimento; `vite preview` não substitui essa configuração de publicação.

### Protótipo HTML legado

Opcional, sem API ou banco, com Python 3 instalado:

```powershell
py -m http.server 5174 --bind 127.0.0.1 --directory apps/web
```

Abra [http://127.0.0.1:5174/paginas/login.html](http://127.0.0.1:5174/paginas/login.html). A porta 5174 evita conflito com o React. **Se já possui cadastros, mantenha o navegador, esquema, hostname e porta originais**: trocar de `localhost` para `127.0.0.1` ou mudar porta não transporta localStorage. Para usar a antiga porta 5173, pare o React antes.

Cadastros: `solaris.plants.v1`. Preferência de e-mail: `solarsystem.rememberedEmail`. Senhas são descartadas. Sem chave persistida, três exemplos são mostrados em memória; lista vazia é preservada. A restauração em Configurações acrescenta exemplos ausentes e dados ilegíveis bloqueiam gravação. O CSV de usinas filtradas não é backup integral de inversores, alarmes e campos adicionais.

## Testes e verificações

Após instalar dependências e gerar o Prisma Client:

```powershell
npm test -w apps/api -- --runInBand
npm run test:e2e -w apps/api -- --runInBand
npm run build -w apps/api
npm run build -w apps/painel
npm run "format: check"
```

Os E2E atuais exercitam HTTP, autenticação, cookies e permissões reais com Prisma mockado, sem banco, sem `.env` e sem agendador. O script habilita VM Modules para as dependências ESM do Jest; pode aparecer aviso experimental. Não certifica integração com PostgreSQL ou configuração de produção.

Na validação da Tarefa 03: **31 E2E e 26 unitários aprovados**, em Node 24.22.3, além de TypeScript da API e checks dos arquivos alterados. Esses resultados não representam uma execução de todos os checks em Node 26. Veja no [guia](docs/INSTALACAO.md#testes-e-qualidade) os testes HTML e comandos de lint sem correções. O script `lint` da API inclui `--fix`; não o use para auditoria somente leitura.

## Documentação

- [Instalação no Windows e solução de problemas](docs/INSTALACAO.md).
- [Estratégia de consolidação do front-end](docs/ESTRATEGIA_FRONTEND.md).
- [Auditoria da Tarefa 02](docs/DIAGNOSTICO_VALIDACAO.md) — registro histórico; os bloqueios e o E2E antigo ali descritos antecedem as correções da Tarefa 03.
- [ADR 0001 — Monorepo com npm workspaces](docs/adr/0001-monorepo-com-npm-workspaces.md).
- [ADR 0002 — Arquitetura do backend](docs/adr/0002-arquitetura-do-back-end.md).
