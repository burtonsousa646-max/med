-- Базы локального окружения. Выполняется один раз — при первом создании тома postgres-data.
-- Новый сервис: добавить сюда строку CREATE DATABASE <name>_service; и пересоздать том
-- (pnpm env:down && docker volume rm platform_postgres-data && pnpm env:up) или создать базу вручную.

CREATE DATABASE unleash;
