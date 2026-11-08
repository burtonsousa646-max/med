# Партнерская платформа билайна

Репозиторий новой платформы, которая переписывает прототип в полноценный продукт. Разработка ведётся по spec driven development командой ИИ-агентов под управлением человека.

Этот файл читают все ИИ-инструменты: Codex и Kimi Code — напрямую, Claude Code — через `CLAUDE.md`, Gemini CLI — через `GEMINI.md`.

## Главное

- **Язык** — русский: документы, комментарии, тексты для людей, сообщения коммитов.
- **Сначала спецификация, потом код.** Код пишется только по согласованным документам в `specs/features/`. Процесс — `ai/rules/sdd.md`.
- **Каждый коммит согласуется с человеком.** Агент показывает файлы и сообщение и коммитит только после явного «да». Push и переписывание истории — тоже. Правила — `ai/rules/common.md`.
- **Не додумывай.** Если не хватает требований, контракта или решения — остановись и спроси.
- **Прототип и `docs/` не меняются.** `prototype/` — эталон поведения при переносе, `docs/` — его описание.

## Роли

Работа ведётся ролями. Роль вызывается командой — синтаксис зависит от инструмента, см. `ai/adapters/README.md`:

| Роль | Claude Code, Gemini CLI | Kimi Code | Codex | Файл роли |
|---|---|---|---|---|
| Аналитик | `/analyst` | `/skill:analyst` | `$analyst` | `ai/agents/analyst.md` |
| Архитектор | `/architect` | `/skill:architect` | `$architect` | `ai/agents/architect.md` |
| Frontend-разработчик | `/frontend-developer` | `/skill:frontend-developer` | `$frontend-developer` | `ai/agents/frontend-developer.md` |
| Backend-разработчик | `/backend-developer` | `/skill:backend-developer` | `$backend-developer` | `ai/agents/backend-developer.md` |
| Тестировщик | `/qa` | `/skill:qa` | `$qa` | `ai/agents/qa.md` |

Если роль не вызвана, ты работаешь как помощник человека: соблюдаешь `ai/rules/common.md` и правила той области, в которой работаешь, и не берёшь на себя работу роли без просьбы человека.

## Где что лежит

| Каталог | Что |
|---|---|
| `ai/` | роли, правила, шаблоны, процессы и адаптеры для ИИ — `ai/README.md` |
| `specs/` | вся документация платформы: продукт, архитектура, фичи, гайды |
| `specs/architecture/` | стек (`tech-stack.md`), структура репозитория (`structure.md`), ADR |
| `api/` | контракты OpenAPI и `.proto`, контрактные тесты, pact-файлы |
| `server/` | backend: микросервисы NestJS и общие пакеты |
| `web/` | frontend: микрофронтенды React и общие пакеты |
| `tests/` | автотесты API и e2e |
| `deploy/` | локальное окружение |
| `prototype/` | прототип — только чтение |
| `docs/` | документация прототипа — только чтение |

## Команды

| Команда | Что делает |
|---|---|
| `pnpm install` | зависимости; только pnpm, не npm и не yarn |
| `pnpm lint` | ESLint по всему репозиторию |
| `pnpm format` | Prettier по всему репозиторию |
| `pnpm typecheck` · `pnpm test` · `pnpm build` | проверка типов, модульные тесты, сборка во всех пакетах |
| `pnpm env:up` · `pnpm env:down` | PostgreSQL, Redis и Unleash из `deploy/` |
| `pnpm ai:adapters` | пересобрать команды ролей после изменения `ai/agents/` или `ai/config/models.yaml` |

Команды пакетов и тестов — в `ai/rules/backend.md`, `ai/rules/frontend.md`, `ai/rules/testing.md`, `ai/rules/api-contracts.md`.
