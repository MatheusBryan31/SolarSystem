# Informações técnicas e cadastrais — Tarefa 09

## Diagnóstico e escopo

Checkout `main`, sem alterações locais no início da tarefa. Foram inspecionados o schema Prisma, migrations, DTOs, serviços de cadastro/sincronização, `apps/web/scripts/plant-store.js`, `apps/web/paginas/cadastro.html` e o formulário React em `apps/painel/src/paginas/Usinas.tsx`.

O banco já possui nome, potência instalada (`capacityKwp`), cidade, UF e relação com cliente (`clientId`). O legado guarda também `type`, `nominal`, `tilt`, `startDate`, `notes`, `cep`, `street`, `number` e `complement` no localStorage `solaris.plants.v1`. Seu formulário limita a seleção a seis UFs; o React usa entrada de UF livre com dois caracteres. Não foi feita importação do localStorage nem alteração dessas interfaces.

A primeira versão inclui todos os campos técnicos solicitados, reutilizando os existentes. Somente **nome é obrigatório no cadastro**; UUID é gerado automaticamente. Os demais são opcionais/nulos, permitindo cadastrar usinas ainda sem levantamento técnico e preservar contratos/dados antigos. Ausência de potência/data/coordenadas significa informação desconhecida, nunca zero ou data inventada. Para operação comercial e monitoramento, recomenda-se completar cliente, localização e potência instalada após conferência; não há um novo bloqueio de completude nesta etapa.

## Campos e validações da API

| Informação             | Campo                   | Regra para novas entradas/edições                                                                             |
| ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Nome                   | `name` existente        | Obrigatório na criação; texto com trim, 2–160 caracteres                                                      |
| Tipo de instalação     | `installationType`      | Opcional; GROUND (solo), ROOFTOP (telhado), HYBRID (híbrida), CARPORT, FLOATING ou OTHER                      |
| Potência instalada DC  | `capacityKwp` existente | Número finito ≥ 0, em kWp; não criar outro campo equivalente                                                  |
| Potência nominal AC    | `nominalPowerKw`        | Número finito ≥ 0, em kW; cadastro de projeto, não soma automática dos inversores nem potência instantânea    |
| Inclinação dos módulos | `moduleTiltDegrees`     | Número finito entre 0 e 90 graus; inclinação representativa do projeto                                        |
| Início da operação     | `operationStartDate`    | Data civil válida `YYYY-MM-DD`, anos 0001–9999, até a data UTC atual; rejeita datas inexistentes e timestamps |
| CEP                    | `postalCode`            | String `12345678` ou `12345-678`; trim e armazenamento com oito dígitos, preservando zeros                    |
| Logradouro             | `street`                | Texto com trim, 1–200 caracteres                                                                              |
| Número                 | `addressNumber`         | Texto com trim, 1–30 caracteres; admite `s/n`, letras e zeros                                                 |
| Complemento            | `addressComplement`     | Texto com trim, 1–200 caracteres                                                                              |
| Cidade                 | `city` existente        | Texto com trim, até 120 caracteres; contrato anterior preservado                                              |
| Estado                 | `state` existente       | Todas as 26 UFs e DF; trim/maiúsculas nas entradas manuais; siglas inexistentes recusadas                     |
| Coordenadas            | `latitude`, `longitude` | Números finitos; latitude −90…90 e longitude −180…180; par completo ou ambas nulas                            |
| Cliente responsável    | `clientId` existente    | UUID opcional, cliente existente; criação e endpoint atual `PATCH /api/plants/:id/client`                     |
| Observações técnicas   | `technicalNotes`        | Texto com trim, 1–5000 caracteres, sem interpretação HTML                                                     |

Não é imposta relação `nominalPowerKw <= capacityKwp`: AC e DC são grandezas diferentes, e essa desigualdade não deve ser uma regra universal do cadastro. Não há geocodificação, verificação de existência de CEP nem garantia de que coordenadas correspondam ao endereço. Para orientações/inclinações distintas por arranjo, será necessário modelo de arranjos futuro; não duplicar a usina.

