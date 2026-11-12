---
feature: 001-feature-flags
title: Пакеты @platform/feature-flags для backend и web
status: approved
author: architect
requirements: —          # техническая фича: источник — ADR 0001, requirements.md нет
adr: [0001]
---

# Дизайн: пакеты @platform/feature-flags для backend и web

## Обзор

Техническая фича. В ней реализуются два общих пакета, через которые платформа работает с feature toggles по [ADR 0001](../../architecture/adr/0001-feature-toggles.md):

- `server/shared/feature-flags` — для сервисов и API Gateway;
- `web/packages/feature-flags` — для host и module web-приложений.

Требований аналитика нет, источник — ADR 0001 и разделы «`@platform/feature-flags`» в [structure.md](../../architecture/structure.md). Критерии готовности пакетов — в разделе [«Критерии готовности»](#критерии-готовности); задачи ссылаются на них номерами `K1…`. Сервисов, gateway и web-приложений пока нет, поэтому порт флагов в сервисе, маршрут `GET /v1/feature-flags` и подключение провайдера в host в эту фичу не входят. Они делаются вместе с первым сервисом, gateway и приложением.

## Затронутые части

| Часть | Пакет | Изменение |
|---|---|---|
| backend, общий пакет | `@platform/feature-flags` в `server/shared/feature-flags/` | новый |
| web, общий пакет | `@platform/feature-flags` в `web/packages/feature-flags/` | новый |

Пакеты называются одинаково, но лежат в разных частях workspace и не пересекаются: backend-пакет подключают только `server/*`, web-пакет — только `web/*`. Имя `@platform/feature-flags` дано обоим в `structure.md`. pnpm не допускает двух пакетов с одним именем в одном workspace, поэтому:

| Пакет | Имя в `package.json` |
|---|---|
| backend | `@platform/feature-flags` |
| web | `@platform/web-feature-flags` |

По тому же образцу уже названы `@platform/server-tooling` и `@platform/web-config`. Имя web-пакета уже исправлено архитектором вместе с этим дизайном в ADR 0001, `tech-stack.md`, `structure.md`, `ai/rules/`, роли frontend-разработчика, пресете Vite и ESLint.

## Пакет backend — `server/shared/feature-flags`

### Файлы

```
server/shared/feature-flags/
  src/
    config.ts                         readFeatureFlagsConfig(env) — чтение и проверка переменных окружения
    config.spec.ts
    feature-flags.client.ts           FeatureFlagsClient — обёртка над Unleash
    feature-flags.client.spec.ts
    feature-flags.module.ts           FeatureFlagsModule.forRoot / forTesting
    in-memory-feature-flags.ts        InMemoryFeatureFlags — для тестов сервисов
    in-memory-feature-flags.spec.ts
    cache.spec.ts                     кеш: память SDK и backup-файл при недоступном Unleash
    types.ts                          FlagContext, FeatureFlagsReader
    index.ts                          публичный API
  package.json
  tsconfig.json                       как в @platform/contracts: extends @platform/server-tooling/tsconfig/service.json
  tsconfig.build.json                 extends @platform/server-tooling/tsconfig/lib.json
  vitest.config.ts                    defineTestConfig() из @platform/server-tooling/vitest
```

### `package.json`

Устроен как `@platform/contracts`.

- **Скрипты:** `typecheck` — `tsc -p .`, `test` — `vitest run`, `build` — `tsc -p tsconfig.build.json`.
- **`exports`:** `"."` → `./dist/index.js` и `./dist/index.d.ts`.
- **`dependencies`:** `unleash-client` `^6.12.2`.
- **`peerDependencies`:** `@nestjs/common` `^12.4.0`.
- **`devDependencies`:**
  - `@nestjs/common`, `@nestjs/core`, `reflect-metadata`, `rxjs` — версии те же, что в `@platform/contracts`;
  - `@platform/server-tooling` `workspace:*`;
  - `@types/node`, `typescript`, `vitest`.

### Публичный API

```ts
/** Контекст вычисления флага — только идентификаторы из сессии. */
export interface FlagContext {
  userId?: string
  companyId?: string
}

/** То, что нужно сервису: синхронная проверка флага. Реализуют FeatureFlagsClient и InMemoryFeatureFlags. */
export interface FeatureFlagsReader {
  isEnabled(name: string, context?: FlagContext): boolean
}

export interface FeatureFlagsConfig {
  url: string               // UNLEASH_URL
  apiToken: string          // UNLEASH_API_TOKEN
  backupPath: string        // UNLEASH_BACKUP_PATH, по умолчанию os.tmpdir()
  refreshIntervalMs: number // UNLEASH_REFRESH_INTERVAL_MS, по умолчанию 15000
}
export function readFeatureFlagsConfig(env?: NodeJS.ProcessEnv): FeatureFlagsConfig

@Injectable()
export class FeatureFlagsClient implements FeatureFlagsReader, OnModuleDestroy { … }

@Module({})
export class FeatureFlagsModule {
  static forRoot(options: { appName: string }): DynamicModule
  static forTesting(enabled?: Record<string, boolean>): DynamicModule
}

export class InMemoryFeatureFlags implements FeatureFlagsReader {
  constructor(enabled?: Record<string, boolean>)
  isEnabled(name: string, context?: FlagContext): boolean
  set(name: string, enabled: boolean): void
}
```

### Поведение

**Конфигурация — `readFeatureFlagsConfig`**

- `UNLEASH_URL` обязателен и должен быть абсолютным URL `http` или `https`. `UNLEASH_API_TOKEN` обязателен и не пуст.
- `UNLEASH_REFRESH_INTERVAL_MS`, если задан, — целое число больше нуля.
- Ошибка — `Error` с текстом на русском, в тексте только имя переменной: `Переменная UNLEASH_API_TOKEN не задана`. Значение в текст не попадает: токен — секрет.
- Пакета `@platform/config` пока нет, поэтому переменные читает сам пакет. Когда `@platform/config` появится, чтение перейдёт в него отдельной задачей.

**Модуль — `FeatureFlagsModule.forRoot({ appName })`**

- Модуль глобальный (`global: true`): сервис подключает его один раз в корневом модуле.
- Провайдер `FeatureFlagsClient` создаётся фабрикой. Она читает конфигурацию через `readFeatureFlagsConfig()`: при неверной конфигурации сервис не стартует. Затем создаёт `new Unleash(…)` из `unleash-client` с параметрами:
  - `url`, `appName`;
  - `customHeaders: { Authorization: apiToken }`;
  - `refreshInterval: refreshIntervalMs`;
  - `backupPath`;
  - `disableMetrics: false`.
- Фабрика **не ждёт** синхронизации с Unleash: сервис стартует, даже если Unleash недоступен.
- Обработчики событий SDK обязательны. Без обработчика `error` SDK уронит процесс.
  - `error` и `warn` пишутся через `Logger` из `@nestjs/common` с контекстом `FeatureFlags` на уровне `warn`.
  - В сообщении только текст ошибки: без токена, заголовков и тела ответа.
  - Временно используется `Logger` из `@nestjs/common`: когда появится `@platform/logger` на `nestjs-pino`, эти записи пойдут через него без изменения кода пакета.
- `forTesting(enabled)` регистрирует `InMemoryFeatureFlags` под токеном `FeatureFlagsClient`, чтобы интеграционные тесты сервисов не ходили в Unleash.

**Проверка флага — `FeatureFlagsClient.isEnabled(name, context)`**

- Вызывает `unleash.isEnabled(name, { userId, properties: { companyId } }, false)`. Поля, которых нет в `context`, в контекст Unleash не передаются.
- Если флаг неизвестен или кеша ещё нет, возвращается `false`.
- `onModuleDestroy` вызывает `unleash.destroy()`.

**`InMemoryFeatureFlags`**

- Возвращает значение из словаря, по умолчанию `false`. `context` не учитывается.

**Кеш при недоступном Unleash**

- Кеш — это память SDK и backup-файл в `backupPath`; оба ведёт сам SDK. Пакет не пишет своего кеша, а только передаёт `backupPath` и проверяет поведение тестом `cache.spec.ts`.

### Тесты

Модульные, Vitest, файлы `*.spec.ts`. Сеть — только к локальному HTTP-серверу, который тест поднимает сам. Пауз нет, тест ждёт события SDK `synchronized`.

| Файл | Что проверяет | Критерий |
|---|---|---|
| `config.spec.ts` | значения по умолчанию; ошибка при отсутствии и неверном формате каждой переменной; токена нет в тексте ошибки | К1 |
| `feature-flags.client.spec.ts` | передача `userId` и `companyId` в контекст Unleash — на подменённом объекте SDK; `false` для неизвестного флага; `destroy` при остановке | К2 |
| `cache.spec.ts` | 1) локальный сервер отдаёт `GET /client/features` с флагом в положении «включён», клиент синхронизируется, флаг включён; 2) сервер остановлен — флаг по-прежнему включён (память); 3) новый клиент с тем же `backupPath` при остановленном сервере — флаг включён (backup); 4) новый клиент без backup при остановленном сервере — `false`; 5) недоступный сервер не роняет процесс (обработчик `error`) | К3 |
| `in-memory-feature-flags.spec.ts` | значения из словаря, `set`, `false` по умолчанию | К4 |

