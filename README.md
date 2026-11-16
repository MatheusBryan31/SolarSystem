# SolarSystem

O software "SolarSystem" centraliza o monitoramento de usinas fotovoltaicas de clientes de empresas do ramo de energia solar.

> Construção do projeto
[Roteiro](#roteiro).

## Funcionalidades (planejadas)

- Coleta automática dos dados de várias plataformas (Sungrow, Growatt, Huawei, Deye/Solarman e GoodWe) em um só lugar
- Painel com potência atual, energia gerada (dia, mês e total), economia estimada em R$ e CO₂ evitado
- Alertas de usina sem comunicação (ex.: inversor desconectado do Wi-Fi), falha no inversor, geração zerada em horário de sol e desempenho abaixo das outras usinas
- Avisos por e-mail quando um alerta é aberto ou resolvido
- Cadastro de clientes e vínculo de cada usina ao seu dono
- Portal do cliente: cada cliente vê apenas as próprias usinas

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