Campos novos aceitam `null` para limpeza explícita; strings vazias são recusadas. Omitir campo em PATCH conserva seu valor. Coordenadas são validadas após combinar alterações com o registro existente: pode-se atualizar só latitude se longitude já existir, mas não remover apenas uma delas. Dados antigos continuam legíveis mesmo se UF/nome/capacidade não atenderem à validação de entradas atuais.

## Propriedade dos dados e sincronização

Os campos novos são **administrados pelo SolarSystem**, em colunas próprias de Plant. Não entram em `manualOverrides` nem no snapshot do fabricante. O adaptador atual não fornece esses dados; não foram criados contratos de fabricantes fictícios.

Nome, cidade, UF e potência instalada continuam no mecanismo existente de snapshot remoto + override por campo: edição manual ganha precedência, omissão não remove override e `useRemote` remove explicitamente um override. Sua allowlist permanece somente `name`, `city`, `state`, `capacityKwp`. Cliente, IDs, origem e telemetria não entram nos overrides.

Sincronizar, vincular ou desvincular não escreve os novos campos; logo, endereço, especificações e observações locais sobrevivem a essas operações. O DTO mantém `metadataSources` para os quatro campos do mecanismo remoto; os novos campos são sempre locais. A validação brasileira foi aplicada somente à entrada manual: o contrato do ProviderAdapter e os snapshots remotos anteriores não foram alterados. Um futuro fabricante que forneça endereço/especificações exige decisão explícita de precedência antes de persistir esses valores.

## Contratos e permissões

Nenhuma rota foi removida. `POST /api/plants` aceita os novos campos opcionais. `PATCH /api/plants/:id` aceita esses mesmos campos, exige `revision` atual e mantém `useRemote` opcional. O vínculo de cliente continua no endpoint próprio, sem duplicar nome/email do cliente na usina. GET de lista/detalhe retorna as colunas adicionais; `operationStartDate` é retornada como `YYYY-MM-DD` ou null, sem horário/fuso. Internamente usa `Date` UTC para o Prisma, persistida como SQL DATE.

Exemplo de criação:

```json
{
  "name": "Usina Exemplo",
  "installationType": "ROOFTOP",
  "capacityKwp": 15.6,
  "nominalPowerKw": 12,
  "moduleTiltDegrees": 18,
  "operationStartDate": "2024-02-29",
  "postalCode": "01234-567",
  "street": "Rua Exemplo",
  "addressNumber": "s/n",
  "city": "São Paulo",
  "state": "sp",
  "latitude": -23.55,
  "longitude": -46.63,
  "technicalNotes": "Inspeção inicial concluída."
}
```

Exemplo de PATCH para limpar observações e atualizar potência nominal, preservando todos os demais campos:

```json
{ "revision": 3, "nominalPowerKw": 13, "technicalNotes": null }
```

ADMIN e OPERATOR mantêm a permissão de criação/edição. CLIENT continua somente consultando usinas do seu cliente, sem autorização de escrita; usina de terceiro retorna 404. Os decorators e guards existentes foram preservados e há testes do RolesGuard real. A edição incrementa revisão e registra as alterações locais na auditoria existente; revisão obsoleta continua gerando conflito.

## Banco e preservação

Migration aditiva preparada: `apps/api/prisma/migrations/20261124040000_plant_details/migration.sql`.

- Cria enum InstallationType e onze colunas opcionais, sem backfill nem defaults artificiais.
- Usa DATE para operação, DOUBLE PRECISION para grandezas/coordenadas e TEXT para endereço/observações, seguindo o padrão atual das potências.
- Adiciona CHECKs de potência nominal finita não negativa, inclinação, CEP, par/faixas de coordenadas e limites dos textos novos.
- Não revalida nem altera nome, cidade, UF ou potência antigos; não muda UUID, cliente, integrações, alertas ou inversores.
- Não modifica migrations anteriores. CHECKs SQL customizados devem ser preservados em futuras migrations, pois não são integralmente representados no Prisma.

