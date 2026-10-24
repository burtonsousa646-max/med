# Master prompt для Claude Code / Cursor / Codex / другой AI/IDE
Скопируй текст ниже или дай среде прочитать файл вместе с архивом.

---
Ты продолжаешь разработку существующего Partner Cabinet МЁД by beeline. Цель — массовое подключение партнёров и поставка офферов в каналы Билайна. Не переизобретай продукт и не рисуй новый UI, пока не изучил исходник `prototype/med_partner_cabinet.html`.

Сначала прочитай 00,01,11,13,14 и этот файл. Для backend прочитай 03–10 и12. Вертикальный API-срез и event schema в contracts являются DRAFT RFC, а не работающими внешними API. Различай SOURCE, OBSERVED, RFC, OPEN, MOCK. SOURCE в презентации не означает утверждения или реализации. Не выдавай гипотезы/демо за production.

Текущее приложение — один HTML с CSS и vanilla JS без build/npm/backend/network/storage/auth. Есть семь страниц: home/offers/campaigns/orders/analytics/money/help. Формы меняют in-memory arrays; reload обнуляет изменения. Support не сохраняет case, description нового offer теряется, аналитика статична. Эти ограничения описаны в11. Начни с запуска файла и проверки текущих взаимодействий.

Сохраняй русский язык, жёлто-чёрный визуальный язык, sidebar/nav, card/table/modal patterns и responsive layout. Brand «МЁД» с ё. Перенос на framework — отдельное обоснованное решение. Не утверждай существование Git repository, hosted URL, React app, API или production Mobile ID.

Архитектурные инварианты:
1. Partner Hub хранит партнёров/точки/офферы/заказы; Integration Hub изолирует внешние CRM/ERP/POS от Билайна.
2. Каноническая модель Partner/Outlet/OfferVersion/Order/StatusHistory/Settlement/EventLog; stable unified order ID, внешние IDs через mapping.
3. Tenant isolation и server permissions; UI скрытие кнопки не authorization.
4. Published offer immutable snapshot; купленные условия не меняются из-за нового draft.
5. At-least-once события, inbox/outbox, dedupe, transactional state+ledger; no double order/payout.
6. Lifecycle, payment, dispute, settlement статусы независимы. Confirmed не равно paid.
7. Деньги minor integer+currency; policy-versioned CPA/CPS/RS; demo20% не правило.
8. Sandbox отдельно, без реальных выплат/ПДн; secrets не в browser/git/logs.
9. Партнёр предлагает audience/channel, CVM утверждает отправку; raw customer profile не передаётся.
10. Пауза оффера прекращает новые продажи, но сохраняет старые обязательства/support/settlement.

Перед изменением:
- Проверь фактические файлы и доступные инструкции репозитория.
- Назови задачу backlog, affected requirements и status решения.
- Найди существующий component/function; не создавай параллельный subsystem.
- Если OPEN блокирует production integration, создай явно маркированный adapter/mock и перечисли недостающий contract; не выдумывай URL/keys/юридическое подтверждение.
- Не загружай конфиденциальные source attachments в публичный repo.

Порядок работы: короткий implementation plan → минимальный coherent change → содержательная проверка → обновление spec/backlog/decisions/verification. При backend проверяй wrong-tenant, duplicate/replay/out-of-order, invalid transition, partial refund, lost ACK, sandbox boundary. При UI проверяй desktop/mobile/keyboard, сохранение данных и корректные ошибки.

После изменения сообщи: что сделано; какие требования закрыты; как проверено; что mock/TODO/OPEN; конкретный следующий шаг. Не обещай «готово» по toast или статичной цифре. Не изменяй утверждённые условия без ADR/migration. При новом source обновляй source register и manifest. Продолжай с B01, затем выбранным vertical slice с учётом доступного runtime и решений владельцев.
---
