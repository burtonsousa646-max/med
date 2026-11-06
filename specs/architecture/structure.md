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
  Dockerfile
  package.json
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
  vite.config.ts          настройка Module Federation
  package.json
```

Подробная структура внутри `src/` — в `ai/rules/frontend.md`.

### Общие пакеты `web/packages/`

| Пакет | Что в нём |
|---|---|
| `design-system` | токены и компоненты на Vanilla Extract |
| `api-client` | клиент и типы, сгенерированные из `api/openapi/` |
| `feature-flags` | клиент Unleash для React |
| `observability` | Grafana Faro |
| `config` | общие настройки ESLint, Prettier, TypeScript, Vite и Vitest |

## `deploy/` — окружение

```
deploy/
  docker-compose.yml      локальное окружение: базы сервисов, Redis, Unleash, стек наблюдаемости
  postgres/               инициализация баз — по одной на сервис
  observability/          конфигурация Alloy, Prometheus, Loki, Tempo, Grafana и Alertmanager
  unleash/                начальные feature toggles
```

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
