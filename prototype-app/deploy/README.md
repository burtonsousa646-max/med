# Docker: запуск и перенос на сервер

Эта инструкция относится к `prototype-app` и соседней `design-system`. Отдельное приложение `platform` не входит в сборку. Нужны Docker Engine и Compose 2.24.4 или новее. Все команды ниже выполняются из `prototype-app/`.

Caddy в контейнере `web` раздаёт интерфейс и проксирует запросы в Hono на Node 22. `api` обслуживает основной API, `autocomplete` обрабатывает поиск по ИНН и использует тот же образ с другой командой. SQLite хранится в именованном томе `med-prototype_api-data`, сертификаты — в отдельных томах Caddy. Код в контейнерах доступен только для чтения, процессы работают без root. Порт API на хост не публикуется.

Контейнеризация позволяет разместить текущий прототип на сервере. Вход, оплаты, ЭДО и генерация в приложении по-прежнему демонстрационные. Черновик V4 и изображения хранятся в IndexedDB и SQLite. `noindex` в HTML, robots.txt и HTTP-заголовках сохранён.

## Локальный запуск

```sh
cp -n .env.example .env
chmod 600 .env
docker compose up -d --build --wait
docker compose ps
curl --fail http://127.0.0.1:8080/api/health
# Дополнительная проверка HTTP, если на хосте установлен Node:
node scripts/check-docker.mjs http://127.0.0.1:8080
```

Главная с лендингом v4: <http://127.0.0.1:8080/>. Сервер не перенаправляет `/` на hash-маршрут: это сломало бы обновление ссылок на другие экраны. Для другого порта задайте `HTTP_PORT` в `.env`.

Сборка включает тесты API, проверки черновика/редактора, TypeScript и Vite. Соседняя `design-system` нужна при сборке, поэтому build context указан как `..`. `Dockerfile.dockerignore` пропускает только необходимые исходники и исключает `.env`, базы, ключи, node_modules и остальные приложения MED. Клиент использует `/api` на том же домене, CORS и `VITE_API_URL` для этой схемы не нужны.

Яндекс Метрика для V4 настраивается публичной переменной `VITE_METRIKA_ID` в `.env`. Пустое значение отключает счётчик. ID встраивается при сборке web, поэтому после изменения нужен `docker compose build web` и обновление web-контейнера. Карта целей и проверка без отправки данных описаны в [инструкции по воронке](../docs/metrika-v4.md). На localhost отправка отключена; цели в аккаунте создаются отдельно.

Для автозаполнения по ИНН задайте `DADATA_API_KEY` и `DADATA_SECRET_KEY` в серверном `.env`. Compose передаёт их только в Autocomplete.

### Отправка заявок V4 через Resend

- **systemd**. Сохраните ключ Resend в `/etc/credstore/ads-proto-resend-api-key` (владелец `root`, права `0600`). Укажите `CAMPAIGN_MAIL_FROM` в `/etc/ads-proto.env`. После обновления unit-файла выполните `systemctl daemon-reload` и `systemctl restart ads-proto`.
- **Docker Compose**. Сохраните ключ вне репозитория в файле, доступном на чтение пользователю API (UID 1000 в контейнере). В серверном `.env` задайте `RESEND_SECRET_PATH` с абсолютным путём к файлу и `CAMPAIGN_MAIL_FROM`. Добавляйте `-f compose.resend.yaml` после остальных файлов Compose при каждом обновлении контейнеров. Например, `docker compose -f compose.yaml -f compose.resend.yaml up -d --build --wait`. При замене файла ключа пересоздайте контейнер API.

В обоих вариантах укажите адрес отправителя на подтверждённом в Resend домене. Пока ключ и отправитель не настроены, заявки сохраняются в очереди SQLite.

## Прод с существующим nginx и HTTPS

Это предпочтительный вариант для текущего сервера, где nginx уже обслуживает другие сайты. Скопируйте `prototype-app/` и `design-system/`, сохранив соседство папок, или загрузите готовые образы по инструкции ниже. Создайте `.env` из примера и задайте `COOKIE_SECURE=true`. Порт `HTTP_PORT` должен соответствовать upstream в nginx, по умолчанию 8080.

```sh
docker compose up -d --build --wait
```

