# Estratégia de consolidação do front-end SolarSystem

## 1. Escopo e situação inspecionada

Diagnóstico da Tarefa 01 em 23/11/2026. Proposta para aprovação; não é uma migração executada.

- Repositório local: `C:\Users\atosm\OneDrive\Desktop\web\SolarSystem`.
- Remoto configurado: `https://github.com/MatheusBryan31/SolarSystem.git`.
- Branch: `main`. HEAD inspecionado: `7fe876d` (merge da PR #13).
- Commits recentes relevantes: `0adbc02` (base React), `b50e7e4` (sessão por cookie e logout) e `011184b` (visual e Visão geral com dados da API).
- Árvore de trabalho limpa antes desta tarefa. Não houve fetch/pull: a referência é o checkout local, sem afirmar que ele contém commits remotos ainda não baixados.
- Não foram encontrados arquivos `AGENTS.md` na árvore do repositório nem nos diretórios ancestrais consultados.
- Esta tarefa cria somente este documento. Não modifica autenticação, API, banco, dependências, dados ou interfaces; não remove/move `apps/web`, não importa dados e não faz commit/push.

O código atual substitui o contexto histórico do protótipo: agora existe autenticação real na API e no React. A versão HTML continua demonstrativa e independente dela.

## 2. Diagnóstico das interfaces

### 2.1. `apps/painel`: base proposta da interface principal

Aplicação React + TypeScript + Vite, workspace `@solarsystem/painel`. `src/main.tsx` monta `BrowserRouter` e `AuthProvider`; `src/App.tsx` define somente `/login` e `/`. Endereços desconhecidos são redirecionados conforme a presença do usuário. Não há rotas implementadas para Usinas, Detalhes, Cadastro, Alarmes, Relatórios ou Configurações.

`src/auth.tsx` consulta `/auth/me` na abertura e usa `/auth/login` e `/auth/logout`. `src/api.ts` concentra HTTP em `/api`, envia cookies com `credentials: 'same-origin'`, converte erros e avisa o contexto em respostas 401. O proxy de desenvolvimento em `vite.config.ts` encaminha `/api` para `http://localhost:3333`. O token não é armazenado no JavaScript nem no localStorage.

O login possui validação nativa, mostrar/ocultar senha, erro e estado de envio. Não possui Lembrar e-mail, recuperação nem modal de cadastro. O layout exibe nome e papel do usuário autenticado, avatar, Sair e contador de alertas. Avatar e sino não abrem páginas/modal. O menu oferece apenas Visão geral.

`src/paginas/Inicio.tsx` consulta usinas e alertas a cada 60 segundos, apresenta indicadores, capacidade/potência/energia, distribuição de status, ranking de geração e até cinco alertas. São dados recebidos da API, mas isso **não comprova telemetria de fabricantes reais**: o catálogo atual de provedores contém somente `DEMO`.

Limitações identificadas no código, sem correção nesta tarefa:

- Visão geral pede uma única página de até 100 usinas e 100 alertas, ignora o `total` para agregação e pode subcontar conjuntos maiores. O contador do cabeçalho usa o total do endpoint, podendo divergir da tela.
- Valores de telemetria `null` entram nas somas como zero. A indicação “Ao vivo” não considera explicitamente idade da leitura; ausência de alertas críticos pode resultar em “Tudo operando” apesar de dados desconhecidos/offline.
- O logout suprime falhas da chamada HTTP e limpa o usuário em memória. Se o servidor não limpar o cookie, uma nova abertura pode restaurar a sessão. Alterar esse comportamento exige autorização específica; não faz parte desta tarefa.
- Não há scripts/suíte de testes próprios do painel no manifesto; há build com `tsc --noEmit && vite build`. Responsividade existe no CSS, mas sua equivalência ao legado não foi validada em navegador nesta análise.

### 2.2. `apps/web`: referência funcional e visual preservada

Oito páginas HTML em `paginas`, CSS compartilhado em `estilos/styles.css`, folhas específicas e JavaScript sem framework. `plant-store.js` é a origem dos cadastros locais; `app.js` implementa gravações e operações; `internal.js` complementa filtros, abas e relatórios; `sidebar.js` e `internal-shell.js` compartilham navegação; `user-profile.js` compartilha o modal demonstrativo.

Existem fluxos locais de criação e edição de usinas, gestão de inversores, busca e filtros, consulta/atualização de alarmes, relatórios e CSV. A interface não autentica na API: `login.js` valida o formulário, descarta a senha e navega para `index.html`; Sair apenas retorna a `login.html`. Não há proteção real de acesso nesse protótipo.

O login preserva Lembrar e-mail, recuperação como aviso e modal de cadastro visual. Na versão atual, o cadastro informa expressamente que nenhuma conta/e-mail foi criado/enviado. O perfil usa “Técnico” e “Não informado”, não dados de uma sessão real. Não usar esses valores como identidade para migração.

Gráficos de produção e mapa são ilustrativos. Relatórios de capacidade e quantidade de alarmes usam os cadastros locais; a série de energia é fictícia. Configurações apresenta identidade visual, recursos planejados e restauração aditiva de exemplos; não configura integrações reais.

Há testes de navegador em `apps/web/tests/frontend.test.cjs`, com casos de login/modal, cadastros, séries duplicadas, edição/remoção de equipamentos, alarmes, CSV, armazenamento inválido, falhas de gravação, conflitos entre abas, restauração e reflow. Sua presença não significa que foram executados nesta tarefa.

## 3. Matriz de funcionalidades e lacunas

“Local” significa funcional no navegador, não integrado à API. “Ausente” indica falta de implementação, mesmo que exista texto de planejamento. “Parcial” não conta como paridade.

| Área/funcionalidade | React atual | HTML atual | Lacuna e destino proposto |
| --- | --- | --- | --- |
| Login e sessão real | Disponível: login, `/me`, cookie, tratamento de 401 e logout | Ausente: entrada demonstrativa | Manter autenticação React/API como está; não transportar bypass do legado |
| Mostrar/ocultar senha | Disponível | Disponível | Preservar acessibilidade e teclado |
| Lembrar e-mail | Ausente | Preferência local, sem senha | Portar somente após aprovação; nunca transportar senha/token |
| Recuperação de senha | Ausente | Aviso demonstrativo | Fluxo real ausente em ambos; manter indicação honesta se reapresentado |
| Criar conta | Ausente | Modal demonstrativo, sem persistência/envio | Decidir se preservar protótipo no React; cadastro real não está autorizado |
| Visão geral | Disponível com API, atualização periódica e agregação limitada a 100 itens | Indicadores locais, gráficos/produção ilustrativos e mapa esquemático | Portar funções úteis sem apresentar simulação como leitura real; tratar paginação, nulos e leituras antigas |
| Listagem/pesquisa de usinas | Somente ranking/resumo, sem página própria | Local: lista, busca por nome/série e filtros por status/tipo/UF | Criar página React; listagem API já existe, mas não cobre todos os filtros do legado |
| Detalhes de usina | Ausente | Disponível, abas e dados locais | API possui consulta por ID; campos/equipamentos legados não cabem integralmente no contrato atual |
| Cadastro/edição manual de usinas | Ausente | Local: formulário, validações, cliente/endereço e primeiro inversor | Não existe contrato API equivalente; preservar legado até decisão sobre modo local e modelo remoto |
| Inversores | Ausente | Local: adicionar, editar, remover, rejeitar séries duplicadas | Ausente na API como recurso/modelo independente; não substituir equipamentos por contagens |
| Alarmes | Consulta resumida e contador; sem página nem ação de reconhecimento | Lista, filtros, detalhes e alteração local de status | Criar página; API oferece reconhecimento, não alteração arbitrária igual ao legado |
| Relatórios | Ausente como tela | Filtros, indicadores, gráficos de capacidade/alarmes; energia ilustrativa | Portar filtros e relatórios disponíveis; histórico real não existe no modelo atual |
| Exportação CSV | Ausente | Exporta resumo das usinas filtradas | Portar exportação segura; CSV atual não serve de backup integral |
| Backup/restauração integral | Ausente | Não há exportador/importador completo; restauração adiciona exemplos | Projetar JSON versionado com conferência e consentimento; não executar agora |
| Configurações | Ausente | Informativa e restauração aditiva de exemplos | Migrar funções locais necessárias; não confundir textos com configuração funcional |
| Navegação | Router/layout compartilhado, somente início | Sete telas internas, menu responsivo e busca global | Expandir rotas e links sem quebrar acesso ao legado |
| Perfil de usuário | Nome/papel reais no layout; modal ausente | Modal fixo em todas as telas internas | Recriar modal com `useAuth`, sem inventar dados nem editar autenticação |
| Sair | Chamada real `/auth/logout` e limpeza do contexto | Retorno ao login demonstrativo em todas as telas internas | Preservar distinção; nunca usar navegação HTML como logout de sessão real |
| Integrações de fabricantes | Sem tela; dados via API | Textos de planejamento | Só provedor DEMO implementado na API; demais integrações ausentes |
| Histórico temporal real e notificações por e-mail | Ausentes | Simulações/textos de planejamento | Ausentes no escopo atual; trabalhos separados, mediante aprovação |

### 3.1. Contratos existentes que delimitam a transição

- Autenticação: `POST /api/auth/login` com `{ email, senha }`, resposta `{ usuario }`; `GET /api/auth/me`; `POST /api/auth/logout` (204). Cookie `solarsystem_sessao`, httpOnly, SameSite Strict, caminho `/api`, Secure em produção. Não alterar contratos ou opções nesta tarefa.
- Usinas: `GET /api/plants` (busca/status/paginação), `GET /api/plants/:id`, `PATCH /api/plants/:id/client`. Não há POST de criação manual nem PATCH geral de cadastro.
- Alertas: `GET /api/alerts` e `PATCH /api/alerts/:id/ack`. A resolução decorre das condições avaliadas no backend; não equivale à edição local de status do protótipo.
- Existem recursos de clientes, usuários, integrações e provedores na API, mas não telas correspondentes no painel. Usinas remotas pertencem a uma integração e possuem `externalId`; clientes são entidades relacionadas, não apenas nomes.
- `Plant` não contém os endereços completos, observações, inclinação, potência nominal nem coleção de inversores do legado. Não há modelo de histórico temporal de produção. O modelo `Alert` também não é idêntico ao alarme local.
- Guards e serviços restringem acesso por perfil/vínculo de cliente. Uma importação futura precisa de atribuição explícita de titularidade; o localStorage não comprova autorização para inserir dados numa conta.

Fontes: `apps/api/src/{auth,plants,alerts,clients,users,integrations,providers}` e `apps/api/prisma/schema.prisma`.

## 4. Dados locais a preservar

### 4.1. Inventário e limites do diagnóstico

Não foram lidos perfis do navegador nem registros pessoais reais. O inventário abaixo deriva do código; quantidade, origem e qualidade dos cadastros reais ainda precisam ser verificadas pelo usuário no navegador que os contém.

| Fonte | Conteúdo | Tratamento proposto |
| --- | --- | --- |
| `localStorage['solaris.plants.v1']` | Array de usinas, inversores e alarmes aninhados, inclusive campos adicionais de versões antigas | Backup integral bruto e JSON versionado; conservar IDs, relações e propriedades desconhecidas |
| `localStorage['solarsystem.rememberedEmail']` | Preferência opcional de e-mail | Preservar origem antiga; transferência opcional e consentida, sem valor de autenticação |
| Exemplos em `plant-store.js` | Três usinas usadas quando a chave não existe | Separar fallback em memória de cadastro persistido; ausência de chave não é evidência de perda |
| Dados da API/PostgreSQL | Usuários, clientes, integrações, usinas e alertas | Continuar sob os contratos e permissões atuais; não sobrescrever com dados locais |
| Cadastro visual/senha de login | Dados transitórios descartados pelo protótipo | Não exportar, armazenar nem converter em usuários/sessões |

`localStorage` depende de esquema, hostname e porta, além do perfil do navegador. `localhost` e `127.0.0.1`, HTTP e HTTPS ou portas distintas não compartilham os dados. Caminho de página não separa localStorage dentro da mesma origem. Mover a aplicação não transporta automaticamente os registros. A mesma origem também não faria o React consumi-los: hoje ele só usa API para dados de negócio.

O store diferencia chave inexistente (exemplos em memória) de lista vazia `[]` (vazia de fato). Dados ilegíveis bloqueiam gravação, não autorizam substituição por exemplos. O salvamento compara o snapshot com o conteúdo atual e usa Web Locks quando disponível; a transição deve preservar a proteção contra conflitos, sem prometer atomicidade equivalente em navegadores sem locks.

### 4.2. Mapeamento preliminar, sem conversão automática

| Legado | Destino possível | Restrição/decisão |
| --- | --- | --- |
| `id` | `legacyId` em metadados de migração | IDs antigos como `plant-1` não são UUIDs; não reutilizar cegamente em endpoints com `ParseUUIDPipe` |
| `name`, `city`, `state`, `capacity` | `name`, `city`, `state`, `capacityKwp` | Conferir unidade, valores vazios e procedência; dados sincronizados podem sobrescrever nome/capacidade |
| `client`, `email` | Candidato a vínculo com `Client` | Nomes/e-mails não são identificação única segura; não criar/fundir clientes automaticamente |
| `type`, `tilt`, `nominal`, `startDate`, `notes`, `cep`, `street`, `number`, `complement` | Modelo local de compatibilidade ou extensão futura aprovada | Sem destino completo no contrato remoto atual; manter no backup e na fonte local |
| `inverters[]`: ID, marca, modelo, série, status | Entidades locais preservadas; recurso remoto a definir | Sem modelo/endpoint equivalente; validar séries normalizadas e preservar IDs/associação com usina |
| `alarms[]`: ID, título, descrição, data, severidade, status | Histórico local arquivado; mapeamento futuro revisado | Datas como “Hoje, 13:47” não são instantes recuperáveis; não inventar fuso/data nem converter severidades sem regra |
| Status local derivado dos inversores | Enum remoto apenas quando semanticamente válido | `Online`, `Atenção`, `Offline`, `Sem dados` não bastam para derivar `FAULT` ou estado remoto autenticado |
| Campos extras, inclusive `brand/model/serial` antigos no nível da usina | Metadados legados íntegros | Preservar sem apagar ou tratar como equipamento adicional por suposição |

### 4.3. Processo proposto para preservação e transferência futura

1. Identificar com o usuário cada origem/perfil/dispositivo que contém cadastros, mantendo a versão HTML acessível no endereço original. Não limpar armazenamento, cookies ou pastas.
2. Em trabalho posterior autorizado, oferecer exportação completa na origem antiga: conservar a string bruta e um envelope JSON versionado com origem, data de exportação, quantidade de registros e todos os campos/coleções. Hash de integridade ajuda a detectar alteração, mas não comprova autoria.
3. Confirmar backup legível e restauração em ambiente isolado antes de qualquer transferência. Se JSON inválido, conservar os bytes originais para análise; não “corrigir” por substituição silenciosa.
4. Validar arquivo como entrada não confiável: tamanho/estrutura/versão, IDs duplicados, séries, números, campos extras e relações. Renderizar conteúdo como texto; manter proteção contra fórmulas em CSV. Não executar HTML ou scripts do arquivo.
5. Exibir prévia e divergências; identificar usinas/inversores/alarmes por IDs de origem e séries, nunca só pelo nome. Homônimos não são duplicatas comprovadas. Não mesclar clientes, apagar registros nem substituir dados sem confirmação.
6. Definir destino aprovado: compatibilidade local versionada no React, ou importação remota com contrato próprio futuro. Não chamar endpoints inexistentes nem usar integração DEMO como atalho de importação.
7. Após autorização, importar em lote auditável, repetível sem duplicações, com relatório de aceitos/rejeitados e mapa `legacyId -> id` quando houver novos IDs. Comparar contagens, coleções e amostras/campos antes de declarar paridade.
8. Manter backup e legado intactos até aceite. Reverter a interface padrão deve ser possível sem restaurar por cima do banco ou perder os registros novos. Planejar conciliação se ambas as versões continuarem gravando.

O CSV atual contém somente Usina, Cidade, UF, Status, Potência e quantidade de Inversores, e respeita filtros ativos. Não contém séries, alarmes completos, endereço, IDs ou observações: **não é backup integral nem formato suficiente para migração**. Não existe importação JSON/CSV pronta em nenhuma das interfaces.

## 5. Arquitetura recomendada

Adotar `apps/painel` como interface principal **proposta**, após aceite das etapas abaixo. Manter `apps/web` como referência funcional e rota de continuidade durante a transição, sem embutir seus scripts no React.

Estrutura sugerida, a ser criada em tarefas posteriores:

```text
apps/painel/src/
  App.tsx                 # rotas e composição
  auth.tsx                # contexto existente, sem reescrever sessão
  api.ts                  # cliente HTTP existente
  componentes/            # layout, campos, tabelas, diálogos, feedback
  funcionalidades/
    usinas/               # lista, detalhe, filtros, cadastro compatível
    inversores/           # gestão e validação de séries
    alarmes/              # consulta e ações permitidas
    relatorios/           # agregações e exportações
    configuracoes/        # preferências e informações
    perfil/               # apresentação do usuário autenticado
  dados/
    remoto/               # adaptadores dos contratos API atuais
    legado/               # leitura/exportação/importação futura explícita
    modelos/              # modelos distintos e conversões verificáveis
```

- Uma aplicação, um router e um layout compartilhado. Rotas propostas: `/`, `/usinas`, `/usinas/:id`, `/usinas/nova`, `/usinas/:id/editar`, `/alarmes`, `/relatorios`, `/configuracoes`. Rotas de gravação só entram quando o destino e as permissões forem aprovados; nomes aqui não indicam implementação existente.
- Manter a porta HTTP única `api.ts`, DTOs tipados e diferenciação entre erros, ausência de dados e carregamento. Usar os mecanismos React existentes; nenhuma biblioteca adicional é necessária para esta proposta.
- Separar modelos legados dos DTOs remotos. Não criar uma interface que finja oferecer CRUD remoto quando o contrato só oferece leitura/vínculo de cliente.
- API como fonte de verdade para dados remotos; dados locais permanecem identificados como locais, sem fallback automático que substitua um erro de rede por exemplos. Não mesclar totais de fontes distintas nem gravar em duas fontes silenciosamente.
- Usar `useAuth` para o perfil real e manter regras de autorização no servidor; ocultar botões não substitui os guards. O protótipo HTML não vira mecanismo alternativo de autenticação.
- Preservar identidade visual marinho/azul/branco/verde e os fluxos aprovados como referência. Portar componentes de forma explícita, sem importar globalmente os CSS do HTML: ambos têm regras globais e nomes como `.login-hero`.
- Desenvolvimento: manter proxy Vite existente. Publicação futura: definir mesma origem para `/api` e fallback de rotas SPA, mantendo uma localização acessível para o legado. `vite preview` não define sozinho essa arquitetura. Não trocar portas/origens que contêm cadastros antes do backup.

## 6. Transição gradual e pontos de controle

| Etapa | Trabalho futuro | Critério para avançar |
| --- | --- | --- |
| 0 — Aprovação | Revisar este diagnóstico, escopo de paridade, fonte de dados e identidade visual | Decisões do capítulo 8 aprovadas; nenhuma migração nesta tarefa |
| 1 — Inventário e proteção | Levantar origens/dados reais e disponibilizar backup completo, prévia e ensaio isolado | Arquivos completos conferidos; casos vazio/inválido e conflitos tratados |
| 2 — Paridade de leitura | Expandir navegação, lista/detalhes, perfil, alarmes, relatórios possíveis e configurações; completar paginação e estados | Todas as leituras e filtros acordados funcionam; dados reais e ilustrativos identificados |
| 3 — Paridade de escrita | Implementar fluxos de usina/inversor e preservação de alarmes conforme destino aprovado | Nenhuma função local perdida; sem sobrescrever campos do provedor nem alterar contrato sem autorização |
| 4 — Piloto e conciliação | Transferência explícita apenas de dados autorizados e validados; aceite por usuário/perfil | Paridade de campos/contagens, idempotência, permissões e retorno ao legado demonstrados |
| 5 — Interface padrão | Atualizar entrada/documentação/hosting para React | Aceite formal e critérios do capítulo 7 satisfeitos; plano de retorno ensaiado |
| 6 — Descontinuação de uso | Retirar dependência operacional do HTML | Aprovação específica; conservar arquivos/backup. Esta estratégia não autoriza exclusão de `apps/web` |

Durante coexistência, informar claramente em qual interface/fonte se está trabalhando. Preferir transferência por grupos com um único local de escrita por conjunto após aceite. A política para novas alterações no legado deve ser combinada antes de iniciar o piloto; não bloquear usuários ou tornar dados somente leitura nesta tarefa.

## 7. Critérios de aceitação para descontinuar o uso do legado

- [ ] Inventário de todas as origens/perfis aprovado; backups íntegros conferidos e restauração demonstrada, incluindo lista vazia, JSON ilegível e campos desconhecidos.
- [ ] Todos os cadastros próprios, inversores, séries, alarmes, campos extras e vínculos preservados ou exceções explicitamente aceitas. Nenhum descarte silencioso para adaptar o schema.
- [ ] Matriz de paridade assinada: cada função local implementada, substituída por equivalente aprovado ou aposentada com aprovação explícita. Ausência de API não pode ser escondida por botão sem efeito.
- [ ] Fluxos de lista/detalhe/cadastro/edição e inversores cobertos por testes, incluindo séries duplicadas, homônimos, IDs inexistentes e falha de gravação.
- [ ] Alarmes com estados e severidades corretamente apresentados; diferenças entre reconhecimento remoto e edição local aceitas. Histórico ilustrativo não tratado como real.
- [ ] Agregações corretas além de 100 itens; indicadores distinguem zero de desconhecido e informam idade/origem dos dados. Exportação respeita escopo e não perde registros por paginação.
- [ ] Autenticação atual continua íntegra: login inválido, `/me`, expiração/401, saída, sessão reaberta, isolamento ADMIN/OPERATOR/CLIENT e cliente sem vínculo verificados. Eventuais correções de logout discutidas separadamente.
- [ ] Busca, filtros, CSV seguro e backup integral testados; reimportação não duplica nem sobrescreve sem revisão. Sem exposição de tokens, credenciais de provedores ou senhas.
- [ ] Navegação direta/recarregamento das rotas funciona no ambiente alvo; perfil e Sair em todas as telas internas, sem esses controles indevidos no login.
- [ ] Responsividade validada em desktop 1366×768, celular a partir de 320px, janela baixa e zoom de 200%; sem cortes/rolagem horizontal; rolagem vertical permitida quando necessária. Teclado, foco, Escape, rótulos e contraste testados.
- [ ] Build do painel e testes pertinentes da API e legado passam em ambiente preparado. Testes React novos cobrem fluxos portados; suíte legada serve como especificação, não apenas como referência estética.
- [ ] Piloto, documentação de execução e plano de retorno aprovados; dados criados durante o piloto têm destino de conciliação. Usuário autoriza expressamente tornar React padrão e depois descontinuar o uso do HTML.

## 8. Riscos e decisões que precisam de aprovação

| Decisão/risco | Recomendação | Aprovação necessária |
| --- | --- | --- |
| Interface principal | React como destino; HTML mantido durante paridade | Aprovar plano e sequência antes da Tarefa 02; não trocar entrada agora |
| Cadastros manuais sem API equivalente | Manter acesso ao legado; escolher camada local compatível ou projeto de contrato remoto separado | Escolher destino e definir quem pode gravar/importar; alterações de API exigem autorização própria |
| Equipamentos e campos sem modelo remoto | Preservação integral antes de qualquer adaptação | Definir modelo futuro e política para campos que não cabem no banco atual |
| Titularidade e duplicidades | Revisão explícita de cliente/conta e proveniência | Aprovar correspondências, regras de conflito e autorização de importação, não inferir pelo perfil Técnico |
| Layout/login e cadastro demonstrativo | Usar o visual aprovado como referência; preservar sessão real React | Aprovar quais funções visuais/preferências portar e quais permanecem apenas no protótipo; nenhuma conta real nova neste plano |
| Histórico, mapas, telemetria e fabricantes | Separar ilustração de produção; não prometer integrações ainda ausentes | Definir quais simulações preservar e escopo futuro dos dados reais |
| Duas interfaces gravando | Um local de escrita por conjunto depois do aceite, com conciliação prevista | Aprovar janela do piloto, responsáveis, retenção de backups e procedimento de retorno |
| Origem, proxy e rotas SPA | Planejar endereço padrão após proteção dos dados locais | Aprovar URL/hosting e atualização de links/documentação; nada publicado agora |
| Limites do dashboard e falha de logout | Registrar como pendências de confiabilidade | Autorizar correções em tarefas próprias, sem reescrever autenticação nesta tarefa |
| Dados pessoais nos arquivos exportados | Backup controlado pelo usuário, sem upload automático | Definir responsáveis, local seguro e retenção; não registrar conteúdo pessoal em logs/documentação |

## 9. Evidências e validação desta tarefa

Inspeção estática dos manifestos, rotas/componentes/estilos React, páginas/scripts/store/testes HTML, controladores/serviços de autenticação/usinas/alertas, recursos relacionados e schema Prisma. Referências principais:

- `apps/painel/src/{main.tsx,App.tsx,auth.tsx,api.ts,tipos.ts}`;
- `apps/painel/src/paginas/{Login.tsx,Inicio.tsx}`, `componentes/Layout.tsx`, `estilos.css` e `vite.config.ts`;
- `apps/web/scripts/{plant-store.js,app.js,internal.js,dashboard.js,sidebar.js,internal-shell.js,login.js,registration.js,user-profile.js}`;
- `apps/web/paginas/*.html` e `apps/web/tests/frontend.test.cjs`;
- `apps/api/src/{auth,plants,alerts,clients,users,integrations,providers}` e `apps/api/prisma/schema.prisma`;
- `package.json`, `README.md`, `docs/INSTALACAO.md` e ADRs existentes.

Validação desta entrega: conferência das referências locais e do diff para assegurar alteração somente documental; `git diff --check`. Não executados: build, testes de navegador, API ou banco, inspeção de localStorage real e envio de requisições. Dependências locais não estão instaladas na raiz; não houve instalação nesta tarefa documental. O relatório não certifica execução em produção nem paridade visual.

**Próximo passo:** aguardar autorização do usuário para a Tarefa 02. Nenhuma etapa de implementação, exportação ou migração começa por este documento.
