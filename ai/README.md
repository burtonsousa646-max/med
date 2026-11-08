# Команда ИИ-агентов

Всё, что нужно ИИ-агентам для работы над платформой: кто работает, по каким правилам, в каком порядке и как вызвать роль в конкретном инструменте. Обзор и принятые решения — `specs/guides/ai-agents.md`.

## Устройство

```
ai/
  agents/       КТО — роли: зона ответственности, порядок работы, права, запреты, отчёт
  rules/        КАК — правила, общие для ролей: процесс, архитектура, код, тесты, безопасность
  workflows/    В КАКОМ ПОРЯДКЕ — процессы для человека: какую роль когда запускать и что проверять
  templates/    шаблоны документов фичи и ADR
  config/       уровень модели роли → модель в каждом инструменте
  adapters/     генератор команд ролей под Claude Code, Codex, Kimi Code и Gemini CLI
```

Роли и правила не привязаны к конкретной LLM. Под каждый инструмент генерируются тонкие обёртки, которые велят агенту прочитать роль и её правила, — `adapters/README.md`.

## Роли

| Роль | Файл | Уровень | Пишет |
|---|---|---|---|
| Аналитик | `agents/analyst.md` | reasoning | `specs/product/`, `requirements.md` |
| Архитектор | `agents/architect.md` | reasoning | `design.md`, `tasks.md`, `specs/architecture/`, контракты в `api/`, общие настройки |
| Frontend-разработчик | `agents/frontend-developer.md` | standard | `web/`, контрактные тесты микрофронтендов |
| Backend-разработчик | `agents/backend-developer.md` | standard | `server/`, контрактные тесты gateway и сервисов |
| Тестировщик | `agents/qa.md` | standard | `test-plan.md`, `tests/` |

## Правила

| Правило | О чём | Кто читает |
|---|---|---|
| `rules/common.md` | завершение работы, ветки, коммиты и их согласование | все |
| `rules/sdd.md` | документы фичи, статусы, контрольные точки, трассировка | все |
| `rules/architecture.md` | сервисы, взаимодействие, чистая архитектура, зависимости пакетов, флаги | архитектор, разработчики |
| `rules/api-contracts.md` | OpenAPI, protobuf, совместимость, генерация, контрактные тесты | архитектор, разработчики, тестировщик |
| `rules/backend.md` | код сервисов и gateway, Prisma, gRPC, очереди | архитектор, backend |
| `rules/frontend.md` | код микрофронтендов, запросы, состояние, стили, доступность | архитектор, frontend |
| `rules/testing.md` | уровни тестов, кто что пишет, правила тестов | архитектор, разработчики, тестировщик |
| `rules/security.md` | доступ, входные данные, секреты, персональные данные | архитектор, разработчики, тестировщик |

Какие правила читает роль, указано в поле `rules` её frontmatter.

## Процессы

| Процесс | Когда |
|---|---|
| `workflows/feature.md` | новая фича — от требований до приёмки |
| `workflows/migrate-feature.md` | перенос фичи из прототипа |
| `workflows/bugfix.md` | исправление дефекта — в непринятой и принятой фиче |

## Шаблоны

| Шаблон | Документ | Кто заполняет |
|---|---|---|
| `templates/requirements.md` | `specs/features/NNN-slug/requirements.md` | аналитик |
| `templates/design.md` | `specs/features/NNN-slug/design.md` | архитектор |
| `templates/tasks.md` | `specs/features/NNN-slug/tasks.md` | архитектор |
| `templates/test-plan.md` | `specs/features/NNN-slug/test-plan.md` | тестировщик |
| `templates/adr.md` | `specs/architecture/adr/NNNN-slug.md` | архитектор |

## Как менять

- **Роль.** Правится файл в `agents/`. Если изменились `id`, `name`, `description`, `tier` или `rules` — `pnpm ai:adapters` и коммит вместе с адаптерами.
- **Новая роль.** Файл `agents/<id>.md` в том же формате, что и остальные, затем `pnpm ai:adapters`. Роль добавляется в таблицы этого файла, `AGENTS.md` и `specs/guides/ai-agents.md`.
- **Правило.** Правится или добавляется файл в `rules/`; новое правило подключается в поле `rules` нужных ролей.
- **Модель для уровня.** Правится `config/models.yaml`, затем `pnpm ai:adapters`.
- **Новый инструмент.** Функция в `adapters/generate.mjs` — `adapters/README.md`, раздел «Новый инструмент».

Изменения в `ai/` коммитятся с типом `chore(ai)` и согласуются, как любой коммит.
