# Instalação do SolarSystem no Windows 10/11

Guia para ambiente **local de desenvolvimento**, usando PowerShell na raiz do repositório, salvo indicação diferente. Não execute migrations ou seed contra um banco existente sem conferir destino e backup. Os comandos de banco abaixo são instruções para instalação; não foram executados na atualização desta documentação.

## Pré-requisitos

| Ferramenta | Versão/configuração                                                      |
| ---------- | ------------------------------------------------------------------------ |
| Node.js    | **26**, conforme `.nvmrc`; instalar com npm                              |
| npm        | Versão fornecida com o Node 26; lockfile raiz v3                         |
| Git        | Cliente Git para Windows                                                 |
| PostgreSQL | **17**, com SQL Shell (`psql`) ou pgAdmin                                |
| Navegador  | Edge/Chrome atual para uso; Edge ou Chromium Playwright para testes HTML |
| Python     | **3**, somente para servir manualmente o protótipo HTML                  |
| Editor     | VS Code opcional; recomendações em `.vscode/extensions.json`             |

Downloads oficiais: [Node.js](https://nodejs.org/en/download), [Git para Windows](https://git-scm.com/downloads/win), [PostgreSQL para Windows](https://www.postgresql.org/download/windows/).

Instale Node/npm e Git, reabra o PowerShell e confira:

```powershell
node --version
npm --version
git --version
```

Não instale uma versão antiga apenas porque o manifesto raiz aceita `>=22.12.0`: o Router resolvido exige `>=22.22.0`. A versão de referência do projeto é a 26. A validação anterior dos testes da API usou Node 24.22.3 e npm 11.6.2; isso não substitui validar seu ambiente Node 26.

Se `npm.ps1` for bloqueado pela política do PowerShell, use `npm.cmd` nos comandos abaixo; não é necessário desativar a política do sistema. Se `psql` não estiver no PATH, abra o SQL Shell pelo menu Iniciar ou use o caminho da instalação, por exemplo:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' --version
```

## Obter ou abrir o repositório

Para uma instalação nova, escolha uma pasta de trabalho e execute:

```powershell
git clone https://github.com/MatheusBryan31/SolarSystem.git
Set-Location SolarSystem
git status --short
git branch --show-current
```

Se já possui o projeto, abra a pasta existente e confira branch/alterações antes de atualizar. Não clone por cima, não use `reset --hard` e não substitua arquivos locais para seguir este guia.

## Configurar o PostgreSQL local

No instalador PostgreSQL 17, defina uma senha própria para `postgres` e anote a porta. Os exemplos usam **5432**; se sua instalação usa **5433**, substitua em todos os pontos correspondentes. pgAdmin é opcional e Stack Builder não é necessário para este projeto.

Abra SQL Shell, conecte-se como `postgres` à instância local correta e crie um usuário dedicado e um banco **novos**. Os valores abaixo são placeholders; escolha uma senha própria, nunca reutilize a do exemplo:

```sql
CREATE ROLE solarsystem_app WITH LOGIN PASSWORD 'SUBSTITUA_POR_UMA_SENHA_LOCAL';
CREATE DATABASE solarsystem OWNER solarsystem_app;
```

Se o usuário/banco já existir, não remova nem recrie: confira sua configuração. A aplicação não precisa usar o superusuário `postgres`.

Para testar em uma conexão nova, a partir do PowerShell:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -h localhost -p 5432 -U solarsystem_app -d solarsystem
```

Digite a senha quando solicitada. No psql, `SELECT current_database(), current_user;` confere o destino; `\q` encerra. Cada comando SQL precisa terminar com `;`.

Não é necessário conceder `CREATEDB` para aplicar migrations existentes com `db:deploy`. Somente para **criar novas migrations em desenvolvimento**, `migrate dev` pode precisar de um banco-sombra. Nesse caso, um administrador pode conceder `ALTER ROLE solarsystem_app CREATEDB;` exclusivamente no ambiente local aprovado, ou configurar uma estratégia de banco-sombra separada. Não conceda esse privilégio por padrão em produção.

## Variáveis de ambiente

Na raiz, copie o modelo apenas se o arquivo real ainda não existir:

```powershell
if (-not (Test-Path apps/api/.env)) {
    Copy-Item apps/api/.env.example apps/api/.env
}
```

Edite `apps/api/.env` com seu editor. Nunca publique esse arquivo; `.gitignore` já o exclui. O modelo versionado contém placeholders, não segredos utilizáveis.

| Variável              | Valor/obrigatoriedade                            | Efeito no código                                             |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------ |
| `NODE_ENV`            | Padrão `development`; aceita `test`/`production` | Produção marca cookie como Secure e requer HTTPS             |
| `PORT`                | Padrão `3333`, inteiro positivo                  | Porta HTTP NestJS                                            |
| `DATABASE_URL`        | Obrigatória; começa com `postgresql://`          | Conexão Prisma/PostgreSQL                                    |
| `JWT_SECRET`          | Obrigatória, pelo menos 32 caracteres            | Assinatura/verificação de JWT; gerar aleatoriamente          |
| `JWT_EXPIRES_IN`      | Padrão `28800`, inteiro positivo                 | Validade em segundos: 8 horas                                |
| `WEB_ORIGIN`          | Padrão `http://localhost:5173`                   | Origem autorizada por CORS, com credenciais                  |
| `SYNC_INTERVAL_MIN`   | Padrão `10`, inteiro de 0 a 1440                 | Sincronização periódica; `0` desativa o agendador            |
| `SEED_ADMIN_EMAIL`    | Somente seed                                     | E-mail do administrador inicial; normalizado para minúsculas |
| `SEED_ADMIN_PASSWORD` | Somente seed, mínimo 8 caracteres                | Senha do administrador inicial; armazenada como hash bcrypt  |

Exemplo de conexão, substituindo usuário/senha/porta pelos escolhidos:

```dotenv
DATABASE_URL="postgresql://solarsystem_app:SUBSTITUA_PELA_SENHA@localhost:5432/solarsystem?schema=public"
```

Codifique caracteres especiais de usuário/senha na URL: `@` → `%40`, `:` → `%3A`, `/` → `%2F`, `#` → `%23`, `%` → `%25`. Isso não altera a senha real cadastrada no PostgreSQL.

Gere uma chave JWT e copie o resultado para `JWT_SECRET` no `.env`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Esse comando produz uma chave nova; não cole o resultado em commits ou mensagens. Não use a chave pública de um exemplo anterior. O código não oferece tela de recuperação de senha ou cadastro público real; não confunda o modal demonstrativo do HTML com provisionamento de usuários.

Para primeira inspeção local sem coleta automática, pode configurar `SYNC_INTERVAL_MIN=0`. Com valor maior que zero, a API sincroniza integrações habilitadas também ao iniciar; o trabalho pode gravar usinas/alertas no banco configurado. Isso é comportamento real, mesmo quando o provedor é DEMO.

## Instalar dependências e gerar o cliente Prisma

Na raiz, com o lockfile versionado:

```powershell
npm ci
npm run db:generate -w apps/api
```

`npm ci` instala as resoluções do lockfile e recria `node_modules`; não atualiza o lockfile para conciliar manifestos divergentes. [Referência oficial do npm](https://docs.npmjs.com/cli/v11/commands/npm-ci/). O `postinstall` da API já executa `prisma generate`; o segundo comando deixa explícita a geração e é útil se os scripts foram desativados na instalação. Gerar o cliente não aplica migrations, não cria usuários e não conecta por si só a um banco para sincronizar dados.

Os workspaces raiz incluem `apps/api` e `apps/painel`. Os testes HTML ficam em `apps/web/tests`, com instalação separada. Não instale TypeScript/Jest globalmente para substituir as versões locais: API e painel resolvem versões distintas de TypeScript.

## Aplicar migrations existentes

Confirme que `DATABASE_URL` aponta ao banco local correto e execute:

```powershell
npm run db:deploy -w apps/api
```

O script usa `prisma migrate deploy` para aplicar as migrations versionadas em `apps/api/prisma/migrations`. Ele altera o schema conforme o SQL dessas migrations; **não é garantia de ausência de perda de dados** em um banco já populado. Este guia não recomenda reset, limpeza ou remoção de migrations.

`npm run db:migrate -w apps/api -- --name descricao` é uma tarefa diferente: cria/aplica migrations de desenvolvimento e pode solicitar reset em caso de divergências. Não é necessário para instalar as migrations que já estão no repositório.

## Criar o administrador inicial

Preencha `SEED_ADMIN_EMAIL` com um endereço escolhido para seu ambiente e `SEED_ADMIN_PASSWORD` com uma senha forte própria, de no mínimo oito caracteres. Depois:

```powershell
npm run db:seed -w apps/api
```

Prisma executa `tsx prisma/seed.ts`. O seed cria “Administrador” com perfil `ADMIN` e hash bcrypt. Se o e-mail já existe, o `upsert` não altera esse usuário: não redefine senha, não reativa e não promove automaticamente um usuário existente para administrador. A mensagem do seed não substitui a conferência desse caso.

O seed não cria usinas, clientes ou integrações. Não há botão de troca de senha implementado no painel React; mudanças posteriores de usuário dependem dos endpoints administrativos e permissões existentes. Não orientar o usuário a procurar uma tela que ainda não existe.

## Iniciar API e painel

Atalhos na raiz: `npm run dev:api` e `npm run dev:painel` correspondem aos comandos por workspace abaixo. Para iniciar ambos no mesmo terminal, use `npm run dev`; concurrently encerra o outro processo quando um termina. Os atalhos não iniciam PostgreSQL nem executam migrations, seeds ou resets. A sincronização normal da API continua sujeita a `SYNC_INTERVAL_MIN`.

Abra dois terminais na raiz do repositório.

**Terminal 1 — API:**

```powershell
npm run start:dev -w apps/api
```

API: [http://localhost:3333/api](http://localhost:3333/api). Para verificar a saúde, abra [http://localhost:3333/api/health](http://localhost:3333/api/health). A resposta inclui `status`, `banco`, `servico` e `horario`; indisponibilidade durante a consulta resulta em `degradado`/`erro` com HTTP 200. Uma falha de conexão na inicialização do Prisma também pode impedir a API de subir.

**Terminal 2 — painel React:**

```powershell
npm run dev -w apps/painel
```

Abra [http://localhost:5173/login](http://localhost:5173/login) e use o administrador criado. A Visão geral é [http://localhost:5173/](http://localhost:5173/). O Vite configura porta 5173, mas pode escolher outra se ela estiver ocupada; confira a URL exibida e libere a porta esperada para evitar inconsistências com CORS, cookies e origens de dados.

A tela pode ficar sem usinas porque o seed só cria o administrador. O catálogo atual tem apenas `DEMO`. Cadastrar uma integração requer `POST /api/integrations` por administrador. Com a migration do cadastro único aplicada em ambiente autorizado, `/usinas` permite cadastro manual e revisão das descobertas: sincronizar não importa automaticamente uma identidade nova; o administrador decide importar ou vincular a uma usina existente. Esses fluxos gravam dados e não são executados por este guia. Leia [contratos e implantação do catálogo](IMPLEMENTACAO_USINAS.md) antes de atualizar um banco existente.

Reinicie a API após alterar `.env`. O modo de desenvolvimento acompanha arquivos de código; não dependa de recarga automática das variáveis. `Ctrl+C` encerra cada processo.

### Proxy, cookies e origens

- `src/api.ts` do painel chama `/api/...` com `credentials: 'same-origin'`.
- `apps/painel/vite.config.ts` encaminha `/api` para `http://localhost:3333`, sem remover o prefixo. O navegador acessa a origem do Vite; não precisa contornar CORS com extensões.
- Alterar `PORT` na API exige ajustar também o destino do proxy. `WEB_ORIGIN` autoriza uma origem para CORS e para as verificações de CSRF.
- Login envia `{ email, senha }`, recebe `{ usuario }` e cookie `solarsystem_sessao`. Cookie: HttpOnly, SameSite Strict, Path `/api`, duração `JWT_EXPIRES_IN`, Secure somente com `NODE_ENV=production`.
- `/api/auth/me` restaura o usuário do cookie; 401 limpa o contexto React. `/api/auth/logout` responde 204 e expira o cookie. Não enviar token por Bearer nem gravá-lo no localStorage para usar o fluxo atual.
- Use consistentemente `localhost`; `127.0.0.1` é outro host. Se testar o legado, preserve o endereço original dos cadastros.
- Publicação requer HTTPS, encaminhamento de `/api` e fallback SPA. Não é configurada pelo servidor de desenvolvimento nem pelo comando de preview abaixo.

### HTTPS, CORS e CSRF em produção

- Configure `NODE_ENV=production` e `WEB_ORIGIN` com a origem pública HTTPS exata, como `https://painel.example.com`, sem barra final. Sirva painel e `/api` na mesma origem para o fluxo de cookies do navegador.
- Termine o TLS no proxy reverso e informe seus IPs exatos em `TRUSTED_PROXY_IPS`. Restrinja a porta interna da API ao proxy. Configure o proxy de borda para remover ou sobrescrever `X-Forwarded-For`, `X-Forwarded-Host` e `X-Forwarded-Proto` recebidos do cliente e encaminhar o protocolo real. Configure a borda para redirecionar HTTP para HTTPS. A API rejeita com `403` requisições de produção que não sejam reconhecidas como HTTPS e emite HSTS por um ano para as aceitas. [Express atrás de proxies](https://expressjs.com/en/guide/behind-proxies/)
- O cookie permanece restrito ao host, com `HttpOnly`, `SameSite=Strict` e `Path=/api`. Em produção, login e logout usam `Secure`. Em desenvolvimento, HTTP local continua disponível.
- O CORS libera credenciais apenas para a origem configurada. Rotas de escrita, inclusive login e logout, exigem `X-CSRF-Protection: 1` e rejeitam origens divergentes ou opacas. O painel envia o cabeçalho automaticamente. Clientes de linha de comando e testes HTTP também precisam enviá-lo nas escritas. [OWASP sobre proteção CSRF por cabeçalho](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#employing-custom-request-headers-for-ajaxapi)

### Limite de tentativas de login

O login aceita até 5 tentativas em 60 segundos por IP e e-mail normalizado, com um teto de 60 tentativas por IP no mesmo intervalo. Ao atingir o limite, a API responde com `429` e `Retry-After` em segundos. A espera termina automaticamente e as sessões existentes continuam válidas.

Em conexões diretas, deixe `TRUSTED_PROXY_IPS` vazio. Atrás de um proxy reverso, informe somente os IPs exatos dos proxies controlados, separados por vírgula, e configure o proxy de borda para descartar cabeçalhos `X-Forwarded-For` fornecidos pelo cliente e informar o IP real. Sem essa configuração, a API usa o endereço da conexão recebida, que pode ser compartilhado por todos os usuários do proxy. Para o proxy Vite local, use `127.0.0.1,::1` somente quando a API e o proxy estiverem na mesma máquina de desenvolvimento.

Os contadores ficam em memória por processo. Em uma implantação com várias réplicas, aplique um limite compartilhado no proxy de borda para obter uma cota única entre instâncias.

### Credenciais de integrações em repouso

A API exige `INTEGRATION_CREDENTIALS_KEY` em todos os ambientes. Gere uma chave aleatória exclusiva de 32 bytes em Base64, usando o comando comentado em `apps/api/.env.example`, e guarde-a em um gerenciador de segredos. Todas as réplicas do mesmo banco precisam receber a mesma chave. Guarde também uma cópia recuperável separada do backup. Trocar a variável sem recifrar os dados torna as credenciais antigas inacessíveis.

As credenciais são gravadas com AES-256-GCM, nonce aleatório por gravação e uma tag autenticada. O ID e o provedor da integração vinculam o envelope ao registro. A aplicação só interpreta o conteúdo autenticado durante a sincronização. [Documentação de criptografia do Node.js](https://nodejs.org/download/release/v26.8.2/docs/api/crypto.html)

**Atualização de banco já populado**

1. Faça um backup com acesso restrito e valide a restauração em uma cópia isolada. Backups, WAL e versões antigas de páginas podem conter os dados legados em claro. Aplique a retenção protegida a essas cópias. Se houve exposição anterior, rotacione as credenciais junto aos provedores.
2. Na cópia, confirme que as migrations até `20261124060000_password_recovery` estão aplicadas. Gere o cliente com `npm run db:generate -w apps/api`. Injete `DATABASE_URL` da cópia e `INTEGRATION_CREDENTIALS_KEY` no ambiente do comando.
3. Execute `npm run db:encrypt-integration-credentials -w apps/api -- --check`. O ensaio verifica a chave, a leitura de volta de cada credencial convertida e a integridade dos vínculos. Ele usa os mesmos locks e reverte todas as alterações. Se detectar inconsistências ou colisões dos rótulos DEMO, interrompa e concilie na cópia antes de prosseguir.
4. Em janela de manutenção, confirme o destino e pare as versões antigas da API, sincronizadores e demais escritores. Execute o ensaio no destino e, se passar, execute `npm run db:encrypt-integration-credentials -w apps/api -- --apply`. O utilitário obtém locks exclusivos e converte em uma transação. A conversão mantém UUIDs, vínculos, medições e datas. Rótulos de demonstração `DEMO-…-001` tornam-se `DEMO2-001` para retirar a semente dos identificadores. Mensagens legadas de falha de sincronização são preservadas de forma cifrada.
5. Execute `npm run db:deploy -w apps/api` para aplicar `20261124070000_integration_credentials_encrypted`. A restrição rejeita valores legados e o banco deixa de gerar um objeto em claro como padrão. Para banco vazio, aplique as migrations diretamente.
6. Inicie a versão nova com a chave correta e confirme as contagens e os vínculos. Faça uma coleta controlada e só então reative a agenda. Em caso de falha na conversão, a transação inteira é revertida. Após a conversão, para voltar à versão antiga, restaure o backup verificado em coordenação com a janela de manutenção e com a retenção das escritas realizadas desde o backup.

### Recuperação de senha

1. Aplique as migrations com `npm run db:deploy -w apps/api` antes de executar a versão da API que usa os novos campos de usuário.
2. Configure `SMTP_URL` com uma URL `smtps://` ou `smtp://` e `PASSWORD_RESET_FROM` com um remetente autorizado. Guarde as credenciais SMTP como segredo. Em produção, a conexão SMTP requer TLS. O link usa `WEB_ORIGIN`, e o proxy deve servir o painel também em `/redefinir-senha`. [Transporte SMTP do Nodemailer](https://nodemailer.com/smtp)
3. Valide a entrega em homologação com um destinatário controlado. A API aceita a solicitação com uma resposta genérica e processa o envio em segundo plano. Sem SMTP configurado, a solicitação continua genérica e nenhum link é emitido. Depois de uma falha de entrega, o usuário pode solicitar outro link.

O link expira em 15 minutos e é de uso único. Enquanto houver um link válido, solicitações adicionais não o substituem nem geram outro e-mail. A troca autenticada exige a senha atual. Troca e redefinição revogam as sessões anteriores da conta. No painel, o token do link é lido do fragmento da URL e removido do endereço ao abrir o formulário. Se precisar recarregar a tela, reabra o link no e-mail.

Para executar o teste de concorrência e entrega local, aplique as migrations em um banco descartável chamado `solarsystem_password_validation` em `127.0.0.1`. Aponte `SOLARSYSTEM_PASSWORD_TEST_DATABASE_URL` para esse banco e execute `node --import tsx --test apps/api/test/password-postgres.test.cjs` na raiz.

## Build e preview

Na raiz:

```powershell
npm run build -w apps/api
npm run build -w apps/painel
```

A API gera `apps/api/dist`; o painel gera `apps/painel/dist` depois da checagem TypeScript. O build Nest limpa sua pasta de saída conforme `nest-cli.json`; não guarde arquivos manuais em `dist`.

```powershell
npm run start:prod -w apps/api
npm run preview -w apps/painel
```

`start:prod` executa o código compilado; não define `NODE_ENV=production` por si só. `preview` serve o build local do Vite, normalmente na porta 4173, mas não deve ser usado como substituto de hospedagem. O proxy explicitamente configurado no projeto está em `server.proxy`; antes de usar preview com API, confira o comportamento/configuração de preview e a origem autorizada. Para o fluxo local suportado neste guia, prefira `dev` na porta 5173.

## Testes e qualidade

Também estão disponíveis na raiz: `npm run build` (API e painel), `npm run test:api`, `npm run test:e2e` e `npm run test:web`. O último encaminha ao pacote isolado `apps/web/tests`; instalar dependências na raiz não instala as ferramentas desse pacote.

`npm run check` executa `format:check`, `typecheck` e `lint:check`, sem correções, serviços ou banco. Para na primeira falha. Na Tarefa 05, dois documentos históricos apresentaram formatação pendente; TypeScript e ESLint passaram separadamente. Consulte os [comandos e resultados no README](../README.md#comandos-padronizados-na-raiz).

Depois de instalar dependências e gerar o Prisma Client, na raiz:

```powershell
# Unitários da API
npm test -w apps/api -- --runInBand

# E2E HTTP com Prisma controlado, sem banco real ou .env
npm run test:e2e -w apps/api -- --runInBand

# Cobertura dos unitários; gera apps/api/coverage
npm run test:cov -w apps/api -- --runInBand

# Formatação: somente verifica
npm run "format: check"
```

Os E2E atuais usam os controllers/serviços/guards reais de saúde, autenticação, usuários e usinas; substituem Prisma por mocks e não importam AppModule nem SyncScheduler. Testam disponibilidade/indisponibilidade simulada do banco, cookie, login, `/me`, logout e perfis. Não medem integração PostgreSQL, CORS completo ou implantação. O script inclui `--experimental-vm-modules`; o aviso experimental é esperado com o runtime validado.

Na Tarefa 03 passaram 31 E2E e 26 unitários, em Node 24.22.3. O documento `DIAGNOSTICO_VALIDACAO.md` registra a auditoria anterior a essa correção e não descreve o E2E atual.

ESLint API **sem correção**, na raiz:

```powershell
Set-Location apps/api
node ../../node_modules/eslint/bin/eslint.js "{src,apps,libs,test}/**/*.ts" --no-fix
Set-Location ../..
```

Não usar `npm run lint -w apps/api` em auditoria de leitura: contém `--fix`. Da mesma forma, `npm run format` e os scripts `format` dos workspaces escrevem arquivos. Não há script de lint/testes do painel React; seu `build` inclui `tsc --noEmit`.

### Testes HTML com Edge instalado

Na raiz:

```powershell
Set-Location apps/web/tests
npm ci
$env:BROWSER_CHANNEL = 'msedge'
npm test
Remove-Item Env:BROWSER_CHANNEL
Set-Location ../../..
```

Alternativa com Chromium gerenciado pelo Playwright: após `npm ci`, execute `npx --no-install playwright install chromium`, deixe `BROWSER_CHANNEL` ausente e rode `npm test`. O download do navegador exige rede e espaço; o comando não instala dependências do projeto inteiro.

A suíte cria servidor temporário e contextos isolados, sem modificar o perfil pessoal do navegador nem usar API/banco. Seis casos cobrem os fluxos legados, conflitos/erros de armazenamento e reflow; não há integração automática dos dados antigos no React.

## Executar apenas o protótipo HTML

Com Python 3, sem precisar de API/PostgreSQL:

```powershell
py -3 -m http.server 5174 --bind 127.0.0.1 --directory apps/web
```

Abra [http://127.0.0.1:5174/paginas/login.html](http://127.0.0.1:5174/paginas/login.html). A porta 5174 evita competir com o Vite. **Se seus cadastros estavam na porta 5173 ou em localhost, esse novo endereço não os mostrará**. Para reencontrá-los, use exatamente a origem/perfil anterior; pare o React se precisar reutilizar a porta.

Os dados ficam em `solaris.plants.v1`; a preferência de e-mail em `solarsystem.rememberedEmail`. Não limpar localStorage para solucionar problemas. O CSV é um resumo filtrado, não backup completo. Leia a [estratégia de preservação](ESTRATEGIA_FRONTEND.md) antes de transferir qualquer cadastro.

## Problemas comuns

| Sintoma                           | Conferir/solução                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `node`/`npm` não reconhecido      | Instalação/PATH; reabrir terminal; conferir Node 26 e npm                                            |
| `npm.ps1` bloqueado               | Usar `npm.cmd`; não desativar políticas globalmente                                                  |
| `EBADENGINE`                      | Versão efetiva do Node e `.nvmrc`; mínimo da raiz ainda não expressa todos os requisitos             |
| `npm ci` acusa divergência        | Conferir branch, manifestos e lockfile; não apagar lockfile para esconder o problema                 |
| Prisma Client não gerado          | `npm run db:generate -w apps/api`; conferir instalação concluída                                     |
| Variáveis de ambiente inválidas   | Preencher `.env`, especialmente DATABASE_URL/JWT_SECRET; reiniciar API                               |
| Conexão/senha PostgreSQL falha    | Instância, serviço, host, porta 5432/5433, usuário e senha codificada na URL                         |
| Migration pede reset              | Interromper; conferir banco/histórico e backup. Instalação usa `db:deploy`, não reset                |
| Login 401                         | Verificar usuário ativo, e-mail e senha no banco correto; repetir seed não redefine senha existente  |
| `/auth/me` 401 ao abrir login     | Sem sessão é esperado; se persistir após login, conferir cookie, host e HTTPS/NODE_ENV               |
| 403                               | Perfil sem permissão; não remover guards para contornar                                              |
| `/` da API retorna 404            | Usar `/api/health`; frontend é servido separadamente pelo Vite                                       |
| Painel vazio                      | Não há usinas sincronizadas/visíveis ao perfil; seed cria apenas administrador                       |
| API indisponível/proxy falha      | API iniciada em 3333 e destino em `vite.config.ts`; conferir terminais                               |
| `EADDRINUSE`/Vite usa 5174        | Processo já usa a porta; encerrar instância conhecida ou alinhar configuração, sem confundir origens |
| E2E acusa ESM                     | Usar `npm run test:e2e -w apps/api`, que inclui VM Modules, e runtime compatível                     |
| Playwright não encontra navegador | Usar Edge com `BROWSER_CHANNEL=msedge` ou instalar Chromium da versão local do Playwright            |
| Cadastros legados desapareceram   | Conferir perfil, esquema, hostname e porta originais; não restaurar apagando dados                   |
| Caracteres estranhos              | Arquivos em UTF-8; conferir encoding do terminal/editor antes de regravar fontes                     |

## Referências do projeto

- [README](../README.md).
- [ADR do monorepo](adr/0001-monorepo-com-npm-workspaces.md).
- [ADR do backend](adr/0002-arquitetura-do-back-end.md).
- [Estratégia frontend](ESTRATEGIA_FRONTEND.md).
- [Auditoria histórica da Tarefa 02](DIAGNOSTICO_VALIDACAO.md).

Os exemplos foram conferidos contra os scripts e configurações do checkout. Não foi executada uma instalação completa de Windows/PostgreSQL, migrations, seed ou publicação durante a Tarefa 04.
