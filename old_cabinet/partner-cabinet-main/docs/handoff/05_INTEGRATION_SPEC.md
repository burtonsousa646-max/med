# Integration Specification — RFC-001, DRAFT
SOURCE S03 p4/6/8/11–13, S04 slides9–12: уровни, hub isolation, unified ID, webhooks, версии, idempotency, sandbox, retries, rate limits. **Ни endpoint, ни параметры безопасности/таймауты в источниках не утверждены. Всё конкретное ниже — RFC.**

## Уровни
| Уровень | SOURCE содержание | Срок из S03/S04 | Контракт исполнения |
|---|---|---|---|
| L0 | ЛК, промокод/QR, ручное подтверждение | 1 день | UI команды приводятся к тому же Order Hub, аудит исполнителя |
| L1 | deeplink, postback, CSV/файл статусов | 1–3 дня | signed attribution token; внешний order ID; уникальный event ID; file batch |
| L2 | стандартные CRM/ERP/POS коннекторы | 3–10 дней | adapter translation во внутреннюю каноническую модель |
| L3 | orders/status/webhooks/sandbox/versioning | 2–6 недель | полноценный версионированный contract + test suite |
Сроки являются ориентирами. Не обещать готовность конкретного iiko/r_keeper/1С API: source прямо требует технического due diligence.

## Три границы API
1. Cabinet API: session user → Partner Hub, tenant/role permissions.
2. Channel API: доверенный backend Билайна → Offer/Order Hub; создание покупки требует отдельного согласованного payment flow.
3. Partner Integration API: партнёр/adapter → Integration Hub; события и команды исполнения. Callback и postback — входящие сообщения партнёра, webhook — исходящее событие платформы.
Не давать browser токену права Channel API. Не передавать партнёру CVM профили.

## Authentication / authorization — RFC
Пользователь: SSO/Mobile ID через IAM, secure HttpOnly session, CSRF защита при cookie-auth, server membership. Machine-to-machine: OAuth2 client_credentials, scope orders:read/orders:transition/events:write, credential binding partner_id+environment; срок access token/issuer OPEN. В учебном contract используется Bearer scheme как абстракция, не заявлена существующая OAuth система.
Входящие callback/postback: тот же scoped Bearer либо согласованная HMAC-схема. Webhook: HTTPS + HMAC-SHA256(secret, timestamp+'.'+raw_body), заголовки X-MED-Event-ID/X-MED-Timestamp/X-MED-Signature; RFC tolerance 300 s, constant-time compare, key rotation with overlap. Replay protection по event_id и timestamp. IP allowlist — дополнение, не единственная авторизация. Исходящие URL проверять против SSRF: запрет private/loopback/link-local адресов, redirect validation, контролируемый egress.

## Unified IDs и mapping
Платформа выдаёт order_id UUID; неизменяем от создания до settlement. Transaction/payment/fulfilment/refund IDs — отдельные сущности, привязанные к order_id. `external_order_id` не заменяет order_id: UNIQUE(partner_id,integration_id,external_order_id). Каждый event имеет event_id, order_id, correlation_id, causation_id, producer, schema_version, occurred_at, received_at, payload_hash. source_channel и attribution_token хранятся отдельно от customer_token.

## Идемпотентность
Обязательный Idempotency-Key для создания и transition/refund команд. Область ключа: credential/tenant + environment + operation. Хранить payload hash, response code/body и created_at. RFC retention 72 h для command keys; OPEN окончательный срок. Повтор того же payload возвращает исходный ответ; другой payload с тем же ключом → 409 IDEMPOTENCY_CONFLICT. Уникальность внешнего ID и event_id долговременная по политике retention, не только TTL ключа. DB transaction атомарно меняет объект, ledger и outbox.

## Webhooks, callbacks и ordering
Delivery at-least-once. ACK 2xx только после durable enqueue; receiver dedupe event_id. Outbox → dispatcher → partner; inbound inbox → schema/auth/dedupe → transition validator → DB transaction → outbox. Webhook уведомляет о факте, не позволяет партнёру утверждать произвольный status. События могут приходить вне порядка: aggregate_version и sequence; старые игнорируются с audit, пропуски сверяются GET/pull, invalid переходы в exception queue. Timestamp не единственный критерий порядка.
RFC delivery timeout 10 s; retries 1m/5m/15m/1h/6h/24h + jitter, затем DLQ. 429 учитывать Retry-After; 5xx/network retry; 400 schema/403/404 как permanent до ручного исправления; 401 refresh token один раз (для OAuth контракта). После потери ACK не создавать новый event ID. Manual replay сохраняет event ID и добавляет attempt ID, actor/reason в audit.

## L1 deeplink/postback
Клиентский deeplink содержит непрозрачный, короткоживущий attribution_token; не phone/email/диагноз. Partner сохраняет token → external_order_id mapping. Postback сообщает event_id, external_order_id, canonical order_id если известен, action, amount_minor/currency, occurred_at. Token проверяется на purpose/expiry/signature. Если purchase создаётся на стороне партнёра, отдельный `/integration/conversions` contract нужно согласовать; нельзя вызывать trusted channel create-order из произвольного postback.
CSV статусов: batch_id, row_number, external_order_id, event_id, action, amount_minor, currency, occurred_at, reason. Validate preview, per-row errors, commit receipt. Повтор batch/row не дублирует действие. Ручное исполнение L0 — тот же pipeline команд.

## Sandbox и promotion
Раздельные credentials/DB namespace/webhook destinations, environment в auth context и сущностях. Нет реальной оплаты, выплат или сообщений клиентам. Сценарии: normal path, duplicate command, duplicate webhook, wrong tenant, unknown ID, invalid transition, late event, cancellation, refund, dispute, callback downtime, rate limit, code exhaustion. Passed run + approval операции дают production activation; UI «тест пройден» не authoritative.

## Ошибки / limits
| HTTP | Код | Реакция |
|---|---|---|
| 400 | MALFORMED_REQUEST | исправить JSON/headers |
| 401/403 | UNAUTHENTICATED / FORBIDDEN | reauth / scope; чужой объект обычно 404 |
| 404 | NOT_FOUND | сверить mapping, не раскрывать tenant |
| 409 | INVALID_TRANSITION / VERSION_CONFLICT / IDEMPOTENCY_CONFLICT | fetch current, исправить команду |
| 422 | VALIDATION_FAILED | field errors |
| 429 | RATE_LIMITED | Retry-After + jitter |
| 503 | TEMPORARILY_UNAVAILABLE | retry исходного idempotency key |
RFC baseline: 60 command requests/min/credential, burst20; read120/min, upload отдельно. Числа требуют load-test и согласования, не обещанный SLA. Pagination cursor, limit 1–100. Error envelope: code,message,request_id,retryable,field_errors. Никогда не логировать access token/secret/полный промокод.

## SLA / observability
OPEN: uptime, API latency p95/p99, delivery latency, срок подтверждения/исполнения, support severity response/resolution, RPO/RTO, retention. Не путать время первого ответа с решением. Следить за backlog age, callback delivery lag, invalid transitions, duplicate rate, DLQ, code balance, status freshness. Breaker при массовом сбое партнёра, stop new acceptance без удаления existing orders. Регулярная reconcile pull/read сверяет потерянные события.

## Версионирование
URL `/v1`; payload schema_version; offer snapshot и settlement policy version. Совместимые поля добавлять optional. Breaking change через новую major и период совместимости; срок deprecation OPEN. Коннектор имеет connector_version и contract_version; исторические события парсятся исторической схемой.
