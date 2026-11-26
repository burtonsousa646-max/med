#!/bin/sh
set -eu
umask 077

case "${HARAKA_SMTP_PASSWORD:-}" in
  ''|*[!0-9a-fA-F]*)
    echo 'Задайте HARAKA_SMTP_PASSWORD в виде шестнадцатеричной строки' >&2
    exit 1
    ;;
esac
if [ "${#HARAKA_SMTP_PASSWORD}" -lt 32 ]; then
  echo 'HARAKA_SMTP_PASSWORD должен содержать хотя бы 32 символа' >&2
  exit 1
fi

cd /opt/haraka/app
printf '[core]\nmethods=PLAIN\n[users]\nnotifications=%s\n' "$HARAKA_SMTP_PASSWORD" > config/auth_flat_file.ini
if [ ! -s config/tls_key.pem ] || [ ! -s config/tls_cert.pem ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 90 \
    -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' \
    -keyout config/tls_key.pem -out config/tls_cert.pem 2>/dev/null
fi

exec /opt/haraka/node_modules/.bin/haraka -c /opt/haraka/app
