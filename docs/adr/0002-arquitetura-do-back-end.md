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
   - O front-end React (cliente-servidor) consumirá a API.

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
