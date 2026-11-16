# SolarSystem

O softaware "SolarSystem" foi desenvolvido para centralizar o monitoramento de usinas fotovoltaicas de clientes de empresas do ramo de energia solar.

> Construção do projeto
[Roteiro](#roteiro).

## Funcionalidades

- Coleta de produção das usinas;
- Emissão de alarmes;
- Emissão de perda de rede Wi-Fi (ocorre quando o inversor perde a conexão com a rede Wi-Fi)
- ?

## Tecnologias

| Camada | Tecnologia |
| --- | --- |
| Linguagem | TypeScript |
| Back-end | Node.js · NestJS |
| Banco de dados | PostgreSQL |
| Front-end | React · Vite |

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
