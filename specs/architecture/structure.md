# Структура репозитория

Где что лежит в репозитории новой платформы. Технологии — в [tech-stack.md](tech-stack.md).

## Корень

```
ai/                 агенты, правила, workflow и шаблоны для ИИ — см. specs/guides/ai-agents.md
specs/              вся документация и спецификации платформы
api/                контракты: OpenAPI и .proto
server/             backend: микросервисы и общие пакеты
web/                frontend: web-приложения — host и module — и общие пакеты
tests/              автотесты API и e2e — пишет тестировщик
deploy/             локальное окружение и инфраструктура: docker-compose, конфигурация зависимостей
prototype/          прототип — источник только CJM, не меняется
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
  - web/apps/*/host
  - web/apps/*/modules/*
  - web/packages/*
  - tests/*
  - api
```

- Зависимости ставятся только через pnpm; `npm` и `yarn` не используются, lock-файл один — `pnpm-lock.yaml` в корне.
- Общие пакеты подключаются как `workspace:*`.
- Задачи по пакетам запускаются средствами pnpm, отдельный оркестратор не используется: `pnpm -r <script>` — во всех пакетах, `pnpm --filter <package> <script>` — в одном пакете, `pnpm --filter "...[origin/develop]" <script>` — только в изменённых пакетах и тех, кто от них зависит.
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
| `pnpm env:up` / `pnpm env:down` | локальное окружение из `deploy/`; `env:up` ждёт готовности и заводит флаги |
| `pnpm env:flags` | завести в локальном Unleash флаги из `deploy/unleash/flags.json` |

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
    http/                       pact-файлы HTTP: web-приложение → api-gateway
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
| `pnpm --filter @platform/api breaking` | Buf ищет ломающие изменения `.proto` относительно `develop`; другую базу задаёт `CONTRACTS_BASE` |
| `pnpm --filter @platform/api generate` | типы из OpenAPI — в `web/packages/api-client` и `server/apps/api-gateway`, код из `.proto` — в `server/shared/contracts` |
| `pnpm --filter @platform/api test:contract` | тесты потребителей и проверка поставщиков на Pact JS |

- Если контрактов или пакета-получателя ещё нет, команда пропускает этот шаг и сообщает об этом, а не падает.
- Файл контрактного теста — `*.pact.test.ts`. Тесты запускаются по одному файлу: тесты потребителей пишут pact-файлы, проверка поставщиков их читает.

- Контракты — источник правды. Код сервисов и клиенты frontend генерируются из них, а не наоборот.
- OpenAPI и `.proto` меняет архитектор, разработчики их только реализуют.
- Контрактные тесты пишут разработчики:
  - `consumers/<app>/` — frontend-разработчик;
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
      feature-flags.ts    реестр флагов сервиса — если сервис проверяет флаги
    infrastructure/       реализации портов: Prisma, BullMQ, gRPC-клиенты других сервисов, внешние системы, флаги
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
    feature-flags/        GET /v1/feature-flags и реестр флагов, которые gateway проверяет сам
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
| `feature-flags` | клиент Unleash для сервисов и gateway: NestJS-модуль, кеш, фейк для тестов — см. ниже |
| `queue` | общая настройка BullMQ |
| `testing` | помощники для тестов |
| `tooling` | пресеты TypeScript (`service`, `build`, `lib`) и Vitest со SWC для декораторов NestJS: `defineTestConfig` — модульные, `defineIntegrationTestConfig` — интеграционные |

В общие пакеты не кладётся бизнес-логика: она живёт в сервисах.

**`@platform/feature-flags` — backend**

