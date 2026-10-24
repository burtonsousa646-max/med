# Architecture
SOURCE S03 p4, S04 slide9, S05 p8. Логические компоненты — концепция; число сервисов, облако, стек и deployment — OPEN.

| Компонент | Ответственность | Граница |
|---|---|---|
| Portal & Admin | партнёрские и внутренние workflows | не хранит authoritative финансы в browser |
| IAM / Membership | Mobile ID/SSO, scopes, tenant isolation | backend validates subject; провайдер OPEN |
| Partner Hub / Registry | партнёр, точки, checks, документы, КАМ | lifecycle/eligibility |
| Offer Management | card, versions, moderation, codes, campaign requests | export approved card в каналы |
| Order Hub | unified ID, transitions, support linkage | не равен payment processor |
| Integration Hub | adapters, callback inbox, webhook outbox, mapping, retries, monitoring | внешние raw statuses переводятся в canonical |
| Settlement | policy, ledger, reconciliation, holds, documents | payment execution отдельный контур |
| Legal | акцепт, версионирование, исключения | legal approval/evidence |
| Support | кейсы, сообщения, SLA, escalation | первая линия/владелец определяются договором |
| CVM / каналы Билайна | аудитория, trigger, contact policy, витрины, experiments | партнёру только aggregate отчёты и запросы |
| Analytics | воронка, экономика, freshness | definitions + safe aggregates |
| External partner systems | CRM/ERP/POS/payment/service fulfilment | Hub adapter, без прямой связи каждого партнёра с CVM |

## RFC implementation path
Начать с модульного backend ядра и durable relational storage + outbox/inbox, сохраняя логические boundaries. Микросервисная изоляция — концептуальный вариант в S03, не повод сразу строить множество deployment units. Выбор buy/build/integrate остаётся открытым в S02/S04/S05.
Browser → Cabinet API → domain modules → DB transaction + outbox → Integration dispatcher/каналы. Входящее событие → auth/schema/inbox/dedupe → domain transition → ledger/outbox. Для каждого adapter сохранять raw payload reference с минимизацией данных, mapping version и canonical event.

## Failure model
Если UI timeout после POST — retry тот же key/read result. Если DB committed, webhook failed — outbox retries без повторного order/ledger. Если партнёр offline — queue/health incident и policy остановки новых продаж. Если channel publication partially failed — сохранить per-channel ack и не показывать whole offer launch как complete. Disaster restore должно восстанавливать delivery/dedupe состояние вместе с бизнес-данными; RPO/RTO OPEN.

## Prototype architecture — OBSERVED
Один HTML с inline CSS/JS. `state`, seed arrays, `render()`, page functions и delegated document listeners. Нет npm/build/framework, роутера URL, localStorage/IndexedDB, сетевых запросов, базы, auth, feature flags, миграций или environment config. Смена страниц — перерисовка `#view`; всё состояние до reload. Не описывать его как React/Vue приложение.