В существующем HTTPS server-блоке замените locations приложения содержимым `deploy/nginx-location.conf`. Старый `location /api/`, ведущий на порт 8787, и старые locations статики нужно убрать из этого server-блока: и интерфейс, и API теперь обслуживает Docker. Остальные виртуальные хосты и TLS-настройки не меняйте.

```sh
sudo nginx -t
sudo systemctl reload nginx
```

Проверьте `https://ваш-домен/api/health` и `https://ваш-домен/`. Старую службу `ads-proto` останавливайте только после переключения nginx и проверки нового приложения. Она не нужна контейнерам. Старый `deploy.sh` остаётся отдельным способом выкладки и не управляет Docker.

## Прод на новом сервере: автоматический HTTPS

В `.env` замените `DOMAIN` на настоящий hostname без `https://` и пути. Настройте DNS A/AAAA на сервер, откройте TCP 80/443 и убедитесь, что эти порты свободны. Caddy получает и продлевает сертификаты автоматически. TLS завершается внутри контейнера, production-конфигурация включает Secure-cookie.

```sh
docker compose -f compose.yaml -f compose.production.yaml config --quiet
docker compose -f compose.yaml -f compose.production.yaml up -d --build --wait
```

Лендинг v4 будет доступен по `https://ваш-домен/`. В production используются только публичные 80/443, прежняя публикация локального 8080 удаляется через `!override`. Для последующих команд управления используйте те же два `-f`. Не включайте этот вариант на сервере, где 80/443 уже заняты nginx.

## Перенос готовых образов без сборки на сервере

Собирайте образы под архитектуру целевого сервера. При переносе с Apple Silicon на x86 Linux перед сборкой задайте `export DOCKER_DEFAULT_PLATFORM=linux/amd64`; для ARM-сервера — `linux/arm64`. Для обычной сборки на самом сервере эта переменная не нужна.

```sh
export IMAGE_TAG=release-2026-11-09
docker compose build --pull
docker image save med-prototype-api:$IMAGE_TAG med-prototype-web:$IMAGE_TAG | gzip > med-prototype-images.tar.gz
```

Передайте архив образов, `compose.yaml`, `compose.production.yaml` и `.env.example`. Секретный `.env` создайте отдельно на сервере, не добавляйте его в архив образов или Git. Исходники для запуска готовых образов не нужны. В серверном `.env` укажите тот же `IMAGE_TAG`.

```sh
gzip -dc med-prototype-images.tar.gz | docker image load
docker compose up -d --no-build --wait
# Или для самостоятельного HTTPS:
docker compose -f compose.yaml -f compose.production.yaml up -d --no-build --wait
```

Сохраняйте Compose project name `med-prototype`, заданный в конфигурации: от него зависят имена томов. Новый project name создаст пустые тома вместо подключения старой базы.

## Перенос существующей SQLite

Новая установка создаёт пустую демо-базу. Если нужны данные прежней службы, сделайте согласованную копию SQLite и восстановите её в контейнерный том по разделу ниже. Не переносите работающую WAL-базу простым копированием только `.sqlite`: последние изменения могут быть в `-wal`.

На старом сервере безопасную копию можно создать тем же скриптом с Node 22.18+:

```sh
DB_PATH=/var/lib/ads-proto/demo.sqlite /opt/node22/bin/node --disable-warning=ExperimentalWarning server/backup.ts /tmp/med-migration.sqlite
```

Путь к `server/backup.ts` должен указывать на новую копию проекта. Перенесите полученный файл защищённым способом. Он содержит данные приложения.

## Бэкап и восстановление

Скрипт использует SQLite backup API, поэтому включает изменения из WAL даже при работающем API. Существующий файл назначения не перезаписывается. Команды ниже используют базовый Compose; при самостоятельном HTTPS добавляйте `-f compose.yaml -f compose.production.yaml`.

```sh
mkdir -p backups
docker compose exec -T api node --disable-warning=ExperimentalWarning server/backup.ts /data/med-backup.sqlite
docker compose cp api:/data/med-backup.sqlite ./backups/med-backup.sqlite
chmod 600 ./backups/med-backup.sqlite
docker compose exec -T api rm /data/med-backup.sqlite
```

После копирования переименуйте локальный файл с датой и храните копию вне сервера. Сертификаты можно перевыпустить, а данные SQLite требуют отдельного бэкапа. Очистка браузера удаляет локальные черновики V4; серверный бэкап их не содержит.

