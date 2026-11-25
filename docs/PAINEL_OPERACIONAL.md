# Painel operacional React — Premium Blue

Implementação em `apps/painel`, preservando o shell, tokens de cor, tipografia, imagem, cartões e formulários existentes. Não houve alteração da API, migrations, interface HTML antiga ou dados persistidos.

## Páginas e integração

| Página/rota                        | Fluxos e endpoints utilizados                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Visão geral `/`                    | Usinas e alarmes ativos via GET `/plants` e `/alerts`; atualização periódica, erro com retry, ausência de leitura como — e aviso de simulação DEMO                             |
| Usinas `/usinas`                   | GET `/plants` com busca, status e paginação de 20; cadastro rápido/edição de overrides já existentes; descobertas, importação e vinculação existentes preservadas              |
| Cadastro `/usinas/cadastro`        | POST `/plants`, com campos técnicos, endereço, 27 UFs, coordenadas, cliente e observações; somente equipe                                                                      |
| Detalhes `/usinas/:id`             | GET/PATCH `/plants/:id`, controle de revisão e PATCH `/plants/:id/client`; links para inversores e relatórios da usina                                                         |
| Inversores `/inversores?usina=:id` | GET/POST/PATCH `/plants/:id/inverters`; DELETE individual com revisão, confirmação de série e motivo para arquivamento por ADMIN                                               |
| Clientes `/clientes`               | Listagem paginada/busca, consulta individual, POST/PATCH, limpeza explícita de campos opcionais e DELETE sujeito à proteção de vínculos do servidor                            |
| Usuários `/usuarios`               | Gestão ADMIN com busca/perfil/paginação; POST/PATCH, vínculo obrigatório para CLIENT, senha de criação/troca opcional na edição e ativação/desativação                         |
| Alarmes `/alarmes`                 | GET `/alerts` por tipo/situa??o/p?gina; reconhecimento, resolu??o justificada e hist?rico por epis?dio                                                                         |
| Relatórios `/relatorios?usina=:id` | GET `/plants/:id/measurements` paginado ou `/aggregations` diário/mensal/anual; recorte UTC, fuso civil, opt-in DEMO e CSV da página consultada                                |
| Configurações `/configuracoes`     | Perfil, link para troca de senha existente, GET `/providers` e `/integrations`, criação ADMIN de integração com os campos do provedor, pausa/ativação/arquivamento com revisão |

Os caminhos na tabela são relativos a `/api`. Navegação e rotas de autenticação/troca/recuperação de senha foram preservadas. A página de cadastro completo é adicional ao cadastro rápido existente; não substitui nem remove os fluxos de conciliação/importação aprovados.

## Permissões e integridade

- ADMIN acessa usuários e ações administrativas. OPERATOR gerencia cadastros permitidos, mas não cria/arquiva integrações nem arquiva inversores. CLIENT consulta somente o que a API autoriza e não recebe ações de escrita.
- Acesso direto a `/usuarios` por não ADMIN ou a `/usinas/cadastro` por CLIENT mostra mensagem de acesso restrito, sem consultar o endpoint restrito. O backend continua sendo a autoridade de autorização; ocultar botão não substitui seus guards.
- Campos de cliente ocultados pelo backend não são reconstruídos no navegador. Algumas informações técnicas/endereço/observações podem aparecer vazias conforme o perfil.
- Senha, credenciais e token não são armazenados em localStorage. Reutilizado o cliente HTTP com cookie e header CSRF. Mensagens de validação Zod do servidor agora são apresentadas com o campo correspondente.
- PATCH técnico envia somente campos alterados, mantendo revisão; não reenvia valores antigos de fabricante como novos overrides. Limpeza explícita usa null. O controle `useRemote` existente continua disponível no editor rápido de Usinas.
- Usuários não podem rebaixar/desativar a si próprios pelos controles do formulário. Mudanças de acesso/senha podem invalidar a sessão por decisão da API; o painel preserva o fluxo existente de reautenticação.
- Arquivamento de inversor exige série e motivo; exclusão de cliente é confirmada e o conflito 409 de vínculos é mostrado. Não há exclusão automática de registros relacionados.

## Carregamento, erros e navegação

Páginas consultam dados reais por `api(...)`, com carregamento, mensagens de erro, retry, vazios explícitos e bloqueio de envio durante mutações. O hook de consulta descarta respostas de efeitos desmontados; Usinas também usa geração de requisição para não aplicar resultados antigos de filtros. Os seletores de usina percorrem a paginação disponível, em vez de limitar a escolha silenciosamente às primeiras cem usinas.

Usinas, clientes, usuários, alarmes, inversores e leituras usam paginação do servidor. Busca de clientes/usuários/usinas e status/perfil/situação são enviados à API. O filtro de texto de inversores e mensagens de alarme é identificado como filtro **da página atual**, pois esses endpoints não oferecem busca textual global. Seletores auxiliares percorrem páginas sem assumir um snapshot transacional do banco.

O menu móvel recolhe/expande com `aria-expanded`/`aria-controls`; navegação selecionada fecha o menu. Os controles mantêm rótulos, foco visível e áreas de toque. Tabelas de relatório possuem rolagem contida, sem provocar overflow horizontal da página. O sino leva aos alarmes e não apresenta falha de consulta como contagem zero confirmada.