Формат ответа сервера в `cache.spec.ts` — как у Unleash 8 на `GET /api/client/features`: `{ "version": 2, "features": [{ "name": "…", "enabled": true, "strategies": [{ "name": "default", "constraints": [], "parameters": {} }] }] }`.

## Пакет web — `web/packages/feature-flags`

### Файлы

```
web/packages/feature-flags/
  src/
    context.ts                        контекст флагов — один на страницу
    FeatureFlagsProvider.tsx          провайдер host
    FeatureFlagsProvider.test.tsx
    FeatureFlagsTestProvider.tsx      провайдер для тестов
    useFeatureFlag.ts                 хук module
    useFeatureFlag.test.tsx
    index.ts                          публичный API
  package.json
  tsconfig.json                       как в @platform/api-client: extends @platform/web-config/tsconfig/lib.json
  vitest.config.ts                    defineTestConfig() из @platform/web-config/vitest
```

### `package.json`

Устроен как `@platform/api-client`.

- **Имя:** `@platform/web-feature-flags`.
- **Скрипты:** `typecheck` — `tsc -p .`, `test` — `vitest run`.
- **`exports`:** `"."` → `./src/index.ts`.
- **`dependencies`:** нет.
- **`peerDependencies`:** `react` `^19.3.1`, `@tanstack/react-query` `^5.107.1`.
- **`devDependencies`:**
  - `@platform/web-config` `workspace:*`;
  - `@tanstack/react-query`, `react`, `react-dom`, `@types/react`, `@types/react-dom`;
  - `@testing-library/react`, `typescript`, `vite`, `vitest` — версии как в `@platform/api-client`.

