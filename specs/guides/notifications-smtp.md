# Локальный SMTP для сервиса нотификаций

Профиль Compose `mail` запускает Haraka на `127.0.0.1:1587`. Сервер принимает письма с SMTP AUTH и STARTTLS. Исходящая доставка отключена, письма остаются в локальной очереди Docker. Для проверок используйте отправителя и получателя в домене `example.test` и синтетическое содержимое.

## Запуск

1. Скопируйте `deploy/.env.example` в `deploy/.env`, если файла ещё нет. Сгенерируйте пароль командой `openssl rand -hex 16` и запишите его в `HARAKA_SMTP_PASSWORD` в `deploy/.env`.
2. Запустите Haraka и скопируйте публичный сертификат. Повторите копирование сертификата при пересоздании контейнера.

   ```sh
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env --profile mail up -d --build --wait haraka
   mkdir -p var/haraka
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env --profile mail cp haraka:/opt/haraka/app/config/tls_cert.pem var/haraka/tls_cert.pem
   ```

3. Добавьте настройки в локальное окружение `notifications-service` к параметрам gRPC, PostgreSQL и Unleash из его `.env.example`. Используйте абсолютный путь к сертификату при запуске из каталога сервиса.

   ```dotenv
   NOTIFICATIONS_SMTP_HOST=127.0.0.1
   NOTIFICATIONS_SMTP_PORT=1587
   NOTIFICATIONS_SMTP_TLS_MODE=starttls
   NOTIFICATIONS_SMTP_CA_FILE=/абсолютный/путь/к/репозиторию/var/haraka/tls_cert.pem
   NOTIFICATIONS_SMTP_SENDER_CONFIG=haraka-local
   NOTIFICATIONS_SMTP_FROM=notifications@example.test
   NOTIFICATIONS_SMTP_SUBJECT=Уведомление платформы
   NOTIFICATIONS_SMTP_USERNAME=notifications
   NOTIFICATIONS_SMTP_PASSWORD=
   ```

   Возьмите пароль из `HARAKA_SMTP_PASSWORD`. С выключенным флагом `notifications.email.external-provider` новые email-попытки идут в Haraka. Положительный финальный SMTP-ответ подтверждает постановку письма в очередь.

## Замена SMTP-сервера

Для другого SMTP-сервера задайте его хост, порт, доверенный сертификат, если нужен частный CA, и свои учётные данные. Адаптер поддерживает обязательный `starttls` и TLS сразу при подключении (`implicit`). Учётные данные передаются по SMTP AUTH PLAIN внутри проверенного TLS-соединения. Отправка реальным адресатам требует отдельно настроенного релея с разрешённым доменом отправителя и исходящей доставкой.
