# Структура репозитория

Где что лежит в репозитории новой платформы. Технологии — в [tech-stack.md](tech-stack.md).

## Корень

```
ai/                 агенты, правила, workflow и шаблоны для ИИ — см. specs/guides/ai-agents.md
specs/              вся документация и спецификации платформы
api/                контракты: OpenAPI и .proto
server/             backend: микросервисы и общие пакеты
web/                frontend: микрофронтенды и общие пакеты
tests/              автотесты API и e2e — пишет тестировщик
deploy/             локальное окружение и инфраструктура: docker-compose, конфигурация зависимостей
prototype/          прототип, эталон поведения при переносе, не меняется
docs/               документация прототипа, не меняется
package.json        корень монорепо: общие скрипты и dev-зависимости
pnpm-workspace.yaml пакеты монорепо
commitlint.config.mjs правила сообщений коммитов — см. ai/rules/common.md
eslint.config.mjs   линтер для всего репозитория
prettier.config.mjs форматирование для всего репозитория
.editorconfig       базовые настройки редактора
.nvmrc              версия Node.js
AGENTS.md           точка входа для ИИ-агентов
CLAUDE.md           ссылка на AGENTS.md для Claude Code
GEMINI.md           ссылка на AGENTS.md для Gemini CLI
.claude/commands/   команды ролей для Claude Code — генерируются из ai/agents/
.agents/skills/     навыки ролей для Codex и Kimi Code — генерируются из ai/agents/
.gemini/commands/   команды ролей для Gemini CLI — генерируются из ai/agents/
```

## Монорепо

Менеджер пакетов — pnpm, монорепо — pnpm workspaces. Каждый сервис, приложение и общий пакет — отдельный пакет workspace со своим `package.json`.

```yaml
# pnpm-workspace.yaml
packages:
  - server/apps/*
  - server/shared/*
  - web/apps/*
  - web/packages/*
  - tests/*
  - api
```

- Зависимости ставятся только через pnpm; `npm` и `yarn` не используются, lock-файл один — `pnpm-lock.yaml` в корне.
- Общие пакеты подключаются как `workspace:*`.
- Задачи по пакетам запускаются средствами pnpm, отдельный оркестратор не используется: `pnpm -r <script>` — во всех пакетах, `pnpm --filter <package> <script>` — в одном пакете, `pnpm --filter "...[origin/main]" <script>` — только в изменённых пакетах и тех, кто от них зависит.
- Имена пакетов: `@platform/<name>` — например, `@platform/campaigns-service`, `@platform/design-system`.
- Install-скрипты зависимостей по умолчанию запрещены. Разрешённые перечислены в `allowBuilds` в `pnpm-workspace.yaml`, новые добавляются через `pnpm approve-builds <package>`.

### Команды из корня

| Команда | Что делает |
|---|---|
| `pnpm lint` / `pnpm lint:fix` | ESLint по всему репозиторию |
| `pnpm format` / `pnpm format:check` | Prettier по всему репозиторию, кроме Markdown |
| `pnpm typecheck` | проверка типов во всех пакетах |
| `pnpm test` | тесты во всех пакетах |
| `pnpm build` | сборка всех пакетов |
| `pnpm env:up` / `pnpm env:down` | локальное окружение из `deploy/` |

`typecheck`, `test` и `build` запускают одноимённые скрипты пакетов: каждый пакет должен их объявить.

### Общие настройки

- **ESLint и Prettier** — одни на весь репозиторий, в корне. Пакеты своих конфигов не заводят.
- **Markdown** Prettier не форматирует: выравнивание таблиц перерисовывает всю таблицу при правке одной ячейки.
- **TypeScript, Vite и Vitest** — пресеты в пакетах `@platform/web-config` и `@platform/server-tooling`. Пакет расширяет пресет, а не копирует настройки.
- Пресеты TypeScript самодостаточны и не ссылаются на файлы в корне: путь в `extends` разрешается через `node_modules`, и Vite не находит относительные пути за пределами пакета.

