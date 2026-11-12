# Frontend

Как писать код web-приложений и общих пакетов. Правило для frontend-разработчика и архитектора. Принципы архитектуры — `ai/rules/architecture.md`, контракты — `ai/rules/api-contracts.md`, тесты — `ai/rules/testing.md`, безопасность — `ai/rules/security.md`.

## Стек

React, TypeScript, Vite, TanStack Router, TanStack Query, TanStack Store, Vanilla Extract, Module Federation, Storybook. Подробно — `specs/architecture/tech-stack.md`. Зависимости, которых нет в стеке, добавляются только через ADR.

## Термины

| Термин | Что это |
|---|---|
| **web-приложение** | отдельный продукт для своих пользователей: кабинет партнёра, бэкофис. У каждого — свой файл OpenAPI `api/openapi/<app>.yaml` и свой экземпляр клиента API |
| **host** | оболочка web-приложения в Module Federation. Открывается первым, инициализирует общие провайдеры приложения и загружает module |
| **module** | функциональная часть web-приложения: отдельная сборка, которую host загружает через Module Federation. Например, кампании, баланс, документы |

У каждого web-приложения свой host и свои module.

## Структура web-приложения

```
web/apps/<app>/
  host/                         @platform/<app>-host
    src/
      providers/                общие провайдеры приложения
      routes/                   маршруты host: оболочка, вход, загрузка module
      components/               общие компоненты приложения: оболочка, навигация, ошибки
      store/                    общий store приложения — TanStack Store
      api.ts                    единственный экземпляр клиента API приложения
      main.tsx                  точка монтирования
  modules/
    <module>/                   @platform/<app>-<module>
      src/
        routes/                 маршруты module
        components/             компоненты module
        hooks/                  хуки module
        api/                    запросы и мутации TanStack Query
        store/                  состояние module, если оно не общее
        model/                  типы и чистые функции
```

### Host

Host инициализирует всё общее для приложения, один раз на приложение:

- **клиент API** — `src/api.ts`: `createApi<paths>()` с типами из `api/openapi/<app>.yaml`;
- **провайдеры** в `src/providers/`: `QueryClientProvider` с единственным `QueryClient`, `ApiProvider` с клиентом API, общий store, провайдер feature toggles, граница ошибок приложения;
- **оболочку** — вход, навигацию, общие компоненты и загрузку module.

Бизнес-экранов в host нет: они — в module.

### Module

- Module не создаёт свой клиент API, `QueryClient`, общий store и провайдеры: он получает их от host через провайдеры.
- Module не импортирует код host и других module. Связь — только через адрес (маршрут), провайдеры host и общие пакеты `web/packages/`.
- Module встраивается в host через Module Federation: module отдаёт корневой компонент `./Module`, host подключает module как remote и показывает его на своём маршруте.

### Общие правила

- Общее для нескольких web-приложений — в пакетах `web/packages/`, а не копированием.
- Пакеты, через которые host передаёт module контекст — React, TanStack, `@platform/api-client`, — загружаются в одном экземпляре: список — в пресете `@platform/web-config/vite`.
- Маршрут в `routes/` собирает экран из компонентов и не содержит логики сверх загрузки данных и параметров.

## Имена

- Компоненты — PascalCase, каждый в своей папке, файл совпадает с именем: `components/CampaignCard/CampaignCard.tsx`.
- Хуки — `useXxx`, файл `useXxx.ts`.
- Стили — рядом с компонентом: `CampaignCard.css.ts`.
- Stories — рядом с компонентом: `CampaignCard.stories.tsx`.
- Модульные тесты — рядом с кодом: `CampaignCard.test.tsx`. Визуальные тесты отдельными файлами не пишутся: их источник — stories.
- Экспорт — именованный. Экспорт по умолчанию — только там, где его требует инструмент.

## Компоненты

- Функциональные компоненты, пропсы описаны типом `<Name>Props`.
- Компонент делает одно дело. Компонент длиннее ~150 строк — повод разделить.
- Логика, не связанная с отображением, — в хуках и чистых функциях `model/`, а не в теле компонента.
- Списки — с устойчивым `key` из данных, не из индекса.
- `components/` host — общие компоненты приложения; `components/` module — компоненты этого module.

## Storybook

Компоненты разрабатываются в Storybook.

