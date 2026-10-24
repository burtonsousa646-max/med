#!/bin/sh
# Выкладка на https://ads.napovtor.ru: интерфейс в корень, дизайн-система в /design-system/, тестовый API — служба ads-proto.
# Закрыто от поисковиков: robots.txt, meta robots и заголовок X-Robots-Tag в nginx.
# Один раз на сервере: Node 22.18+ в /opt/node22 (системный Node 20 не трогаем, на нём pm2-приложения) и в server-блоке nginx
#   location /api/ { proxy_pass http://127.0.0.1:8787; proxy_set_header Host $host; }
set -e
cd "$(dirname "$0")"
HOST=root@201.34.149.236
DIR=/var/www/ads.napovtor.ru
APP=/opt/ads-proto
npm test
npm run build
rsync -az --delete --exclude design-system dist/ "$HOST:$DIR/"
rsync -az --delete --exclude '.DS_Store' --exclude '*.eot' --exclude '*.woff' ../design-system/ "$HOST:$DIR/design-system/"
ssh "$HOST" "mkdir -p $APP"
rsync -az --delete --exclude '*.sqlite*' server/ "$HOST:$APP/server/"
rsync -az package.json package-lock.json .npmrc "$HOST:$APP/"
ssh "$HOST" "set -e
  chown -R www-data:www-data $DIR
  cd $APP && PATH=/opt/node22/bin:\$PATH npm ci --omit=dev --no-audit --no-fund --silent
  cp server/ads-proto.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now ads-proto && systemctl restart ads-proto"
echo "готово: https://ads.napovtor.ru"
