#!/usr/bin/env bash
# Выкладка с компьютера разработчика: проверка, сборка интерфейса, копирование, зависимости, миграции, перезапуск, проверка здоровья.
#   bash deploy/deploy.sh                 — на root@201.34.149.236, сайт platform.napovtor.ru
#   SERVER=root@host DOMAIN=x.ru bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SERVER=${SERVER:-root@201.34.149.236}
DOMAIN=${DOMAIN:-platform.napovtor.ru}
APP=/opt/ads-platform

# 1. не выкладываем то, что не проходит проверку типов и тесты
npm run check
npm test
VITE_API_URL=/api npm run build

# 2. первый раз — настройка сервера (повтор безопасен)
if ! ssh "$SERVER" test -f /etc/ads-platform.env; then
  rsync -a deploy/ "$SERVER:/tmp/ads-platform-deploy/"
  ssh "$SERVER" "DOMAIN=$DOMAIN bash /tmp/ads-platform-deploy/setup-server.sh"
fi

# 3. код: сервер, миграции, контракты, сборка интерфейса. Данные и секреты на сервере не трогаем.
rsync -a --delete --exclude '*.test.ts' --exclude testing.ts server/ "$SERVER:$APP/server/"
rsync -a --delete migrations/ "$SERVER:$APP/migrations/"
rsync -a --delete api/ "$SERVER:$APP/api/"
rsync -a --delete dist/ "$SERVER:$APP/dist/"
rsync -a package.json package-lock.json .npmrc "$SERVER:$APP/"

# 4. зависимости, миграции, перезапуск
ssh "$SERVER" "set -e; cd $APP
  PATH=/opt/node22/bin:\$PATH npm ci --omit=dev --no-audit --no-fund --silent
  set -a; . /etc/ads-platform.env; set +a
  /opt/node22/bin/node server/migrate.ts
  chown -R root:root $APP
  systemctl restart ads-platform-api ads-platform-worker"

# 5. жив ли
sleep 3
curl -fsS "https://$DOMAIN/api/health" | head -c 200 && echo
echo "готово: https://$DOMAIN"
