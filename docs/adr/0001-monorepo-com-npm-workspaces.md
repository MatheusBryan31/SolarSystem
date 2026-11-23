# 0001 — Monorepo com npm workspaces

- **Status:** aceita
- **Data:** 2026-11-16

## Contexto

O SolarSystem tem duas aplicações que evoluem juntas: a API (back-end, NestJS)
e o painel (front-end, React). Uma mesma funcionalidade costuma exigir mudança
nas duas — por exemplo, um novo campo na usina precisa ser salvo pela API e
exibido pelo painel. Precisávamos decidir se cada aplicação teria o seu próprio
repositório (polyrepo) ou se ficariam juntas (monorepo).

O painel entregue em `apps/web` usa HTML, CSS e JavaScript estáticos. React foi considerado no contexto original.

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
- O repositório cresce com as duas aplicações; o CI testa tudo a cada mudança, mesmo
  quando só uma app foi alterada.
- É preciso indicar a aplicação nos comandos (`npm run dev -w apps/api`).
- Se o projeto crescer muito, podemos adotar Turborepo ou Nx sem mudar a estrutura de pastas.
