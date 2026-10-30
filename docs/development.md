# Разработка

## 1. Что нужно

- **Node 22.18+**: запускает TypeScript без сборки и даёт встроенный тест-раннер. Версия записана в `.nvmrc` (`nvm use`).
- **PostgreSQL 17**. На Mac — Postgres.app. Запустить сервер без приложения:

```bash
/Applications/Postgres.app/Contents/Versions/17/bin/pg_ctl -D "$HOME/Library/Application Support/Postgres/var-17" start
```

Создать базы (один раз):

```bash
/Applications/Postgres.app/Contents/Versions/17/bin/createdb -U postgres ads_platform
```

```bash
/Applications/Postgres.app/Contents/Versions/17/bin/createdb -U postgres ads_platform_test
```

## 2. Запуск

```bash
npm install
npm run migrate
npm run dev
```

`npm run dev` запускает три процесса: API (8788), воркер и интерфейс (5174). Интерфейс проксирует `/api` на сервер, а `PUBLIC_URL` и `APP_URL` в режиме разработки указывают на 5174 — так cookie, колбэки входа и возврат со страницы оплаты живут на одном адресе. Открыть — http://127.0.0.1:5174.

В панели предпросмотра Claude Code — конфигурация `platform` в `.claude/launch.json`.

Если база разработки создавалась до правки уже применённой миграции, пересоздайте её: `drop schema public cascade; create schema public;`, затем `npm run migrate`.

## 3. Переменные окружения

| Переменная | По умолчанию | Что |
|---|---|---|
| `DATABASE_URL` | `postgres://postgres@localhost/ads_platform` | база |
| `DB_POOL` | `10` | соединений в пуле |
| `API_PORT` | `8788` | порт API (8787 занят прототипом) |
| `PUBLIC_URL` | `http://127.0.0.1:8788` | внешний адрес API: из него собираются адреса колбэков входа |
| `APP_URL` | `http://127.0.0.1:5174` | адрес интерфейса: куда вернуть после входа |
| `NODE_ENV` | — | `production` включает Secure у cookie, выключает заглушки входа и dev-секреты вебхуков |
| `ALLOW_STUB_LOGIN` | — | `1` — страницы заглушек входа доступны и в production (для стенда) |
| `INT_<ПОРТ>` | `stub` | адаптер порта, см. [integrations.md](integrations.md) |
| `HOOK_SECRET_<ПОРТ>` | `dev-secret-<порт>` вне production | секрет подписи вебхуков |
| `STORAGE_DIR` | `var/storage` | папка файлов заглушки хранилища |
| `SERVE_SECRET` | `dev-serve-secret` вне production | подпись токенов показа и клика; в production обязателен |
| `SURFACE_KEYS` | — | ключи поверхностей `app:ключ,site:ключ`; заданы — `/public/serve` требует `X-Surface-Key` |

Секреты — только в переменных окружения (на сервере — файл окружения службы), не в коде и не в базе.

## 4. Тесты

```bash
npm test
```

```bash
npm run check
```

- Тесты идут на базе `ads_platform_test`: перед каждым файлом схема пересоздаётся с нуля (`resetDb` в `server/testing.ts`), файлы — по очереди. На базе без `_test` в имени тесты не запустятся.
- `client()` из `server/testing.ts` — клиент с cookie, как браузер; `loginPartner(inn)` и `loginStaff(roles)` входят через страницы заглушек.
- `server/contract.test.ts` сверяет маршруты сервера с контрактами `api/*.yaml`.
- Тест лежит рядом с кодом: `modules/identity.ts` → `modules/identity.test.ts`.
- `npm run check` проверяет типы и сервера, и интерфейса: расхождение интерфейса с контрактом видно здесь.

## 5. Правила кода

- **Контракт первым.** Новый маршрут — сначала операция в `api/*.yaml`, иначе упадёт тест контракта. Поменяли `cabinet.yaml` — `npm run api:types`.
- **Деньги** — копейки, `bigint` в базе, суффикс `Kop` / `_kop`. Каждая денежная операция — через модуль billing с ключом идемпотентности.
- **Компания** — только из `c.var.partner.companyId`. Параметр `companyId` в запросе кабинета — ошибка проектирования.
- **Внешние системы** — только через `port(...)`. Нужен результат сейчас — прямой вызов; изменение должно дойти — `enqueue` в той же транзакции.
- **SQL** — тегированные шаблоны `postgres` (`sql\`...${value}\``), значения всегда параметрами. `sql.unsafe` — только в миграциях.
- **Ошибки** — `fail(status, 'текст для человека')`, ответ `{ message }`.
- **Простые решения с известным потолком** помечаются комментарием `ponytail:` с тем, что будет потолком и как его поднять.
- Комментарии и тексты для людей — по-русски.

## 6. Как добавить модуль

1. Таблицы — новой миграцией `migrations/NNNN_<модуль>.sql`.
2. Операции — в `api/cabinet.yaml`, `admin.yaml` или `public.yaml`.
3. Код — `server/modules/<модуль>.ts`: маршруты (`Hono`), функции для других модулей, `handle(...)` для очереди, `onHook(...)` для вебхуков.
4. Подключить: маршруты — в `server/index.ts`, модуль с исполнителями — импортом в `server/modules.ts` (его загружают и api, и worker).
5. Тест — `server/modules/<модуль>.test.ts`.
6. Документация — раздел в `docs/` и строка в таблице модулей [architecture.md](architecture.md#3-модули).