- У каждого компонента в `components/` host и module есть stories — файл `<Component>.stories.tsx` рядом с компонентом.
- Stories покрывают все варианты и состояния компонента: данные, пусто, ошибка, загрузка, нет прав, длинные тексты.
- Данные в stories — фиксированные, из props; к API stories не обращаются.
- Каждая story — это и визуальный тест: Playwright снимает её скриншот и сравнивает с эталоном — `ai/rules/testing.md`, раздел «Визуальные тесты».
- Новый или изменённый компонент без stories — задача не готова.

## Данные с сервера

Запросы к API — через TanStack Query, а HTTP внутри него выполняет клиент openapi-fetch, типизированный по OpenAPI своего web-приложения.

| Слой | Что делает | Где |
|---|---|---|
| openapi-typescript | типы из `api/openapi/<app>.yaml` | `@platform/api-client/generated/<app>` — генерируется, руками не правится |
| openapi-fetch | выполняет запрос, проверяет путь, параметры и ответ по типам | только внутри `queryFn` и `mutationFn` |
| клиент API | один экземпляр на web-приложение | `src/api.ts` host, передаётся через `ApiProvider` |
| TanStack Query | кеш, загрузка, ошибки, повторы, отмена, инвалидация | `src/api/` module |
| компонент | показывает данные и вызывает мутации | `src/components/` |

- Клиент создаёт только host: `createApi<paths>()` в `src/api.ts`. Module получает его хуком `useApi<paths>()` из `@platform/api-client`. `fetch` напрямую, свои экземпляры клиента и самодельные клиенты запрещены.
- Клиент ходит только в API Gateway — в другие адреса frontend не обращается.
- Методы клиента `api.GET`, `api.POST` и другие вызываются только внутри `queryFn` и `mutationFn`.
- Результат запроса проходит через `unwrap`: ошибка из контракта `{ code, message }` становится исключением `ApiRequestError`, и TanStack Query переводит запрос в состояние ошибки.
- В `queryFn` передаётся `signal` из контекста, чтобы ненужный запрос отменялся.
- Серверное состояние — только в TanStack Query. В TanStack Store серверные данные не копируются.
- Запросы module — фабрики `queryOptions` в `src/api/<entity>Queries.ts`, клиент передаётся первым параметром: `campaignQuery(api, id)`.
- Мутации — хуки `useXxxMutation` в `src/api/`.
- Ключи запросов — из фабрики ключей `src/api/keys.ts`, а не строками по месту.
- После мутации в `onSuccess` инвалидируются запросы, которые она меняет.

```ts
// host: src/api.ts — единственный экземпляр клиента приложения
import { createApi } from '@platform/api-client'
import type { paths } from '@platform/api-client/generated/cabinet'
export const api = createApi<paths>()
// host: src/providers/AppProviders.tsx
<ApiProvider client={api}>…</ApiProvider>

// module: src/api/campaignQueries.ts
export const campaignQuery = (api: Client<paths>, campaignId: string) =>
  queryOptions({
    queryKey: campaignKeys.detail(campaignId),
    queryFn: async ({ signal }) =>
      unwrap(await api.GET('/v1/campaigns/{campaignId}', { params: { path: { campaignId } }, signal })),
  })

// module: src/components/CampaignScreen.tsx
const api = useApi<paths>()
const { data: campaign } = useSuspenseQuery(campaignQuery(api, campaignId))
```

- Деньги приходят строкой копеек: в рубли переводятся только для показа функциями из общего пакета, вычисления над деньгами на клиенте не делаются.
- Операции с `Idempotency-Key` получают ключ, созданный один раз на действие пользователя, а не на каждую попытку.

## Состояние

| Что | Где |
|---|---|
| данные с сервера | TanStack Query |
| параметры экрана: фильтры, вкладка, страница | параметры маршрута TanStack Router |
| состояние формы и компонента | `useState` в компоненте |
| состояние одного module | TanStack Store в `src/store/` module |
| состояние, общее для приложения | общий store host, передаётся через провайдер |

- Глобальное состояние — исключение: сначала маршрут, затем локальное состояние, затем store module, и только потом общий store.
- Подписка на store — через селектор, возвращающий только нужное компоненту.

## Маршруты