Для восстановления остановите приложение. Эта операция заменяет текущую серверную базу, поэтому сначала сохраните её резервную копию. Команда `run` создаёт временный контейнер с тем же томом; путь `/restore/backup.sqlite` монтируется только для чтения. Только этот обслуживающий контейнер получает root и права чтения/смены владельца файла: основной API продолжает работать без root. Проверка SQLite выполняется перед заменой данных.

```sh
docker compose stop
docker compose run --rm --no-deps -T --user 0 --cap-add DAC_OVERRIDE --cap-add CHOWN \
  -v "$PWD/backups/med-backup.sqlite:/restore/backup.sqlite:ro" \
  api node --disable-warning=ExperimentalWarning --input-type=module <<'JS'
import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, chmodSync, chownSync, renameSync, rmSync } from 'node:fs'
const source = new DatabaseSync('/restore/backup.sqlite', { readOnly: true })
if (source.prepare('pragma integrity_check').get().integrity_check !== 'ok') throw new Error('Invalid SQLite backup')
source.prepare('select count(*) from companies').get()
source.close()
rmSync('/data/restore.sqlite', { force: true })
copyFileSync('/restore/backup.sqlite', '/data/restore.sqlite')
chmodSync('/data/restore.sqlite', 0o600)
chownSync('/data/restore.sqlite', 1000, 1000)
rmSync('/data/demo.sqlite-wal', { force: true })
rmSync('/data/demo.sqlite-shm', { force: true })
renameSync('/data/restore.sqlite', '/data/demo.sqlite')
JS
docker compose up -d --no-build --wait
```

## Обновление, откат и диагностика

Перед обновлением сделайте бэкап. Для версии образов задайте новый `IMAGE_TAG` в `.env`, затем:

```sh
docker compose build --pull
docker compose up -d --no-build --wait
docker compose ps
docker compose logs --tail=100 web api
```

Для отката верните прежний `IMAGE_TAG` и выполните `up -d --no-build --wait`, сохранив прежние образы. Откат кода не откатывает данные и изменения схемы: если новая версия меняла схему несовместимо, нужен соответствующий бэкап базы.

`docker compose down` сохраняет именованные тома. `down -v` удаляет базу и сертификаты — для обычного обновления эту команду не используйте. Healthcheck API проверяет SQLite без создания демо-компаний; healthcheck Caddy использует внутренний 8081, не зависящий от HTTPS-перенаправления. Логи ротируются по 10 МБ, хранятся три файла на сервис. API корректно закрывает HTTP-соединения и SQLite при SIGTERM.

Ключи `ANTHROPIC_API_KEY`, `DADATA_API_KEY` и модель `NEAR_AI_MODEL` необязательны и передаются только серверу во время запуска. Без ключа ИИ-поиск использует существующий запасной поиск, а серверный поиск по ИНН отвечает 503. Новый сценарий V4 использует локальное демо и от этих ключей не зависит. Не публикуйте вывод `docker compose config` или `docker inspect` с реальным `.env`: он может содержать значения ключей; для проверки синтаксиса используйте `config --quiet`.

Описанная схема рассчитана на один API-контейнер и локальный SQLite-том. Перед горизонтальным масштабированием требуется отдельная стратегия хранения, авторизации и сессий. Инструкции по Compose и HTTPS: [Docker](https://docs.docker.com/compose/how-tos/production/), [Caddy](https://caddyserver.com/docs/automatic-https).

## Что проверено

9 ноября 2026: оба образа собраны и запущены в Linux-контейнерах Docker Desktop. Прошли 13 серверных и 6 клиентских unit-проверок, TypeScript/Vite, проверки HTTP/API/кэша/404 и браузерный сценарий V4 до готового оффера. Проверены non-root/read-only, состояние healthy, сохранность сессии при пересоздании контейнера, остановка SIGTERM с кодом 0, бэкап живой WAL-базы, восстановление командами из этой инструкции и отказ от повреждённой копии без потери текущих данных. Проверены синтаксис production Compose, замена портов и HTTPS-конфигурация Caddy без сети.

Тестовая установка и её тома удалены после проверки, собранные образы сохранены локально. Выкладка на реальный сервер, DNS, сертификат публичного домена и сборка под другую CPU-архитектуру в эту проверку не входили.