## Simulações e relatórios

O único provedor atual é DEMO. A visão geral informa a simulação; páginas de usina/configurações identificam DEMO quando disponível no DTO; relatórios excluem simulações por padrão e marcam cada resultado simulado quando o usuário optar por incluí-las. Não há fixtures ou números aleatórios em código de produção.

- Filtros de início/fim são explicitamente UTC; linhas de leitura usam o fuso do navegador. Agregações usam o fuso informado no formulário.
- Não somar potência nem acumuladores. Energia de período desconhecida aparece como —; agregações mostram pico observado, energia observada, exclusões e ausência de garantia de cobertura completa.
- O adaptador atual não fornece energia de período; essa coluna/agregação pode permanecer sem valor. Não foi calculada geração sintética para preenchê-la.
- Relatórios agrupados usam `/plants/:id/reports` e permitem selecionar fontes atuais ou históricas autorizadas, mesmo após desvinculação. Não misturam fontes automaticamente.
- Leituras aceitam até 366 dias; relatórios SQL aceitam até 3.660 dias e não usam o limite de 50.000 amostras do endpoint antigo de agregações, preservado para compatibilidade.
- CSV de leituras exporta somente a página consultada. Relatórios diários/mensais/anuais oferecem gráfico, CSV completo do recorte e PDF paginado. Desconhecidos, simulação e ausência de garantia de cobertura são preservados. Veja [contratos, regras e homologação](ALARMES_RELATORIOS.md).

## Configurações disponíveis

Configurações implementa conta, integrações e, para ADMIN, políticas de alarmes por usina, destinatários/eventos de e-mail e histórico paginado de envios. Notificações dependem de habilitação no painel e no servidor, com SMTP; DEMO nunca envia. Credenciais são enviadas ao criar, não recuperadas para edição nem exibidas como valor já cadastrado. Somente plataformas retornadas por `/providers` são oferecidas. Tema e tarifas globais continuam sem endpoint próprio.

## Testes realizados

Ambiente: Windows, Node 24.22.3 e Microsoft Edge via Playwright já utilizado nos testes do projeto. Node foi chamado pelo caminho do runtime disponível nesta sessão. Sem iniciar banco nem enviar e-mail, sem modificar dados reais.

| Verificação                                        | Resultado                                                                                                                                                            |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript painel, `tsc --noEmit`                  | PASSOU                                                                                                                                                               |
| Build Vite de produção                             | PASSOU                                                                                                                                                               |
| Prettier dos arquivos alterados e git diff --check | PASSOU                                                                                                                                                               |
| Browser: `tests/auth.test.cjs`                     | PASSOU — sessão, reautenticação e logout                                                                                                                             |
| Browser: `tests/catalogo.test.cjs`                 | PASSOU — cadastro rápido, descoberta e vínculo sem duplicação                                                                                                        |
| Browser: `tests/paginas.test.cjs`                  | PASSOU — fluxos operacionais, retry, paginação, criação de cliente/usuário, cadastro técnico, inversor/arquivamento, alarme, relatórios/CSV, integração e permissões |
| Reflow                                             | PASSOU — dez rotas em 1366, 683, 390 e 320 px, sem overflow horizontal da página                                                                                     |
| Inspeção visual                                    | Realizada em capturas da visão geral desktop e cadastro móvel; Premium Blue preservado                                                                               |

O teste operacional intercepta **todas** as chamadas `/api/**`; fixtures existem apenas nos testes. Confere caminhos, métodos, payloads e header CSRF e exige ausência de erros JavaScript. Não é um ensaio com API/banco/SMTP reais nem uma auditoria WCAG completa. As validações finais de implantação e acessibilidade assistiva permanecem pendentes.

Com Node e dependências de testes preparadas:

```powershell
npm run typecheck -w apps/painel
npm run build -w apps/painel
$env:BROWSER_CHANNEL = 'msedge'
npm test -w apps/painel
Remove-Item Env:BROWSER_CHANNEL
```

O script `test` foi acrescentado ao workspace do painel. Os testes reutilizam Playwright de `apps/web/tests`; se não estiver instalado, preparar esse workspace e um navegador compatível conforme os testes existentes. Nenhuma ferramenta nova de produção foi adicionada.

## Arquivos e limites da entrega

Alterados: `apps/painel/package.json`, `src/App.tsx`, `api.ts`, `tipos.ts`, `estilos.css`, `componentes/Layout.tsx`, `paginas/Inicio.tsx`, `paginas/Usinas.tsx`. Criados: `componentes/Dados.tsx`, páginas `Cadastros`, `UsinaDetalhes`, `Inversores`, `Alarmes`, `Relatorios`, `Configuracoes`, teste `tests/paginas.test.cjs` e este documento. Caminhos `src` relativos ao painel.

Pendente: ensaio ponta a ponta com backend/banco isolados usando dados e configurações autorizados, validação em Node 26 e revisão de acessibilidade com leitor de tela. Funcionalidades sem contrato existente foram explicitadas, não simuladas como prontas. Nenhum commit ou push executado.