## `api/` — контракты

```
api/
  openapi/
    <name>.yaml                 внешний API, который отдаёт API Gateway
  proto/
    <service>/v1/*.proto        gRPC-контракты сервисов, версионируются по каталогу
  pacts/
    http/                       pact-файлы HTTP: микрофронтенд → api-gateway
    grpc/                       pact-файлы gRPC: api-gateway или сервис → сервис
  contract-tests/
    consumers/<consumer>/       тесты потребителей на Pact JS — создают pact-файлы
    providers/<provider>/       проверка поставщиков по pact-файлам
  redocly.yaml                  правила проверки OpenAPI
  buf.yaml                      модуль protobuf, правила проверки и поиска ломающих изменений
  buf.gen.yaml                  генерация кода из .proto в @platform/contracts
  scripts/contracts.mjs         команды lint, breaking, generate
  vitest.config.ts              контрактные тесты: contract-tests/**/*.pact.test.ts
  package.json                  @platform/api — пакет workspace
```

| Команда | Что делает |
|---|---|
| `pnpm --filter @platform/api lint` | Redocly — `api/openapi/*.yaml`, Buf — `api/proto/` |
| `pnpm --filter @platform/api breaking` | Buf ищет ломающие изменения `.proto` относительно `main`; другую базу задаёт `CONTRACTS_BASE` |
| `pnpm --filter @platform/api generate` | типы из OpenAPI — в `web/packages/api-client` и `server/apps/api-gateway`, код из `.proto` — в `server/shared/contracts` |
| `pnpm --filter @platform/api test:contract` | тесты потребителей и проверка поставщиков на Pact JS |

- Если контрактов или пакета-получателя ещё нет, команда пропускает этот шаг и сообщает об этом, а не падает.
- Файл контрактного теста — `*.pact.test.ts`. Тесты запускаются по одному файлу: тесты потребителей пишут pact-файлы, проверка поставщиков их читает.

- Контракты — источник правды. Код сервисов и клиенты frontend генерируются из них, а не наоборот.
- OpenAPI и `.proto` меняет архитектор, разработчики их только реализуют.
- Контрактные тесты пишут разработчики:
  - `consumers/<микрофронтенд>/` — frontend-разработчик;
  - `consumers/api-gateway/`, `consumers/<name>-service/` и `providers/` — backend-разработчик.
- Pact-файлы не правятся руками: их создают тесты потребителей. Pact-файлы коммитятся вместе с тестом, который их изменил.
- Сгенерированный из контрактов код в `api/` не кладётся: он генерируется в пакеты потребителей.
- Имя pact-файла: `<consumer>-<provider>.json`, например `cabinet-api-gateway.json`.

## `server/` — backend

```
server/
  apps/
    api-gateway/          единственная точка входа для frontend и внешних клиентов
    <name>-service/       микросервис
  shared/
    <package>/            общий пакет для сервисов
```

### Сервис

Каждый сервис устроен по чистой архитектуре: зависимости направлены только внутрь, от инфраструктуры к домену.

```
server/apps/<name>-service/
  src/
    domain/               сущности, объекты-значения, доменные события, правила; без NestJS, Prisma и gRPC
    application/          сценарии (use cases), порты — интерфейсы репозиториев и внешних систем
    infrastructure/       реализации портов: Prisma, BullMQ, gRPC-клиенты других сервисов, внешние системы
    presentation/         gRPC-контроллеры, обработчики очередей
    main.ts               запуск сервиса
  prisma/
    schema.prisma         схема своей базы
    migrations/           миграции своей базы
  test/                   интеграционные тесты
  tsconfig.json           проверка типов и линтер: src/, test/, конфиги
  tsconfig.build.json     сборка: только src/ без тестов
  vitest.config.ts        модульные тесты — скрипт test
  vitest.integration.config.ts  интеграционные тесты — скрипт test:integration
  Dockerfile
  package.json
```