### Публичный API

```tsx
export const featureFlagsQueryKey: readonly ['feature-flags']

export interface FeatureFlagsProviderProps<Flags extends object> {
  /** Загрузка флагов от gateway: async (signal) => unwrap(await api.GET('/v1/feature-flags', { signal })) */
  load: (signal: AbortSignal) => Promise<Flags>
  /** Что показывать, пока флаги не пришли. По умолчанию — ничего. */
  fallback?: ReactNode
  children: ReactNode
}
export function FeatureFlagsProvider<Flags extends object>(props: FeatureFlagsProviderProps<Flags>): ReactNode

export interface FeatureFlagsTestProviderProps<Flags extends object> {
  flags: Partial<Record<keyof Flags & string, boolean>>
  children: ReactNode
}
export function FeatureFlagsTestProvider<Flags extends object>(props: FeatureFlagsTestProviderProps<Flags>): ReactNode

/** Флаг включён? Тип флагов — components['schemas']['FeatureFlags'] приложения. */
export function useFeatureFlag<Flags extends object>(name: keyof Flags & string): boolean
```

### Поведение

**`FeatureFlagsProvider`**

- Работает внутри `QueryClientProvider` host. Вызывает `useQuery` с параметрами:

  | Параметр | Значение |
  |---|---|
  | `queryKey` | `featureFlagsQueryKey` |
  | `queryFn` | `({ signal }) => load(signal)` |
  | `staleTime` | `60_000` |
  | `refetchInterval` | `60_000` |
  | `refetchOnWindowFocus` | `true` |
  | `retry` | `2` |

- Что показывает:

  | Состояние запроса | Что показывается |
  |---|---|
  | первый ответ ещё не пришёл, ошибки нет | `fallback` |
  | данные есть | `children`, флаги — из последнего успешного ответа; ошибка обновления их не сбрасывает |
  | первый запрос упал после повторов, данных нет | `children`, все флаги выключены |

- Значение контекста — словарь `имя → boolean`. В него попадают только свойства ответа со значением `true` или `false`.

**`useFeatureFlag(name)`**

- Возвращает `true` только для значения `true`. Отсутствующий флаг выключен.
- Без провайдера выше по дереву хук бросает `Error`: `Флаги не переданы: host должен подключить FeatureFlagsProvider выше по дереву`. Образец — `useApi` в `@platform/api-client`.

**`FeatureFlagsTestProvider`**

- Отдаёт `flags` в тот же контекст, без TanStack Query и сети.

**Контекст**

- Создаётся один раз в `context.ts`. Пакет входит в singletons пресета Vite, поэтому host и все module видят один и тот же контекст. Комментарий об этом — как в `@platform/api-client/src/context.tsx`.

### Тесты

