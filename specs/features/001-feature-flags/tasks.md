---
feature: 001-feature-flags
title: Пакеты @platform/feature-flags для backend и web
status: approved
author: architect
design: design.md
---

# Задачи: пакеты @platform/feature-flags для backend и web

Техническая фича: требований аналитика нет. Задачи закрывают критерии готовности `К1…К7` из [design.md](design.md#критерии-готовности). Задачи T1 и T2 не зависят друг от друга и могут идти параллельно.

## Покрытие критериев

| Критерий | Задачи |
|---|---|
| К1 | T1 |
| К2 | T1 |
| К3 | T1 |
| К4 | T1 |
| К5 | T2 |
| К6 | T2 |
| К7 | T2 |

## Задачи

### [ ] T1. Пакет флагов для backend

- **Исполнитель:** BE
- **Пакет:** `@platform/feature-flags` — `server/shared/feature-flags/`
- **Закрывает:** К1, К2, К3, К4
- **Зависит от:** —
- **Флаг:** —
- **Что сделать:** создать пакет по разделу «Пакет backend» в `design.md`:
  - файлы, `package.json`, `tsconfig.json`, `tsconfig.build.json` и `vitest.config.ts` — по образцу `@platform/contracts`;
  - `readFeatureFlagsConfig`, `FeatureFlagsClient`, `FeatureFlagsModule.forRoot` и `forTesting`, `InMemoryFeatureFlags`, типы `FlagContext` и `FeatureFlagsReader`, экспорт из `src/index.ts`;
  - обработчики событий `error` и `warn` SDK через `Logger` из `@nestjs/common`;
  - тесты из таблицы «Тесты» раздела backend, включая `cache.spec.ts` с локальным HTTP-сервером.
- **Готово, когда:**
  - проходят `pnpm --filter @platform/feature-flags typecheck`, `test` и `build`, а также `pnpm lint` и `pnpm format:check`;
  - `cache.spec.ts` подтверждает чтение флагов из памяти и из backup-файла при остановленном сервере и `false` без кеша.
- **Заметки:** —

### [ ] T2. Пакет флагов для web

- **Исполнитель:** FE
- **Пакет:** `@platform/web-feature-flags` — `web/packages/feature-flags/`
- **Закрывает:** К5, К6, К7
- **Зависит от:** —
- **Флаг:** —
- **Что сделать:** создать пакет по разделу «Пакет web» в `design.md`:
  - файлы, `package.json`, `tsconfig.json` и `vitest.config.ts` — по образцу `@platform/api-client`;
  - `featureFlagsQueryKey`, `FeatureFlagsProvider` с параметрами `useQuery` из дизайна, `useFeatureFlag`, `FeatureFlagsTestProvider`, общий контекст в `context.ts`, экспорт из `src/index.ts`;
  - тесты из таблицы «Тесты» раздела web.
- **Готово, когда:**
  - проходят `pnpm --filter @platform/web-feature-flags typecheck` и `test`, а также `pnpm lint` и `pnpm format:check`;
  - тесты подтверждают `fallback` до первого ответа, сохранение флагов при ошибке обновления и выключенные флаги при ошибке первой загрузки.
- **Заметки:** —
