# Guia de instalação - SolarSystem

Este guia leva um computador **sem nada instalado** até o SolarSystem rodando localmente.
Foi escrito e testado no **Windows 10/11** com o PowerShell. Em Linux/macOS os comandos são os mesmos, exceto onde indicado.

> Tempo estimado: 40-60 minutos na primeira vez.

## Sumário

1. [Requisitos](#1-requisitos)
2. [Node.js](#2-nodejs)
3. [Git](#3-git)
4. [PostgreSQL](#4-postgresql)
5. [VS Code](#5-vs-code-recomendado)
6. [Baixar o projeto](#6-baixar-o-projeto)
7. [Instalar as dependências](#7-instalar-as-dependências)
8. [Configurar as variáveis de ambiente](#8-configurar-as-variáveis-de-ambiente)
9. [Criar as tabelas do banco](#9-criar-as-tabelas-do-banco)
10. [Criar o primeiro administrador](#10-criar-o-primeiro-administrador)
11. [Rodar o sistema](#11-rodar-o-sistema)
12. [Verificar a instalação](#13-verificar-a-instalação)
13. [Rotina de trabalho](#13-rotina-de-trabalho)
14. [Problemas comuns](#14-problemas-comuns)
15. [Referência de comandos](#15-referencia-de-comandos)

---

## 1. Requisitos

| Ferramenta | Versão | Para quê |
| --- | --- | --- |
| Node.js | 22.12 ou superior (veja `.nvmrc`) | Executa a API e as ferramentas do front-end |
| npm | vem com o Node | Instala as bibliotecas |
| Git | 2.40 ou superior | Controle de versão e download do projeto |
| PostgreSQL | 17 | Banco de dados |
| VS Code | atual | Editor (recomendado) |

Espaço em disco: ~1,5GB (ferramentas + dependências).

## 2. Node.js

1. Baixe o instalador **LTS** em <https://nodejs.org>.
2. Instale com as opções padrão (inclui o npm e adiciona ao `PATH`).
3. **Feche e abra** o terminal (ele só enxergo o `PATH` novo ao reabrir) e confira:

    ```bash
    node -v
    npm -v
    ```

## 3. Git

1. Baixe em <https://git-scm.com> e instale com as opções padrão.
2. Configure sua identidade (aparece em cada commit):

    ```bash
    git config --global user.name "Seu Nome"
    git config --global user.email "seu-email@exemplo.com"
    git config --global init.defaultBranch main
    ```

3. Confira: `git --version.`

## 4. PostgreSQL

### 4.1 Instalar

1. Baixe o instalador da versão **17** em <https://www.postgresql.org/download/windows/>.
2. Durante a instalação:
    - defina e **anote** a senha do superusuário `postgres`;
    - **anote a porta**. O padrão é `5432`, se já houver outro PostgreSQL na máquina ou outro sistema utilizando a porta, use outra (ex: `5433`) - ela será usada no `.env`.
3. O Stack Builder ao final pode ser cancelado.

### 4.2 Criar o usuário e o banco do sistema

Por segurança (princípio do **menor privilégio**), o sistema **não** usa o superusuário `postgres`, e sim um usuário próprio, dono apenas do banco do SolarSystem.

Abra o **SQL Shell (psql)**, confirme sevidor/porta/usuário(`postgres`) e rode:

```sql
CREATE ROLE nome WITH LOGIN PASSWORD 'troque-esta-senha';
CREATE DATABASE solarsystem OWNER nome;

-- Somente em DESENVOLVIMENTO: o "prisma migrate dev" precisa criar um banco-sombra temporário
ALTER ROLE nome CREATEDB;
```

> Atenção: nomes sem aspas viram **minúsculas** no PostgreSQL (`Nome` -> `nome`).
> Use sempre minúsculas.

Teste a conexão com o novo usuário:

```sql
\c solarsystem nome
```

O prompt deve mudar para `solarsystem=>`. Saia com `\q`.

## 5. VS Code (recomendado)

1. Instale em <https://code.visualstudio.com>.
2. Ao abrir a pasta do projeto, aceite instalar as **extensões recomendades** (ESLint, Prettier, Prisma, EditorConfig - Listadas em `.vscode/extensions.json`).

## 6. Baixar o projeto

```bash
cd $HOME\Documents
git clone https://github.com/MatheusBryan31/SolarSystem.git
cd caminho
code .
```

## 7. Instalar as dependências

Na **raiz** do projeto:

```bash
npm install
```

Esse comando:

- Instala as bibliotecas de **todos** os apps (npm workspaces),
nas versões exatas do `package-lock.json`;
- Executa o `postinstall` da API, que **gera o Prisma Client** automaticamente.

## 8. Configurar as variáveis de ambiente

Os valores de configuração (senha, portas) ficam em `apps/api/.env`, que **nunca** vai para o Git.
Crie-o a partir do modelo:

```bash
Copy-Item apps\api\.env.example apps\api\.env
```

(Linux/macOS: `cp apps/api/.env.example apps/api/.env`)

Abra `apps/api/.env` e preencha:

| Variável | Obrigatória | Exemplo | Descrição |
| --- | --- | --- | --- |
| `NODE_ENV` | não | `development` | `development`, `test` ou `production` |
| `PORT` | não | `3333` | Porta da API |
| `DATABASE_URL` | **sim** | `postgresql://nome:SENHA@localhost:5433/solarsystem?schema=public` | Conexão com o banco |
| `JWT_SECRET` | **sim** | (96 caracteres aleatórios) | Chave que assina os logins — mínimo 32 caracteres |
| `JWT_EXPIRES_IN` | não | `28800` | Validade do login em segundos (28800 = 8 h) |
| `WEB_ORIGIN` | não | `http://localhost:5173` | Endereço do front-end (CORS) |
| `SEED_ADMIN_EMAIL` | só para o seed | `admin@empresa.com` | E-mail do primeiro administrador |
| `SEED_ADMIN_PASSWORD` | só para o seed | (senha forte) | Senha inicial do primeiro administrador |

**Anatomia da `DATABASE_URL`:**
`postgresql://usuario:senha@servidor:porta/banco?schema=public`

> Se a senha do banco tiver `@ : / #`, substitua por `%40 %3A %2F %23`.

**Gerar o `JWT_SECRET`:**

```bash
node -e
"console.log(require('crypto').randomBytes(48).toString('hex'))"
```

A API **valida** essas variáveis ao iniciar. Se algo estiver faltando ou errado, ela não sobe e mostra exatamente qual variável corrigir.

## 9. Criar as tabelas do banco

```bash
npm run db:deploy -w apps/api
```

Aplica, em ordem, todas as migrations de `apps/api/prisma/migrations`.

> Em **desenvolvimento**, ao alterar o `schema.prisma`, use `npm run db:migrate -w apps/api -- --name descricao`
> Gera uma migration nova. Em **produção**, use **sempre** `db:deploy` - ele nunca apaga dados.

## 10. Criar o projeto administrador

Com `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` preenchidos no `.env`:

```bash
npm run db:seed -w apps/api
```

Pode ser executado mais de uma vez: se o administrador já existir, nada é alterado.
Depois do primeiro login, troque a senha inicial.

## 11. Rodar o sistema

```bash
npm run start:dev -w apps/api
```

Aguarde a mensagem `SolarSystem API em http://localhost:3333/api (development)`.
o modo `start:dev` reinicia sozinho ao salvar arquivos de `src/` - mas **não** ao alterar o `.env` (neste caso, pare com `Ctrl+C` e rode novamente).

## 12. Verificar a instalação

1. Abra <http://localhost:3333/api/health> - deve mostrar `"status": "ok"` e `"banco": "ok"`.
2. Em outro terminal, rode os testes:

```bash
npm run test -w apps/api
```

3. Opcional - painel visual do banco: `npm run db:studio -w apps/api` (abre <http://localhost:5555>).

## 13. Rotina de trabalho

```bash
git switch main
git pull                        # traz o que mudou
npm install                     # se o package-lock.json mudou
npm run db:deploy -w apps/api   # se chegaram migrations novas
git switch -c tipo/descricao    # ex.: feat/cadastro-clientes
```

Ao terminar: `npm run format`, commit, `git push -u origin <branch>`, Pull Request, merge, `git switch main` e `git pull`.

## 14. Problemas comuns

| Sintoma | Causa | Solução |
| --- | --- | --- |
| `git`/`node` "não é reconhecido como nome de cmdlet" | Terminal aberto antes da instalação, ou PowerShell de administrador sem o `PATH` do usuário | Feche e abra o terminal; use um PowerShell **normal** |
| `autenticação do tipo senha falhou para o usuário` | Porta errada (há outro PostgreSQL na máquina) ou senha errada | Confira a porta na `DATABASE_URL`; teste no psql com `\c solarsystem bryan` |
| `\c` diz que o banco/usuário não existe | Nome com maiúscula, ou ordem trocada | É `\c banco usuário`, tudo minúsculo |
| psql mostra `-#` e não executa | Faltou o `;` no fim do comando | Digite `;` e Enter |
| `Missing script: "..."` | Nome do script digitado errado, ou `package.json` do app incompleto | `npm run -w apps/api` lista os scripts existentes |
| `Variáveis de ambiente inválidas` | `.env` ausente ou com valor inválido | Leia a lista exibida e corrija o `.env` |
| `P3014` / erro ao criar *shadow database* | Usuário do banco sem permissão de criar bancos | `ALTER ROLE bryan CREATEDB;` (só em desenvolvimento) |
| `@prisma/client did not initialize yet` | Prisma Client não gerado | `npm run db:generate -w apps/api` |
| `Cannot find module './prisma/...'` | Arquivo `.ts` salvo fora de `apps/api/src/` | Todo código da API fica em `src/`; a pasta `apps/api/prisma/` é só do schema e das migrations |
| `EADDRINUSE: address already in use :::3333` | A API já está rodando em outro terminal | Feche o outro terminal, ou mude `PORT` |
| Avisos `LF will be replaced by CRLF` | Quebras de linha do Windows | Já tratado pelo `.gitattributes`; se surgir, `git add --renormalize .` |
| Acentos estranhos no psql (`relaþ§es`) | Página de código do console | Rode `chcp 1252` antes do psql |

## 15. Referência de comandos

| Comando | O que faz |
| --- | --- |
| `npm install` | Instala dependências de todos os apps |
| `npm run start:dev -w apps/api` | API em modo desenvolvimento |
| `npm run build -w apps/api` | Compila a API para `apps/api/dist` |
| `npm run test -w apps/api` | Testes da API |
| `npm run db:migrate -w apps/api -- --name x` | Cria e aplica uma migration (desenvolvimento) |
| `npm run db:deploy -w apps/api` | Aplica migrations pendentes (produção/outra máquina) |
| `npm run db:seed -w apps/api` | Cria o primeiro administrador |
| `npm run db:studio -w apps/api` | Painel visual do banco |
| `npm run format` | Formata todo o código com o Prettier |
