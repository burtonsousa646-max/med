# Frontend

Как писать код web-приложений и общих пакетов. Правило для frontend-разработчика и архитектора. Принципы архитектуры — `ai/rules/architecture.md`, контракты — `ai/rules/api-contracts.md`, тесты — `ai/rules/testing.md`, безопасность — `ai/rules/security.md`.

## Стек

React, TypeScript, Vite, TanStack Router, TanStack Query, TanStack Store, Vanilla Extract, Module Federation. Подробно — `specs/architecture/tech-stack.md`. Зависимости, которых нет в стеке, добавляются только через ADR.

## Термины

| Термин | Что это |
|---|---|
| **web-приложение** | отдельный продукт для своих пользователей: кабинет партнёра, бэкофис. У каждого — свой файл OpenAPI `api/openapi/<app>.yaml` и свой экземпляр клиента API |
| **host** | оболочка web-приложения в Module Federation. Открывается первым, инициализирует общие провайдеры приложения и загружает module |
| **module** | функциональная часть web-приложения в Module Federation: отдельная сборка, которую загружает host. Например, кампании, баланс, документы |

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
- Module отдаёт через Module Federation корневой компонент; что именно и как его маршруты встраиваются в host — решение ADR, открытый вопрос в `specs/architecture/tech-stack.md`.

### Общие правила

- Общее для нескольких web-приложений — в пакетах `web/packages/`, а не копированием.
- Пакеты, через которые host передаёт module контекст — React, TanStack, `@platform/api-client`, — загружаются в одном экземпляре: список — в пресете `@platform/web-config/vite`.
- Маршрут в `routes/` собирает экран из компонентов и не содержит логики сверх загрузки данных и параметров.

## Имена

- Компоненты — PascalCase, файл совпадает с именем: `CampaignCard.tsx`.
- Хуки — `useXxx`, файл `useXxx.ts`.
- Стили — рядом с компонентом: `CampaignCard.css.ts`.
- Тесты — рядом с кодом: модульные — `CampaignCard.test.tsx`, визуальные — `CampaignCard.visual.tsx`.
- Экспорт — именованный. Экспорт по умолчанию — только там, где его требует инструмент.

## Компоненты

- Функциональные компоненты, пропсы описаны типом `<Name>Props`.
- Компонент делает одно дело. Компонент длиннее ~150 строк — повод разделить.
- Логика, не связанная с отображением, — в хуках и чистых функциях `model/`, а не в теле компонента.
- Списки — с устойчивым `key` из данных, не из индекса.
- `components/` host — общие компоненты приложения; `components/` module — компоненты этого module.

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

- Флаги — только через `@platform/feature-flags`; провайдер подключает host.
- Проверка флага — в одном месте на экран или module, а не в каждом компоненте.
- Код старого поведения удаляется вместе с флагом.

## Сборка

- Настройка Vite host и module — только через `defineAppConfig` из `@platform/web-config/vite`.
- Общие библиотеки в одном экземпляре — только из списка пресета; host и module ставят их у себя в `dependencies`.

## Команды

| Команда | Что делает |
|---|---|
| `pnpm --filter @platform/api generate` | генерация типов из OpenAPI |
| `pnpm --filter <пакет> typecheck` | проверка типов |
| `pnpm --filter <пакет> test` | модульные тесты |
| `pnpm --filter <пакет> test:visual` | визуальные тесты |
| `pnpm --filter <пакет> build` | сборка |
| `pnpm --filter @platform/api test:contract` | контрактные тесты |
| `pnpm lint` | линтер по всему репозиторию |

Пакеты: `@platform/<app>-host`, `@platform/<app>-<module>`.
