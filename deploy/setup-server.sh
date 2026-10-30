#!/usr/bin/env bash
# Первичная настройка сервера под платформу. Запускать на сервере от root, один раз; повторный запуск безопасен.
# Не трогает другие сайты nginx, прототип (ads-proto, порт 8787) и системный Node 20.
#   scp -r deploy root@SERVER:/tmp/ads-platform-deploy && ssh root@SERVER bash /tmp/ads-platform-deploy/setup-server.sh
set -euo pipefail

DOMAIN=${DOMAIN:-platform.napovtor.ru}
APP=/opt/ads-platform
DATA=/var/lib/ads-platform
ENVF=/etc/ads-platform.env
NODE=/opt/node22/bin/node
PORT=${PORT:-8788}
HERE=$(cd "$(dirname "$0")" && pwd)

[ -x "$NODE" ] || { echo "нет $NODE — нужен Node 22.18+"; exit 1; }
"$NODE" -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=18)?0:1)' || { echo "Node в $NODE старше 22.18"; exit 1; }
if ss -ltn | grep -q ":$PORT " && ! systemctl is-active --quiet ads-platform-api; then echo "порт $PORT занят другим процессом"; exit 1; fi

# PostgreSQL: ставим, если его нет; база и пользователь — свои, пароль случайный и только в $ENVF
if ! command -v psql >/dev/null; then apt-get update -q && DEBIAN_FRONTEND=noninteractive apt-get install -yq postgresql; fi
systemctl enable --now postgresql
id ads-platform >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin ads-platform
install -d -o ads-platform -g ads-platform "$DATA" "$DATA/storage" "$DATA/backups"
install -d "$APP"
# порт системного кластера: на сервере 5432 может быть занят чужим Postgres (например, в Docker)
PGPORT=$(sudo -u postgres psql -Atc 'show port')

if [ ! -f "$ENVF" ]; then
  DBPASS=$(openssl rand -hex 24)
  sudo -u postgres psql -qc "create role ads_platform login password '$DBPASS'" 2>/dev/null || sudo -u postgres psql -qc "alter role ads_platform password '$DBPASS'"
  sudo -u postgres psql -lqt | cut -d'|' -f1 | grep -qw ads_platform || sudo -u postgres createdb -O ads_platform ads_platform
  umask 077
  cat > "$ENVF" <<EOF
NODE_ENV=production
DATABASE_URL=postgres://ads_platform:$DBPASS@127.0.0.1:$PGPORT/ads_platform
API_PORT=$PORT
PUBLIC_URL=https://$DOMAIN
APP_URL=https://$DOMAIN
STORAGE_DIR=$DATA/storage
SERVE_SECRET=$(openssl rand -hex 32)
# стенд: заглушки входа открыты; заглушка SSO сотрудников — только с этим кодом
ALLOW_STUB_LOGIN=1
STUB_SSO_CODE=$(openssl rand -hex 8)
EOF
  chown root:ads-platform "$ENVF"; chmod 640 "$ENVF"
  echo "создан $ENVF (секреты внутри, в консоль не выводим)"
fi

# службы: API и воркер
install -m 644 "$HERE/ads-platform-api.service" "$HERE/ads-platform-worker.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable ads-platform-api ads-platform-worker

# nginx: только свой сайт
install -m 644 "$HERE/platform.nginx" /etc/nginx/sites-available/ads-platform
sed -i "s/platform.napovtor.ru/$DOMAIN/g; s/127.0.0.1:8788/127.0.0.1:$PORT/g" /etc/nginx/sites-available/ads-platform
ln -sf /etc/nginx/sites-available/ads-platform /etc/nginx/sites-enabled/ads-platform
nginx -t && systemctl reload nginx
# сертификат: certbot допишет https в этот же файл
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect --register-unsafely-without-email || echo "certbot не сработал — проверьте DNS $DOMAIN и запустите certbot вручную"

# ежедневная копия базы, храним 14 дней
cat > /etc/cron.d/ads-platform-backup <<'EOF'
30 3 * * * postgres pg_dump -p PGPORT -Fc ads_platform > /var/lib/ads-platform/backups/ads_platform-$(date +\%F).dump && find /var/lib/ads-platform/backups -name '*.dump' -mtime +14 -delete
EOF
sed -i "s/PGPORT/$PGPORT/" /etc/cron.d/ads-platform-backup
chown postgres "$DATA/backups"
echo "сервер готов; дальше — deploy/deploy.sh с вашего компьютера"