- Файловый роутинг TanStack Router в `src/routes/`.
- Параметры пути и поиска типизированы и валидируются в определении маршрута.
- Данные, без которых экран не имеет смысла, загружаются до показа экрана через TanStack Query.
- У каждого маршрута есть состояние загрузки и ошибки.

## Стили

- Только Vanilla Extract: файлы `*.css.ts` рядом с компонентом.
- Цвета, отступы, шрифты, радиусы, тени — только из токенов. Значения в коде вроде `#ff0000` или `13px` запрещены.
- Варианты компонента — через `recipe` или `styleVariants`, а не склейку классов по условиям.
- Динамические значения — через CSS-переменные и `assignInlineVars`; атрибут `style` с готовыми значениями запрещён.
- Адаптивность — через брейкпоинты из токенов.
- Дизайн-система пока вне рамок: где лежат токены и базовые компоненты — решение ADR.

## Состояния экрана

Каждый экран и каждый блок данных обрабатывает:
- загрузку — скелетон или индикатор;
- пустое состояние — с объяснением и действием, если оно есть;
- ошибку — понятный текст и возможность повторить;
- нет прав — отдельное сообщение, а не пустой экран.

Ошибка рендеринга перехватывается границей ошибок маршрута, а не роняет приложение.

## Доступность

- Семантические элементы: кнопка — `button`, ссылка — `a`, заголовки по порядку.
- У каждого поля ввода есть подпись, у каждой кнопки-иконки — доступное имя.
- Всё доступно с клавиатуры, фокус виден.
- Тесты ищут элементы по ролям и доступным именам — это заодно проверяет доступность.

## Тексты

- Все тексты для пользователя — на русском, в тоне продукта.
- Текст ошибки с сервера (`message`) показывается как есть; машинный `code` — только для логики.

## Feature toggles

Общие правила — `ai/rules/architecture.md`, раздел «Feature toggles», пример кода — `specs/architecture/structure.md`, раздел «`@platform/feature-flags` — web».

- **Флаги приходят только от gateway** — операцией `getFeatureFlags` из OpenAPI приложения. SDK Unleash в браузере нет.
- **Провайдер подключает host:** `FeatureFlagsProvider` в `src/providers/`, внутри `QueryClientProvider`. После входа и выхода host перезапрашивает флаги по `featureFlagsQueryKey`. Module своего провайдера не создаёт.
- **Код размечается только флагами из `design.md` и задачи.** Флаг, нужный frontend, должен быть в схеме `FeatureFlags` контракта. Если его там нет или он не описан в `design.md`, разработчик останавливается и спрашивает.
- **Реестр.** Флаг заводится в `src/model/featureFlags.ts` host или module, с JSDoc `@spec`, `@task`, `@remove`. Тип флагов — `components['schemas']['FeatureFlags']` из сгенерированных типов.
- **Одна точка ветвления.** Флаг читается хуком `useFeatureFlag<FeatureFlags>(FLAGS.x)` в маршруте или на входе в экран. Компоненты из `components/` флаги не читают: вариант поведения приходит через props.
- **Оба варианта компонента** покрываются stories, если компонент меняется под флагом.
- **Флаг, которого нет в ответе**, выключен. Старое поведение не меняется и удаляется только вместе с флагом.

## Сборка

- Настройка Vite host и module — только через `defineAppConfig` из `@platform/web-config/vite`.
- Общие библиотеки в одном экземпляре — только из списка пресета; host и module ставят их у себя в `dependencies`.

## Команды

| Команда | Что делает |
|---|---|
| `pnpm --filter @platform/api generate` | генерация типов из OpenAPI |
| `pnpm --filter <пакет> typecheck` | проверка типов |
| `pnpm --filter <пакет> test` | модульные тесты |
| `pnpm --filter <пакет> storybook` | Storybook для разработки компонентов |
| `pnpm --filter <пакет> test:visual` | визуальные тесты stories — Storybook + Playwright в Docker; нужен запущенный Docker |
| `pnpm --filter <пакет> test:visual:update` | обновить эталоны в `snapshots/` — только если изменение внешнего вида предусмотрено задачей |
| `pnpm --filter <пакет> build` | сборка |
| `pnpm --filter @platform/api test:contract` | контрактные тесты |
| `pnpm lint` | линтер по всему репозиторию |

Пакеты: `@platform/<app>-host`, `@platform/<app>-<module>`.
