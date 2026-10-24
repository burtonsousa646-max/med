# Backlog — предлагаемый порядок
Размеры задач и даты не оценены. Приоритет ниже RFC. Зависимости и критерии позволяют новому AI выполнять работу без переизобретения продукта.

| ID / приоритет | Задача | Зависит от | Definition of done |
|---|---|---|---|
| B01 P0 | Зафиксировать demo boundaries, support toast, desc loss | исходный HTML | Description сохраняется/показывается; support честно mock либо persisted case; reload behavior явно указан |
| B02 P0 | Audit repo/runtime перед framework migration | доступ к repo если появится | inventory + stack + run instructions + no false backend claims |
| B03 P0 | Утвердить identity/tenant/roles и legal акцепт | решения Q01/Q02/Q06 | approved ADR, scope map, mock adapter boundary |
| B04 P0 | Server domain + relational schema/outbox/inbox | Q stack; RFC07/08 | migration, tenant constraints, deterministic IDs, transactional transition |
| B05 P0 | Registration/profile/checks/documents vertical slice | B03/B04 | draft persistence, reviewer decision, accepted version evidence |
| B06 P0 | Offer versioning/constructor/moderation | B04/B05 | source mandatory fields, field validation, approved live snapshot |
| B07 P0 | L0 codes/orders/fulfilment | B06/B04 | atomic code issuance, confirm→fulfil, dedupe, audit |
| B08 P0 | Support cases/notifications/КАМ | B04/B07 | persist, owner/due_at, escalation, immutable messages |
| B09 P0 | Settlement ledger / hold / reconciliation | policy decisions, B07/B08 | explainable totals, return reversal, no double accrual/payment |
| B10 P1 | L1 deeplink/postback/CSV + sandbox | B07/approved contracts | signed correlation, replay/order handling, durable batch receipt |
| B11 P1 | Channel export/campaign request | B06 + CVM owner agreement | approved machine-readable card, per-channel ack, no guarantee of volume |
| B12 P1 | Analytics definitions and real period filtering | event sources | accepted denominator/window, freshness, mock removed only with real source |
| B13 P1 | Team/documents/admin UX | B03–05 | role boundaries, last owner/block enforcement |
| B14 P1 | Accessibility and regression | prototype UI | keyboard modal trap/restore, mobile nav, accessible validation |
| B15 P2 | L2 connector pilot | due diligence, B10 | one connector maps entities/errors/statuses, load/retry tests |
| B16 P2 | L3 API production | B10, SLA/security decisions | versioned contracts, auth, rate limit, reconciliation, ops runbook |
| B17 P2 | AI content/recommendations | B06 + review policy | suggestions provenance, human approval, no autonomous legal/finance decisions |

## Первые независимые задачи для новой среды
При доступе только к архиву: запустить HTML, изучить catalog, исправить B01 и доступность, добавить separate mock service interface и устойчивые entity references. Выбор production stack и реальные SSO/payment/CVM endpoints нельзя угадывать.

## Минимальные содержательные проверки backend
Cross-tenant read/write denial; duplicate command/key conflict; duplicate/out-of-order callback; code reservation race; immutable purchased terms; refund≤captured; hold on dispute; ledger no duplicate; payout retry no double payment; sandbox not paid; blocked user denied; expired/paused offer stops new orders. UI: create→detail→submit; new order confirm/fulfil; support persists; export safe UTF8; selected period affects data.
