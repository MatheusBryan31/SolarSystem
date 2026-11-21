# SolarSystem

O software "SolarSystem" centraliza o monitoramento de usinas fotovoltaicas de clientes de empresas do ramo de energia solar.

> Construção do projeto
> [Roteiro](#roteiro).

## Funcionalidades (planejadas)

- Coleta automática dos dados de várias plataformas (Sungrow, Growatt, Huawei, Deye/Solarman e GoodWe) em um só lugar
- Painel com potência atual, energia gerada (dia, mês e total), economia estimada em R$ e CO₂ evitado
- Alertas de usina sem comunicação (ex.: inversor desconectado do Wi-Fi), falha no inversor, geração zerada em horário de sol e desempenho abaixo das outras usinas
- Avisos por e-mail quando um alerta é aberto ou resolvido
- Cadastro de clientes e vínculo de cada usina ao seu dono
- Portal do cliente: cada cliente vê apenas as próprias usinas

## Tecnologias

| Camada         | Tecnologia       |
| -------------- | ---------------- |
| Linguagem      | TypeScript       |
| Back-end       | Node.js · NestJS |
| Banco de dados | PostgreSQL       |
| Front-end      | React · Vite     |

## Como rodar

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
    cd caminhodoexplorer
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

5. **Rodar:**

    ```bash
    npm run start:dev -w apps/api
    ```

    Verifique em <http://localhost:3333/api/health>.

### Scripts principais

| Comando | Descrição |
| --- | --- |
| `npm run start:dev -w apps/api` | API em modo desenvolvimento |
| `npm run test -w apps/api` | Testes da API |
| `npm run db:migrate -w apps/api -- --name x` | Nova migration (desenvolvimento) |
| `npm run db:studio -w apps/api` | Painel visual do banco |
| `npm run format` | Formata o código |

## Roteiro

- [x] Ambiente de desenvolvimento
- [x] Estrutura do monorepo
- [x] Documentação inicial
- [ ] Back-end
- [ ] Front-end
- [ ] Testes e CI
- [ ] Publicação







?## Documentação

- [Decisões de arquitetura](docs/adr/)
