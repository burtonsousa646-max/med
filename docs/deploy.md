# Выкладка стенда

Стенд — https://platform.napovtor.ru на VPS проекта, рядом с прототипом (ads.napovtor.ru). Без пароля, закрыт от индексации (заголовок `X-Robots-Tag` и `robots.txt`). Прототип, его служба `ads-proto` (порт 8787), другие сайты nginx и системный Node 20 не трогаются.

## 1. Что где на сервере

| Что | Где |
|---|---|
| код | `/opt/ads-platform`: `server/`, `migrations/`, `api/`, `dist/` (интерфейс), `node_modules/` |
| секреты и настройки | `/etc/ads-platform.env` (root:ads-platform, 640): база, `SERVE_SECRET`, `STUB_SSO_CODE` |
| файлы креативов и документов | `/var/lib/ads-platform/storage` |
| копии базы | `/var/lib/ads-platform/backups`, каждый день в 03:30, хранятся 14 дней |
| службы | `ads-platform-api` (порт 8788), `ads-platform-worker`; пользователь `ads-platform`, только чтение кода |
| nginx | `/etc/nginx/sites-available/ads-platform`; https — certbot |
| база | PostgreSQL, база и пользователь `ads_platform`, пароль — только в файле окружения |
| Node | `/opt/node22` (22.18+) |

## 2. Первая выкладка

С компьютера разработчика, из папки `platform/`:

```bash
bash deploy/deploy.sh
```

Скрипт:
1. Проверяет типы и прогоняет тесты — с ошибками не выкладывает.
2. Собирает интерфейс.
3. Если сервер ещё не настроен, копирует `deploy/` и запускает `setup-server.sh`: ставит PostgreSQL (если нет), создаёт пользователя и базу со случайным паролем, пишет `/etc/ads-platform.env` со случайными секретами, ставит службы и сайт nginx, получает сертификат, включает ежедневную копию базы. Повторный запуск безопасен. Порт 8788 занят чужим процессом — остановится.
4. Копирует код, ставит зависимости, применяет миграции, перезапускает службы, проверяет `/api/health`.

DNS: `platform.napovtor.ru` должен указывать на сервер (у napovtor.ru wildcard-запись). Иначе certbot не выдаст сертификат — скрипт скажет об этом и продолжит.

## 3. Следующие выкладки

Та же команда. Данные, файлы и секреты на сервере не меняются. Миграции применяются только новые.

## 4. Вход на стенд

- **Партнёр** — «войти по СберБизнес ID» (или Госуслуги, Альфа ID): страница-заглушка провайдера, вводите любой ИНН из 10 цифр. ИНН на `0000` — ликвидированная компания.
- **Сотрудник** — `/admin` → «войти через SSO» → почта, имя, роли (moderator, manager, finance, admin) и код доступа стенда. Код — `STUB_SSO_CODE` в `/etc/ads-platform.env` на сервере:

```bash
ssh root@201.34.149.236 grep STUB_SSO_CODE /etc/ads-platform.env
```

- **Витрина** — `/near`, **встраивание** — `/embed-demo.html`.
- Вход по коду на почту на стенде не работает: письма уходят в заглушку.

## 5. Обслуживание

| Что | Команда на сервере |
|---|---|
| журнал API | `journalctl -u ads-platform-api -f` |
| журнал воркера | `journalctl -u ads-platform-worker -f` |
| перезапуск | `systemctl restart ads-platform-api ads-platform-worker` |
| восстановить базу из копии | `sudo -u postgres pg_restore -c -d ads_platform /var/lib/ads-platform/backups/ads_platform-ГГГГ-ММ-ДД.dump` |
| подключить систему билайна | дописать `INT_<ПОРТ>=beeline` и её секреты в `/etc/ads-platform.env`, перезапустить службы ([integrations.md](integrations.md#3-как-подключить-систему-билайна)) |
| нагрузка на стенде | с компьютера: `npm run load -- https://platform.napovtor.ru 3000 50` |
