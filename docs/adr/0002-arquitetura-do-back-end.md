# ADR 0002 - Arquitetura do back-end

- **Status:** Aceito
- **Data:** 2026-11-17

## Contexto

O SolarSystem precisa:

- consultar periodicamente N plataformas diferentes, são elas, Sungrow, Growatt, Huawei, Deye/Solarman, GoodWe etc, cada uma com autenticação, formato de dados e limite de chamadas próprios;
- Atender dois perfis de acesso (equipe e clientes) com regras de permissão;
- Gerar alertas por e-mail a partir dos dados coletados;

## Decisão

1. **Monólito modular com NestJS.**
   - Uma única aplicação, dividida em módulos por assunto (autor, usuários, clientes, plantas, integradores, provedores, sync, alertas e dashboard).

2. **Camadas dentro de cada módulo:**
   - _Controller_ - recebe a requisição HTTP, valida a entrada e devolve a resposta. Sem regra de negócio.
   - _Service_ - regra de negócio.
   - _Prisma (acesso a dados)_ - conversa com o PostgreSQL.
3. **Portas e Adaptadores para as plataformas.**
   - Um contrato único (`ProviderAdapter`) e um adaptador por fabricante. O resto do sistema não sabe de qual plataforma o dado veio.
4. **Tarefas em segundo plano (coleta e alertas) com fila no próprio PostgreSQL (pg-boss)**
   - Não precisa de Redis ou outro serviço.
5. **API REST com JSON**
   - O front-end React (cliente-servidor) consome a API nas telas implementadas.

O painel React está em `apps/painel` e já utiliza autenticação e consultas pela API.
O protótipo `apps/web` é independente e mantém cadastros locais no navegador.

## Alternativas consideradas

- **Express:**
  Mais simples no início, mas exigiria montar à mão organização, injeção de dependências, validação e testes. Rejeitado.
- **MVC com páginas no servidor:**
  O front é uma aplicação React separada; o back-end só entrega dados. Mantemos a ideia de separar responsabilidades, mas sem a camada View no servidor.
- **Microsserviços:**
  Complexidade de infraestrutura (vários deploys, rede, observabilidade etc) desproporcional para o projeto. Rejeitado.

## Consequências

**Positivas**

- Adicionar uma plataforma nova = cria um adaptador sem mexer no resto.
- Cada camada pode ser testada isoladamente. Com o Service os testes são sem HTTP.
- Um único deploy e um único banco: simples de operar.

**Negativas**

- Curva de aprendizado do NestJS (decorators, módulos, injeção de dependência).
- Tudo roda em um processo: uma coleta pesada pode disputar recursos com a API.

## Plano de saída

Se a coleta crescer demais, o módulo `sync` pode virar um processo separado (_worker_) lendo a mesma fila do PostgreSQL. Como os módulos já são independentes, a separação não exige reescrever o sistema.

## Atualização: agendamento da coleta

A coleta automática usa `setInterval` dentro da própria API (`SyncScheduler`), com trava contra
sobreposição de ciclos. Motivo: o sistema roda em **uma** instância, e isso evita uma dependência
a mais. Limitação conhecida: com várias instâncias, cada uma coletaria em paralelo. Plano de saída:
migrar para o pg-boss (fila no próprio PostgreSQL), que garante uma execução por ciclo.

## Atualização de implementação — 23/11/2026

- Os módulos atuais incluem autenticação, usuários, clientes, usinas, integrações,
  provedores e alertas. A Visão geral é composta no React a partir dos endpoints
  de usinas e alertas; não existe um módulo de dashboard próprio na API.
- Os papéis implementados são `ADMIN`, `OPERATOR` e `CLIENT`, detalhando o grupo
  de equipe/cliente citado no contexto. A sessão usa JWT em cookie httpOnly,
  SameSite Strict, Path `/api` e Secure em produção, com guards globais.
- O catálogo de provedores contém somente `DEMO`. Os fabricantes e os e-mails
  mencionados no contexto continuam objetivos, não recursos entregues.
- O item 4 registra a direção original da fila; **pg-boss não está instalado nem
  implementado**. O agendador atual usa `setInterval` e trava em memória, sem
  coordenação entre instâncias. `SYNC_INTERVAL_MIN=0` desativa sua execução;
  caso contrário há uma coleta na inicialização e ciclos periódicos.
- A proposta de separar um worker permanece futura. Não existe fila atual a
  reutilizar até implementar a alternativa aprovada.
