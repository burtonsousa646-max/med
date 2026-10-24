# API contracts — DRAFT / RFC
Существующий HTML не вызывает backend. Ниже предлагаемый интерфейс, не выгрузка работающего сервиса. `contracts/openapi.yaml` покрывает вертикальный срез create/read/transition order; остальные endpoints — каталог для согласования, не реализованы.

## Endpoint catalogue
| Method / path | Consumer | Назначение |
|---|---|---|
| GET /v1/me | cabinet | user/memberships/permissions |
| POST /v1/partners | cabinet | организация draft, Idempotency-Key |
| GET/PATCH /v1/partners/{id} | cabinet | профиль, version guard |
| POST /v1/partners/{id}/check-requests | cabinet | инициировать проверки |
| GET /v1/partners/{id}/documents | cabinet | доступные документы/версии |
| POST /v1/documents/{id}/acceptances | signatory | свидетельство акцепта |
| GET/POST /v1/outlets | cabinet | точки tenant |
| GET/POST /v1/offers | cabinet | список/черновик |
| PATCH /v1/offers/{id}/versions/{version} | editor | draft edit, expected_version |
| POST /v1/offers/{id}/submissions | editor | новая заявка модерации |
| POST /v1/offers/{id}/pause-requests | editor | запрос паузы |
| POST /v1/offers/{id}/code-batches | editor | upload preview → commit отдельной командой |
| GET/POST /v1/integrations | developer | конфигурация без выдачи секретов списком |
| POST /v1/integrations/{id}/test-runs | developer | sandbox suite |
| POST /v1/orders | trusted channel | создание заказа; вертикальный срез |
| GET /v1/orders/{order_id} | authorised channel/partner | snapshot заказа |
| POST /v1/orders/{order_id}/transitions | partner/channel | controlled action + version |
| POST /v1/orders/{id}/refund-requests | finance/support | refund как async workflow, отдельный контракт OPEN |
| POST /v1/integration/events | partner | callback/postback inbox, schema OPEN |
| GET /v1/orders | cabinet/integration | filters + cursor |
| GET /v1/settlements | finance | периоды |
| GET /v1/settlements/{id}/lines | finance | объяснимые начисления/holds |
| POST /v1/settlements/{id}/discrepancies | finance | расхождение со ссылками на строки |
| GET /v1/reports/funnel | analyst | aggregate metrics |
| GET/POST /v1/support-cases | support | кейсы |
| POST /v1/support-cases/{id}/messages | support | persist сообщение |
| POST /v1/campaign-requests | editor | запрос канала/аудитории, не CVM send |
| GET /v1/notifications | cabinet | in-app события |
| GET/POST /v1/memberships | admin | пользователи/приглашения |
| POST /v1/memberships/{id}/block | admin | revoke sessions |

## Пример: создание заказа
```http
POST /v1/orders
Authorization: Bearer <trusted-channel-token>
Idempotency-Key: demo-order-0001
Content-Type: application/json
```
```json
{"offer_id":"22222222-2222-4222-8222-222222222222","offer_version":1,"outlet_id":"33333333-3333-4333-8333-333333333333","customer_token":"opaque-demo-token","source_channel":"beeline_app","quantity":1,"environment":"sandbox"}
```
RFC server derives partner_id, price, currency, commission policy and eligibility from approved offer snapshot. Client amount не является authoritative. Environment обязан совпасть с credentials.
```json
{"order_id":"11111111-1111-4111-8111-111111111111","partner_id":"44444444-4444-4444-8444-444444444444","offer_id":"22222222-2222-4222-8222-222222222222","offer_version":1,"outlet_id":"33333333-3333-4333-8333-333333333333","status":"created","payment_status":"pending","dispute_status":"none","amount_minor":240000,"currency":"RUB","version":1,"environment":"sandbox"}
```
## Пример: controlled transition
```json
{"action":"confirm","expected_version":1,"reason":"Принят партнёром","external_order_id":"partner-123"}
```
POST transitions c Idempotency-Key; 200 обновлённый snapshot; при stale version 409. `refund` не простой status update: создавать request, подтверждать financial effect только payment evidence. Partner не может поставить paid.

## Event payload
```json
{"event_id":"55555555-5555-4555-8555-555555555555","event_type":"order.confirmed","schema_version":"1.0","order_id":"11111111-1111-4111-8111-111111111111","aggregate_version":2,"occurred_at":"2026-09-30T04:38:25Z","environment":"sandbox","data":{"status":"confirmed","external_order_id":"partner-123"}}
```
Webhook ACK 204 после durable receipt. JSON Schema — `contracts/event.schema.json`. Validate no secrets/PII; `data` event-specific schema ещё требует расширения. Callback ошибки возвращают единый Error, accepted async события — receipt/inbox ID, не неподтверждённый «исполнено».

## CSV
UTF-8, явная delimiter/decimal policy, header, stable columns, no spreadsheet formula injection. Промокоды: code,expires_at,outlet_id (если ограничено точкой). Импорт статусов: batch/event/external IDs и action; экспорт финансов: amount_minor,currency,fee_minor,hold_minor,payable_minor,policy_version. Демореестры HTML не такой contract: они человекочитаемые CSV с `;` и BOM.