```jsonc
// tsconfig.json
{ "extends": "@platform/server-tooling/tsconfig/service.json", "include": ["src", "test", "vitest.config.ts", "vitest.integration.config.ts"] }
// tsconfig.build.json
{ "extends": "@platform/server-tooling/tsconfig/build.json" }
// vitest.config.ts — src/**/*.spec.ts
import { defineTestConfig } from '@platform/server-tooling/vitest'
export default defineTestConfig()
// vitest.integration.config.ts — test/**/*.test.ts, файлы по одному
import { defineIntegrationTestConfig } from '@platform/server-tooling/vitest'
export default defineIntegrationTestConfig()
// package.json
"test": "vitest run", "test:integration": "vitest run --config vitest.integration.config.ts"
```

- Модульные тесты лежат рядом с кодом: `*.spec.ts`.
- У сервиса своя база, и описана она только в его `prisma/`. В чужую базу сервис не ходит.
- Наружу сервис отдаёт только gRPC и события. HTTP у сервиса — только health и метрики.

### API Gateway

```
server/apps/api-gateway/
  src/
    routes/               реализация операций из api/openapi/
    auth/                 проверка сессии, роли
    clients/              gRPC-клиенты сервисов
    main.ts
  Dockerfile
  package.json
```

Gateway не содержит бизнес-логики: он проверяет доступ, валидирует запрос по контракту, вызывает сервисы и собирает ответ.

### Общие пакеты `server/shared/`

| Пакет | Что в нём |
|---|---|
| `contracts` | интерфейсы gRPC, сгенерированные из `api/proto/`; `protoPath()` и `PROTO_LOADER_OPTIONS` для `@grpc/proto-loader` |
| `config` | чтение и проверка конфигурации из переменных окружения |
| `logger` | настроенный pino |
| `observability` | OpenTelemetry: метрики и трассировки |
| `health` | live и ready для HTTP и `grpc.health.v1` |
| `feature-flags` | клиент Unleash |
| `queue` | общая настройка BullMQ |
| `testing` | помощники для тестов |
| `tooling` | пресеты TypeScript (`service`, `build`, `lib`) и Vitest со SWC для декораторов NestJS: `defineTestConfig` — модульные, `defineIntegrationTestConfig` — интеграционные |

В общие пакеты не кладётся бизнес-логика: она живёт в сервисах.

**`@platform/contracts`**
- Импорт — по пути proto-файла: `@platform/contracts/campaigns/v1/campaigns`. Перед использованием пакет собирается: `pnpm --filter @platform/contracts build`, сборка копирует `api/proto/` в пакет.
- ts-proto в режиме NestJS генерирует только интерфейсы; сериализацию выполняет `@grpc/proto-loader` по `.proto` с опциями `PROTO_LOADER_OPTIONS`. Типы и данные совпадают: поля в camelCase, `int64` — строкой, перечисления — строками.
- Деньги приходят строкой копеек и переводятся в `bigint` на границе сервиса — в `presentation/` и gRPC-клиентах `infrastructure/grpc/`.

## `web/` — frontend

```
web/
  apps/
    shell/                хост Module Federation: вход, навигация, загрузка микрофронтендов
    <name>/               микрофронтенд — отдельное SPA
  packages/
    <package>/            общий пакет для приложений
  Dockerfile              один контейнер на весь frontend
```

### Приложение

```
web/apps/<name>/
  src/
    routes/               маршруты TanStack Router — файловый роутинг
    routeTree.gen.ts      дерево маршрутов — генерируется плагином роутера, руками не правится
    modules/              функциональные модули приложения
    components/           компоненты, общие для этого приложения
    store/                состояние TanStack Store
    main.tsx              точка монтирования
  index.html
  tsconfig.json
  vite.config.ts          настройка Module Federation
  vitest.config.ts
  package.json
```

