# 0001 — Monorepo com npm workspaces

- **Status:** aceita
- **Data:** 2026-11-16

## Contexto

O SolarSystem tem duas aplicações que evoluem juntas: a API (back-end, NestJS)
e o painel (front-end, React). Uma mesma funcionalidade costuma exigir mudança
nas duas — por exemplo, um novo campo na usina precisa ser salvo pela API e
exibido pelo painel. Precisávamos decidir se cada aplicação teria o seu próprio
repositório (polyrepo) ou se ficariam juntas (monorepo).

Na implementação atual, `apps/painel` contém o painel React + TypeScript + Vite.
`apps/web` permanece como protótipo HTML/CSS/JavaScript legado, com cadastros locais
e fluxos ainda não portados. A coexistência não altera a decisão de monorepo.

## Decisão

Usar um único repositório (monorepo) com o recurso nativo de workspaces do npm.
Cada aplicação fica em `apps/<nome>` com o seu próprio `package.json`, e o
`package.json` da raiz declara `"workspaces": ["apps/*"]`. Um único
`npm install` na raiz instala as dependências de todas as aplicações.

Alternativas consideradas: dois repositórios separados (descartado pelo custo
de manter versões e mudanças sincronizadas) e ferramentas como Turborepo/Nx
(descartadas por ora: adicionam complexidade que o projeto ainda não precisa).

## Consequências

- Uma mudança que envolve API e painel vai em um único commit e um único pull request.
- Um só lugar para documentação, configuração de qualidade e CI.
- Sem ferramenta extra para instalar: o npm já resolve.
- O repositório cresce com as aplicações; uma futura configuração de CI deverá
  definir quais verificações rodam por mudança. Não há pipeline `.github` neste checkout.
- É preciso indicar a aplicação nos comandos (`npm run start:dev -w apps/api`
  ou `npm run dev -w apps/painel`).
- Se o projeto crescer muito, podemos adotar Turborepo ou Nx sem mudar a estrutura de pastas.

## Atualização de implementação — 23/11/2026

API e painel React são workspaces com manifestos próprios. O legado `apps/web`
não tem manifesto na sua raiz; seu pacote de testes fica em `apps/web/tests`
e exige instalação separada. Para instalar as resoluções versionadas sem alterar
o lockfile, o guia atual usa `npm ci`; `npm install` continua disponível para
alterações intencionais nas dependências. A transição funcional do legado segue
a [estratégia frontend](../ESTRATEGIA_FRONTEND.md), ainda sem migração automática.