**Não aplicada em banco real.** O SQL foi executado somente em PostgreSQL embarcado descartável em memória. Aplicar em destino real exige autorização, backup e ensaio do histórico completo; ALTER TABLE pode adquirir locks. Não foram usados `db push`, reset ou seeds. O Prisma Client foi regenerado localmente sem conexão ao banco.

## Mapeamento do legado, sem migração automática

| Legado/localStorage                     | API                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `name`, `city`, `state`                 | Campos existentes de mesmo nome                                                   |
| `capacity`                              | `capacityKwp`                                                                     |
| `type` Solo/Telhado/Híbrida             | `installationType` GROUND/ROOFTOP/HYBRID                                          |
| `nominal`, `tilt`, `startDate`, `notes` | `nominalPowerKw`, `moduleTiltDegrees`, `operationStartDate`, `technicalNotes`     |
| `cep`, `street`, `number`, `complement` | `postalCode`, `street`, `addressNumber`, `addressComplement`                      |
| `client`, `email`                       | Conciliar com entidade Client e depois usar `clientId`; não copiar nome como UUID |

Exportar o localStorage antes de eventual importação futura, validar unidades/datas/UF, converter strings vazias para ausência/null após revisão e conciliar registros por UUID/identidade sem fusão automática. Tipos desconhecidos exigem classificação explícita; não converter silenciosamente para OTHER. Nenhum dado local foi lido do navegador, alterado ou importado nesta tarefa.

## Arquivos e validação

Alterados: `apps/api/prisma/schema.prisma`, `src/plants/plants.schemas.ts`, `plants.service.ts`, `plant-dto.ts` e seus testes, além do teste do catálogo. Criados: `src/plants/plant-details.ts`, `plant-details.spec.ts`, migration `20261124040000_plant_details`, `test/plant-details-migration.test.cjs` e este documento. Caminhos `src`/`test` relativos a `apps/api`. Nenhum arquivo React/HTML foi modificado.

Ambiente: Windows/PowerShell, Node 24.22.3, Prisma 6.19.3 e dependências locais. Executáveis foram chamados diretamente pelo Node do runtime disponível, equivalente aos scripts dos workspaces. Verificações:

| Comando/verificação                                                | Resultado                        |
| ------------------------------------------------------------------ | -------------------------------- |
| Jest API `--runInBand --no-cache`                                  | PASSOU: 107 unitários (23 novos) |
| E2E API com `--experimental-vm-modules`                            | PASSOU: 41 existentes com mocks  |
| TypeScript API `tsc --noEmit --incremental false -p tsconfig.json` | PASSOU                           |
| ESLint API `--no-fix`                                              | PASSOU                           |
| Build API `nest build`                                             | PASSOU                           |
| Prisma `validate` e `generate`                                     | PASSOU, sem banco                |
| Prettier dos arquivos alterados e `git diff --check`               | PASSOU                           |
| SQL PGlite: testes de usinas, inversores e detalhes                | PASSOU: 4 cenários               |
| Migration em servidor real, carga e UI dos novos campos            | NÃO EXECUTADO                    |

O teste SQL percorre o histórico, compara cada campo anterior e o histórico de alertas e verifica as novas constraints sem remover dados. Os unitários cobrem todas as UFs, formatos/limites, datas inválidas/bissextas/futuras, CEP com zero inicial, coordenadas parciais na edição, separação de overrides, campos omitidos/nulos, edição de importadas, permissões e formato de resposta. A regressão do catálogo verifica que sync não escreve os campos locais.

Avisos existentes: VM Modules experimental no Node/Jest e configuração `package.json#prisma` descontinuada para Prisma 7. Node 26 indicado em `.nvmrc` não foi validado nesta sessão. O painel continua com os campos já existentes; os novos estão disponíveis pela API, aguardando tarefa de interface autorizada.

Nenhum commit ou push executado. A próxima etapa depende de autorização.
