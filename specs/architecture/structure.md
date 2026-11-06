# Структура репозитория

Где что лежит в репозитории новой платформы. Технологии — в [tech-stack.md](tech-stack.md).

## Корень

```
ai/                 агенты, правила, workflow и шаблоны для ИИ — см. specs/guides/ai-agents.md
specs/              вся документация и спецификации платформы
api/                контракты: OpenAPI и .proto
server/             backend: микросервисы и общие пакеты
web/                frontend: микрофронтенды и общие пакеты
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
CLAUDE.md           ссылка на AGENTS.md
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
    <name>.yaml           внешний API, который отдаёт API Gateway
  proto/
    <service>/v1/*.proto  gRPC-контракты сервисов, версионируются по каталогу
```

- Контракты — источник правды. Код сервисов и клиенты frontend генерируются из них, а не наоборот.
- Контракты меняет архитектор, разработчики их только реализуют.
- Сгенерированный код в `api/` не кладётся: он генерируется в пакеты потребителей.

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
  vitest.config.ts
  Dockerfile
  package.json
```

```jsonc
// tsconfig.json
{ "extends": "@platform/server-tooling/tsconfig/service.json", "include": ["src", "test", "vitest.config.ts"] }
// tsconfig.build.json
{ "extends": "@platform/server-tooling/tsconfig/build.json" }
// vitest.config.ts
import { defineTestConfig } from '@platform/server-tooling/vitest'
export default defineTestConfig()
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
| `contracts` | код, сгенерированный из `api/proto/` |
| `config` | чтение и проверка конфигурации из переменных окружения |
| `logger` | настроенный pino |
| `observability` | OpenTelemetry: метрики и трассировки |
| `health` | live и ready для HTTP и `grpc.health.v1` |
| `feature-flags` | клиент Unleash |
| `queue` | общая настройка BullMQ |
| `testing` | помощники для тестов |
| `tooling` | пресеты TypeScript (`service`, `build`, `lib`) и Vitest со SWC для декораторов NestJS |

В общие пакеты не кладётся бизнес-логика: она живёт в сервисах.

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
    routes/               маршруты TanStack Router
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

`defineAppConfig` подключает React, Vanilla Extract и Module Federation. Библиотеки `react`, `react-dom`, `@tanstack/react-router`, `@tanstack/react-query` и `@tanstack/react-store` хост и микрофронтенды делят в одном экземпляре, поэтому каждое приложение ставит их у себя.

Подробная структура внутри `src/` — в `ai/rules/frontend.md`.

### Общие пакеты `web/packages/`

| Пакет | Что в нём |
|---|---|
| `design-system` | токены и компоненты на Vanilla Extract |
| `api-client` | клиент и типы, сгенерированные из `api/openapi/` |
| `feature-flags` | клиент Unleash для React |
| `observability` | Grafana Faro |
| `config` | пресеты TypeScript (`app`, `lib`), Vite и Vitest с jsdom и Testing Library |

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