Модульные: Vitest и Testing Library, файлы `*.test.tsx`. `load` подменяется функцией теста, сети нет. В каждом тесте свой `QueryClient`, и `retry` выключен через `defaultOptions` теста. Хуком `useFeatureFlag` пользуется тестовый компонент, а проверка идёт по тексту на экране.

| Файл | Что проверяет | Критерий |
|---|---|---|
| `FeatureFlagsProvider.test.tsx` | `fallback`, пока первый ответ не пришёл; `children` и флаги после ответа; при ошибке первого запроса — `children` и все флаги выключены; при ошибке обновления — прежние флаги; `load` получает `signal` | К5, К6 |
| `useFeatureFlag.test.tsx` | `true` и `false` по ответу; отсутствующий флаг — `false`; без провайдера — ошибка с текстом выше; `FeatureFlagsTestProvider` отдаёт флаги | К7 |

## Критерии готовности

| № | Критерий |
|---|---|
| К1 | backend: конфигурация читается из env и проверяется; неверная конфигурация — ошибка с именем переменной, без значения |
| К2 | backend: `FeatureFlagsClient.isEnabled` передаёт в Unleash только `userId` и `companyId`; неизвестный флаг — `false` |
| К3 | backend: при недоступном Unleash флаги отдаются из кеша (память, backup-файл); без кеша — `false`; сервис не падает и стартует без Unleash |
| К4 | backend: `InMemoryFeatureFlags` и `FeatureFlagsModule.forTesting` для тестов сервисов |
| К5 | web: `FeatureFlagsProvider` грузит флаги через `load` и TanStack Query, обновляет их, показывает `fallback` до первого ответа |
| К6 | web: ошибка обновления оставляет последние флаги; ошибка первой загрузки — все флаги выключены |
| К7 | web: `useFeatureFlag` и `FeatureFlagsTestProvider`; отсутствующий флаг — `false`; без провайдера — понятная ошибка |

## Взаимодействие

Не применимо: внешних вызовов, кроме SDK Unleash → Unleash, в фиче нет. Путь `браузер → gateway → Unleash` описан в ADR 0001 и появится вместе с gateway.

## Контракты

Не применимо: операция `getFeatureFlags` добавляется в OpenAPI вместе с первым web-приложением (ADR 0001). gRPC и событий фича не меняет.

**Ломающие изменения:** нет.

## Данные

Не применимо: баз данных у пакетов нет. Backup-файл SDK — кеш, а не данные платформы: его можно удалить без последствий.

## Согласованность и сбои

| Шаг | Сбой | Поведение |
|---|---|---|
| старт сервиса | Unleash недоступен | сервис стартует; флаги — из backup-файла, если он есть, иначе `false`; SDK повторяет запрос по `refreshIntervalMs` |
| обновление на backend | Unleash недоступен или ответил ошибкой | SDK оставляет последнее состояние в памяти; событие `error` пишется в лог на уровне `warn` |
| первая загрузка на web | gateway недоступен | после 2 повторов — все флаги выключены, приложение показывается |
| обновление на web | gateway недоступен | остаются последние полученные флаги |

## Feature toggles

Не применимо: фича сама реализует механизм флагов и поведение пользователя не меняет.

## Безопасность

- **Доступ:** токен Unleash есть только у backend и берётся из `UNLEASH_API_TOKEN`. В web-пакете токенов и адресов Unleash нет.
- **Изоляция компаний:** в контекст передаются только `userId` и `companyId`. Откуда они берутся — из сессии, через gateway, — решает вызывающий код, а не пакет.
- **Персональные данные:** нет. В логи не попадают токен, заголовки и тела ответов Unleash.
- **Зависимости:** `unleash-client` — новая зависимость по ADR 0001. Если при установке pnpm потребует разрешить install-скрипты, разработчик останавливается и сообщает: `allowBuilds` меняет архитектор.

## Наблюдаемость

- **Метрики:** SDK отправляет в Unleash статистику использования флагов (`disableMetrics: false`).
- **Логи:** ошибки и предупреждения SDK — `warn` с контекстом `FeatureFlags`.
- **Алерты:** не применимо до появления стека наблюдаемости.

## Риски и решения

- **Одинаковое имя двух пакетов в workspace.** Web-пакет называется `@platform/web-feature-flags`, документы и настройки обновлены вместе с дизайном.
- **Нет `@platform/config` и `@platform/logger`.** Пакет временно сам читает env и пишет через `Logger` из `@nestjs/common`. Переход — отдельными задачами, когда эти пакеты появятся.
- **`cache.spec.ts` зависит от формата ответа Unleash.** Формат зафиксирован в дизайне и проверен на Unleash 8.3.1 локального окружения.
