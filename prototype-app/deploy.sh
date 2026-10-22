#!/bin/sh
# Выкладка на https://ads.napovtor.ru: прототип в корень, дизайн-система в /design-system/.
# Закрыто от поисковиков: robots.txt, meta robots и заголовок X-Robots-Tag в nginx.
set -e
cd "$(dirname "$0")"
HOST=root@201.34.149.236
DIR=/var/www/ads.napovtor.ru
npm run build
rsync -az --delete --exclude design-system dist/ "$HOST:$DIR/"
rsync -az --delete --exclude '.DS_Store' --exclude '*.eot' --exclude '*.woff' ../design-system/ "$HOST:$DIR/design-system/"
ssh "$HOST" "chown -R www-data:www-data $DIR"
echo "готово: https://ads.napovtor.ru"