```ts
// vite.config.ts
import { defineAppConfig } from '@platform/web-config/vite'
export default defineAppConfig({ name: 'cabinet', port: 5201, exposes: { './App': './src/App.tsx' } })
// vitest.config.ts
import { defineTestConfig } from '@platform/web-config/vitest'
export default defineTestConfig()
// tsconfig.json: { "extends": "@platform/web-config/tsconfig/app.json", "include": ["src", "vite.config.ts", "vitest.config.ts"] }
```

`defineAppConfig` подключает файловый роутинг TanStack Router с разбиением кода по маршрутам, React, Vanilla Extract и Module Federation. `defineTestConfig` — модульные тесты `src/**/*.test.{ts,tsx}`. Библиотеки `react`, `react-dom`, `@tanstack/react-router`, `@tanstack/react-query` и `@tanstack/react-store` хост и микрофронтенды делят в одном экземпляре, поэтому каждое приложение ставит их у себя.

Подробная структура внутри `src/` — в `ai/rules/frontend.md`.

### Общие пакеты `web/packages/`

| Пакет | Что в нём |
|---|---|
| `design-system` | токены и компоненты на Vanilla Extract |
| `api-client` | клиент на openapi-fetch: `createApi<paths>()`, `unwrap`, `ApiRequestError`; типы — в `src/generated/` из `api/openapi/` |
| `feature-flags` | клиент Unleash для React |
| `observability` | Grafana Faro |
| `config` | пресеты TypeScript (`app`, `lib`), Vite и Vitest с jsdom и Testing Library |

## `tests/` — автотесты и e2e

```
tests/
  api/                    автотесты API через API Gateway — Playwright, пакет @platform/api-tests
    specs/<NNN-slug>/     тесты фичи
    package.json
  e2e/                    сценарии пользователя — Playwright, пакет @platform/e2e
    specs/<NNN-slug>/     тесты фичи
    package.json
```

| Команда | Что делает |
|---|---|
| `pnpm --filter @platform/api-tests test` | автотесты API; адрес gateway — `API_URL` |
| `pnpm --filter @platform/e2e test` | e2e в Chromium; адрес frontend — `APP_URL` |
| `pnpm --filter @platform/e2e browsers` | поставить браузер для e2e — один раз |

- Повторов нет: нестабильный тест чинится, а не прячется за повтором.
- Отчёты Playwright — `test-results/` и `playwright-report/` — в git не попадают.

- Тесты сгруппированы по фичам: каталог совпадает с `specs/features/NNN-slug/`, в названии теста — номер `TC` из `test-plan.md`.
- Контрактные тесты и pact-файлы лежат в `api/`. Модульные, визуальные и интеграционные тесты — в пакетах, которые они проверяют.

## `deploy/` — окружение

```
deploy/
  docker-compose.yml      локальное окружение: PostgreSQL, Redis, Unleash
  .env.example            порты и доступы; копируется в deploy/.env
  postgres/init/          создание баз — по одной на сервис и для Unleash
  observability/          конфигурация стека наблюдаемости — после подтверждения раздела в tech-stack.md
  unleash/                начальные feature toggles — когда появятся первые
```

- PostgreSQL слушает порт 5433, чтобы не конфликтовать с локальным PostgreSQL прототипа.
- У каждого сервиса своя база в общем локальном PostgreSQL. Новая база добавляется в `postgres/init/01-databases.sql`; скрипт выполняется только при первом создании тома.

Dockerfile сервисов и frontend лежат рядом с их кодом, а не в `deploy/`.

## `prototype/` — прототип

Прототип целиком лежит в `prototype/` со своими `package.json`, миграциями и скриптами и запускается из этого каталога. Он не входит в workspace новой платформы.

| Что | Где |
|---|---|
| контракты | `prototype/api/` |
| сервер и воркер | `prototype/server/` |
| интерфейс | `prototype/web/` |
| схема базы | `prototype/migrations/` |
| выкладка стенда | `prototype/deploy/` |

Агенты читают файлы прототипа, но не меняют их. Ссылки на пути в `docs/` указаны относительно `prototype/`.

## Открытые вопросы

- **Список сервисов и приложений** — определяет архитектор при переносе фич.