Решение — [ADR 0001](adr/0001-feature-toggles.md), стек и переменные окружения — [tech-stack.md](tech-stack.md#feature-toggles). SDK `unleash-client` используется только внутри пакета: импорт в другом месте запрещён линтером.

```ts
// API пакета
FeatureFlagsModule.forRoot({ appName: 'campaigns-service' })   // конфигурация из env через @platform/config
class FeatureFlagsClient { isEnabled(name: string, context?: FlagContext): boolean }   // синхронно, из кеша SDK
interface FlagContext { userId?: string; companyId?: string }
class InMemoryFeatureFlags { constructor(enabled?: Record<string, boolean>); isEnabled(…); set(name, enabled) }   // для тестов
```

- Модуль стартует, не дожидаясь Unleash. Кеш — память SDK и backup-файл в `UNLEASH_BACKUP_PATH`. Если нет ни Unleash, ни кеша, `isEnabled` возвращает `false`.
- Пакет не добавляет проверку Unleash в `/health/ready`.

Как сервис проверяет флаг:

```ts
// src/application/feature-flags.ts — реестр: имена флагов сервиса только здесь
export const FLAGS = {
  /**
   * Новый расчёт стоимости при запуске кампании.
   * @spec 004-campaign-launch
   * @task T3
   * @remove T9 — после полного включения на production
   */
  launchNewCheckout: 'campaigns.launch.new-checkout',
} as const
export type Flag = (typeof FLAGS)[keyof typeof FLAGS]

// src/application/ports/feature-flags.port.ts — порт сервиса
export interface FeatureFlags { isEnabled(flag: Flag, context: { userId?: string; companyId?: string }): boolean }
export const FEATURE_FLAGS = Symbol('FeatureFlags')

// src/infrastructure/feature-flags/unleash-feature-flags.ts — реализация порта через FeatureFlagsClient

// сценарий — одна точка ветвления
if (this.flags.isEnabled(FLAGS.launchNewCheckout, { userId, companyId })) { /* новое */ } else { /* старое */ }
```

- Контекст — пользователь и компания, которые gateway передал в gRPC metadata.
- Gateway: `GET /v1/feature-flags` берёт имена флагов из свойств схемы `FeatureFlags` в OpenAPI-документе приложения, вычисляет каждый с контекстом сессии и возвращает `{ "<флаг>": true | false }`. Отдельного списка флагов frontend в коде gateway нет. Сессия не обязательна.

**`@platform/contracts`**
- Импорт — по пути proto-файла: `@platform/contracts/campaigns/v1/campaigns`. Перед использованием пакет собирается: `pnpm --filter @platform/contracts build`, сборка копирует `api/proto/` в пакет.
- ts-proto в режиме NestJS генерирует только интерфейсы; сериализацию выполняет `@grpc/proto-loader` по `.proto` с опциями `PROTO_LOADER_OPTIONS`. Типы и данные совпадают: поля в camelCase, `int64` — строкой, перечисления — строками.
- Деньги приходят строкой копеек и переводятся в `bigint` на границе сервиса — в `presentation/` и gRPC-клиентах `infrastructure/grpc/`.

## `web/` — frontend

```
web/
  apps/
    <app>/                    web-приложение: кабинет партнёра, бэкофис …
      host/                   host — оболочка приложения в Module Federation
      modules/
        <module>/             module — функциональная часть приложения, отдельная сборка
  packages/
    <package>/                общий пакет для web-приложений
  Dockerfile                  один контейнер на весь frontend: host и module всех приложений
```

Термины:
- **web-приложение** — отдельный продукт для своих пользователей. У каждого свой файл OpenAPI `api/openapi/<app>.yaml` и один экземпляр клиента API; клиент ходит только в API Gateway.
- **host** — оболочка web-приложения, по одному на приложение. Инициализирует общее для приложения: клиент API, `QueryClient`, общий store, провайдер feature toggles и другие провайдеры, — и загружает module.
- **module** — функциональная часть web-приложения: кампании, баланс, документы. Получает клиент API, `QueryClient`, store и провайдеры от host и не создаёт своих.

Пакеты: `@platform/<app>-host`, `@platform/<app>-<module>`. Подробные правила — `ai/rules/frontend.md`.

### Host

```
web/apps/<app>/host/
  src/
    providers/                QueryClientProvider, ApiProvider, общий store, feature toggles, граница ошибок
    routes/                   маршруты host — файловый роутинг
    routeTree.gen.ts          дерево маршрутов — генерируется плагином роутера, руками не правится
    components/               общие компоненты приложения: оболочка, навигация, ошибки — у каждого stories
    store/                    общий store приложения
    api.ts                    единственный экземпляр клиента API приложения
    main.tsx                  точка монтирования
  index.html
  tsconfig.json
  vite.config.ts
  vitest.config.ts
  package.json
```

### Module

```
web/apps/<app>/modules/<module>/
  src/
    routes/                   маршруты module — файловый роутинг
    routeTree.gen.ts
    components/               компоненты module — у каждого stories
    hooks/
    api/                      запросы и мутации TanStack Query: keys.ts, <entity>Queries.ts, useXxxMutation.ts
    store/                    состояние module, если оно не общее
    model/                    типы и чистые функции
  tsconfig.json
  vite.config.ts
  vitest.config.ts
  package.json
```

```ts
// host: src/api.ts
import { createApi } from '@platform/api-client'
import type { paths } from '@platform/api-client/generated/cabinet'
export const api = createApi<paths>()

// module: где нужен клиент
import { useApi } from '@platform/api-client'
const api = useApi<paths>()

// vite.config.ts
import { defineAppConfig } from '@platform/web-config/vite'
export default defineAppConfig({ name: 'cabinet_campaigns', port: 5211, exposes: { './Module': './src/Module.tsx' } })
// vitest.config.ts
import { defineTestConfig } from '@platform/web-config/vitest'
export default defineTestConfig()
// tsconfig.json: { "extends": "@platform/web-config/tsconfig/app.json", "include": ["src", "vite.config.ts", "vitest.config.ts"] }
```

`defineAppConfig` подключает файловый роутинг TanStack Router с разбиением кода по маршрутам, React, Vanilla Extract и Module Federation. Библиотеки `react`, `react-dom`, `@tanstack/react-router`, `@tanstack/react-query`, `@tanstack/react-store` и `@platform/api-client` host и module делят в одном экземпляре: через них host передаёт module клиент API, store и провайдеры. Host и module ставят их у себя в `dependencies`.

Module встраивается в host через Module Federation: module отдаёт корневой компонент `./Module`, host подключает module как remote и показывает его на своём маршруте.

Компонент и его файлы лежат рядом:

```
components/CampaignCard/
  CampaignCard.tsx            компонент
  CampaignCard.css.ts         стили — Vanilla Extract
  CampaignCard.stories.tsx    stories — разработка в Storybook и визуальные тесты
  CampaignCard.test.tsx       модульные тесты
  snapshots/                  эталонные скриншоты stories: <имя экспорта story>.png
```

Компоненты разрабатываются в Storybook. Визуальные тесты: Playwright открывает каждую story собранного Storybook, снимает скриншот и сравнивает с эталоном в `snapshots/` папки компонента.

Настройки Storybook и визуальных тестов в host и module — из пресетов `@platform/web-config`:

```
.storybook/main.ts            export default defineStorybookConfig()     — @platform/web-config/storybook
.storybook/preview.ts         export default preview                     — @platform/web-config/storybook/preview
playwright.visual.config.ts   export default defineVisualConfig()        — @platform/web-config/visual
tsconfig.json                 "include": ["src", ".storybook/*.ts", "playwright.visual.config.ts", …]
```

```jsonc
// package.json — скрипты
"storybook": "storybook dev -p 6006 --ci",
"test:visual": "storybook build --quiet -o storybook-static && platform-visual",
"test:visual:update": "storybook build --quiet -o storybook-static && platform-visual --update-snapshots"
// devDependencies: @platform/web-config, storybook, @storybook/react-vite, @playwright/test
```

- Сборка Storybook использует свою конфигурацию Vite — React и Vanilla Extract без Module Federation и роутера.
- Телеметрия Storybook выключена.
- `.storybook/*.ts` в `tsconfig.json` указывается шаблоном: каталог, начинающийся с точки, TypeScript сам не включает.
- Собранный Storybook (`storybook-static/`) и отчёты Playwright в git не попадают.

**Визуальные тесты запускаются в Docker** — одинаково на Mac и в CI. Отрисовка шрифтов на macOS и Linux отличается, поэтому эталоны снимаются и сравниваются только в официальном образе Playwright `mcr.microsoft.com/playwright:v<версия @playwright/test>-noble`.

- `platform-visual` — команда из `@platform/web-config`: запускает Playwright в образе, монтируя репозиторий по тому же пути.
- Storybook собирается на машине: статическая сборка от платформы не зависит, а `node_modules` с macOS в Linux-контейнере не запускаются.
- На Mac нужен запущенный Docker Desktop. В CI — Docker, либо job запускается прямо в образе Playwright с `VISUAL_DOCKER=0`.
- `platform-visual --dry-run` показывает команду `docker run`, не запуская её.

### Общие пакеты `web/packages/`

| Пакет | Что в нём |
|---|---|
| `design-system` | токены и компоненты на Vanilla Extract — пока вне рамок |
| `api-client` | клиент на openapi-fetch: `createApi<paths>()` для host, `ApiProvider` и `useApi<paths>()` для module, `unwrap`, `ApiRequestError`; типы — `@platform/api-client/generated/<app>` из `api/openapi/<app>.yaml` |
| `feature-flags` | `@platform/web-feature-flags` — флаги для React: `FeatureFlagsProvider` для host, `useFeatureFlag` для module, тестовый провайдер — см. ниже |
| `observability` | Grafana Faro |
| `config` | пресеты TypeScript (`app`, `lib`), Vite и Vitest с jsdom и Testing Library |

**`@platform/web-feature-flags` — web**

SDK Unleash в браузере нет: флаги приходят от gateway операцией `getFeatureFlags` из `api/openapi/<app>.yaml`. Тип флагов — схема `FeatureFlags` из сгенерированных типов приложения. Пакет входит в singletons пресета Vite, поэтому host и module ставят его у себя в `dependencies`. Пакет создаётся раньше первого web-приложения: без него сборка по пресету не находит singleton.

```tsx
// host: src/providers/AppProviders.tsx — внутри QueryClientProvider
<FeatureFlagsProvider load={async (signal) => unwrap(await api.GET('/v1/feature-flags', { signal }))} fallback={<AppSkeleton />}>
  …
</FeatureFlagsProvider>
// host: после входа и выхода — перезапросить флаги
queryClient.invalidateQueries({ queryKey: featureFlagsQueryKey })

// module: src/model/featureFlags.ts — реестр флагов module
import type { components } from '@platform/api-client/generated/cabinet'
export type FeatureFlags = components['schemas']['FeatureFlags']
export const FLAGS = {
  /**
   * @spec 004-campaign-launch
   * @task T5
   * @remove T9
   */
  newCheckout: 'campaigns.launch.new-checkout',
} as const satisfies Record<string, keyof FeatureFlags>

// module: маршрут или вход в экран — одна точка ветвления
const newCheckout = useFeatureFlag<FeatureFlags>(FLAGS.newCheckout)

// тесты
<FeatureFlagsTestProvider flags={{ 'campaigns.launch.new-checkout': true }}>…</FeatureFlagsTestProvider>
```

- Провайдер грузит флаги через TanStack Query (`featureFlagsQueryKey`): обновляет их раз в минуту и при возврате на вкладку. Ошибка обновления оставляет последние полученные флаги.
- Пока флаги не пришли, провайдер показывает `fallback`, а не старое поведение: так экран не мигает. Если первый запрос упал, все флаги выключены.
- Флаг, которого нет в ответе, выключен.
- Компоненты из `components/` флаги не читают: вариант поведения приходит им через props, поэтому stories и визуальные тесты покрывают оба варианта без провайдера.

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
  unleash/
    flags.json            флаги локального окружения — добавляет архитектор вместе с design.md
    seed.mjs              заводит флаги из flags.json в Unleash — pnpm env:flags
```

- PostgreSQL слушает порт 5433, чтобы не конфликтовать с локальным PostgreSQL прототипа.
- У каждого сервиса своя база в общем локальном PostgreSQL. Новая база добавляется в `postgres/init/01-databases.sql`; скрипт выполняется только при первом создании тома.

- **Unleash** — `http://localhost:4242`, вход `admin` / `unleash4all` — только локально. При первом старте Unleash создаёт токены из `deploy/.env`: backend-токен `UNLEASH_API_TOKEN` для сервисов и gateway, admin-токен `UNLEASH_ADMIN_TOKEN` для `seed.mjs` и автотестов.
- **Флаги** заводит `pnpm env:flags` (его вызывает и `pnpm env:up`). Скрипт идемпотентен: новый флаг создаётся выключенным, со стратегией «всем» в окружении `development`, а положение существующего не меняется — его переключают в админке. Флаг, которого нет в `flags.json`, не удаляется, но скрипт о нём предупреждает.

```json
{ "name": "campaigns.launch.new-checkout", "type": "release", "description": "Новый расчёт стоимости при запуске кампании.", "spec": "004-campaign-launch" }
```

Dockerfile сервисов и frontend лежат рядом с их кодом, а не в `deploy/`.

## `prototype/` — прототип

Прототип целиком лежит в `prototype/` и запускается из этого каталога: `cd prototype && npm install && npm run dev`. Он не входит в workspace новой платформы.

Из прототипа берётся только CJM — путь пользователя. Его техническая реализация не изучается и не переносится: архитектура, код и данные платформы проектируются с нуля — `ai/rules/sdd.md`, раздел «Прототип: только CJM». Прототип и `docs/` не меняются.

## Открытые вопросы

- **Список сервисов и приложений** — определяет архитектор при переносе фич.
