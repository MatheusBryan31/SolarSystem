# SolarSystem

O software "SolarSystem" centraliza o monitoramento de usinas fotovoltaicas de clientes de empresas do ramo de energia solar.

> Construção do projeto
> [Roteiro](#roteiro).

## Funcionalidades planejadas para a plataforma

- Coleta automática dos dados de várias plataformas (Sungrow, Growatt, Huawei, Deye/Solarman e GoodWe) em um só lugar
- Painel com potência atual, energia gerada (dia, mês e total), economia estimada em R$ e CO₂ evitado
- Alertas de usina sem comunicação (ex.: inversor desconectado do Wi-Fi), falha no inversor, geração zerada em horário de sol e desempenho abaixo das outras usinas
- Avisos por e-mail quando um alerta é aberto ou resolvido
- Cadastro de clientes e vínculo de cada usina ao seu dono
- Portal do cliente: cada cliente vê apenas as próprias usinas

## Tecnologias

| Camada           | Tecnologia                |
| ---------------- | ------------------------- |
| Linguagem da API | TypeScript                |
| Back-end         | Node.js · NestJS          |
| Banco de dados   | PostgreSQL                |
| Front-end        | HTML5 · CSS3 · JavaScript |

## Executar o front-end

Na raiz do repositório, inicie um servidor estático com Python 3:

```sh
python -m http.server 5173 --bind 127.0.0.1 --directory apps/web
```

Abra [a tela de login](http://127.0.0.1:5173/paginas/login.html). No Windows com o Python Launcher, também funciona `py -m http.server 5173 --bind 127.0.0.1 --directory apps/web`. Para reencontrar os cadastros, use o mesmo navegador, endereço e porta.

| Situação               | Recursos do front-end                                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Disponíveis localmente | Cadastro e edição de usinas e inversores, remoção de inversores, consulta e atualização de alarmes, pesquisa, filtros e exportação dos cadastros filtrados em CSV.                      |
| Simulados              | Entrada com e-mail e senha fictícios, cadastro de conta, perfil de técnico, gráficos de produção e mapa esquemático. A simulação de login abre o painel sem autenticar ou criar sessão. |
| Integração futura      | Autenticação pela API, recuperação de senha, contas reais, notificações e telemetria dos inversores no painel.                                                                          |

Os cadastros ficam na chave `solaris.plants.v1`. A preferência “Lembrar e-mail” usa `solarsystem.rememberedEmail`. A senha é descartada. Na primeira visita, o painel exibe três usinas de exemplo. Em Configurações, a restauração acrescenta os exemplos ausentes, preservando os cadastros existentes. Dados ilegíveis bloqueiam gravações.

### Testes do front-end

Com Node.js 22.12+ e npm, instale as ferramentas isoladas de teste e execute a suíte:

```sh
cd apps/web/tests
npm ci
npx playwright install chromium
npm test
```

Os testes iniciam um servidor temporário e usam um perfil de navegador isolado. Para usar o Edge instalado, defina `BROWSER_CHANNEL=msedge` (no PowerShell, `$env:BROWSER_CHANNEL = 'msedge'`) antes de executar os testes.

## Executar a API

### Pré-requisitos

- Node.js 22.12 ou superior
- PostgreSQL 17
- Git

### Instalação

```bash
npm install
```

## Estrutura de pastas

```
├── apps/
│   ├── api/   # back-end
│   └── web/   # front-end
├── docs/      # documentação
└── package.json
```

## Instalação e preparação do ambiente

> Guia completo, com explicações e solução de problemas: **[docs/INSTALACAO.md](docs/INSTALACAO.md)**.

### Requisitos

- [Node.js](https://nodejs.org) 22.12+ (LTS)
- [Git](https://git-scm.com)
- [PostgreSQL](https://www.postgresql.org) 17
- [VS Code](https://code.visualstudio.com) (com as extensões do projeto)

### Caminho rápido

1. **Banco de dados** - no psql, como `postgres`:

   ```sql
   CREATE ROLE nome WITH LOGIN PASSWORD 'troque-esta-senha';
   CREATE DATABASE solarsystem OWNER nome;
   ALTER ROLE nome CREATEBD;
   ```

2. **Projeto:**

   ```bash
   git clone https://github.com/MatheusBryan31/SolarSystem.git
   cd SolarSystem
   npm install
   ```

3. **Configuração** - copie o modelo e preencha senha do banco, porta e `JWT_SECRET`:

   ```bash
   Copy-Item apps\api\.env.example apps\api\.env
   ```

4. **Tabelas e primeiro administrador:**

   ```bash
   npm run db:deploy -w apps/api
   npm run db:seed -w apps/api

   ```

5. **Rodar:**

   ```bash
   npm run start:dev -w apps/api
   ```

   Verifique em <http://localhost:3333/api/health>.

### Scripts principais

| Comando                                      | Descrição                        |
| -------------------------------------------- | -------------------------------- |
| `npm run start:dev -w apps/api`              | API em modo desenvolvimento      |
| `npm run test -w apps/api`                   | Testes da API                    |
| `npm run db:migrate -w apps/api -- --name x` | Nova migration (desenvolvimento) |
| `npm run db:studio -w apps/api`              | Painel visual do banco           |
| `npm run format`                             | Formata o código                 |

## Roteiro

- [x] Ambiente de desenvolvimento
- [x] Estrutura do monorepo
- [x] Documentação inicial
- [ ] Back-end
- [ ] Front-end
- [ ] Testes e CI
- [ ] Publicação

## Documentação

- [Decisões de arquitetura](docs/adr/)
