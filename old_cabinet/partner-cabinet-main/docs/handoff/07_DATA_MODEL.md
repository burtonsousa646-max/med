# Data Model — каноническая модель / RFC
SOURCE S03 p8, S04 slide12: Partner → Outlet → Offer → Order → Status → Settlement → Event Log. Это смысловая цепочка, не буквальная линейная схема foreign keys. Status — история состояний заказа; Event Log относится ко всем агрегатам.

Общие поля: id UUID, created_at/updated_at UTC, version integer; tenant-owned строки partner_id. Денежные значения BIGINT minor units + currency; commission decimal/rational по policy; float запрещён. Hard-delete финансовой истории запрещён; retention и право доступа OPEN.

| Entity | Ключевые поля | Связи / invariants |
|---|---|---|
| Partner | legal_name, tax_id, jurisdiction, legal_form, risk_status, lifecycle_status, kam_user_id | UNIQUE(jurisdiction,tax_id), данные реквизитов версионируются |
| Outlet | partner_id, address, geo, timezone, hours, channel_type, status | принадлежит partner; online допускает service area |
| User | IAM_subject, display_name, contact_ref, status | уникальный subject, не автоматически owner всех tenant |
| Membership | user_id, partner_id, role, status | UNIQUE(user,partner); scoped roles |
| Invitation | partner_id, role, invite_token_hash, expires_at, accepted_at | одноразовый токен, no plaintext |
| DocumentVersion | type, version, content_ref, sha256, effective_at, status | текст принятой версии неизменяем |
| Acceptance | partner_id, document_version_id, signatory_id, authority_ref, evidence_ref, accepted_at | UNIQUE(partner,document_version,acceptance_type) |
| CheckRequest | partner_id, input_version, provider, status, risk_level, reason, reviewer_id | история; draft изменения не меняют проверенный snapshot |
| BankDetailsVersion | partner_id, encrypted_details_ref, verified_at, effective_at | payout только verified active version |
| Offer | partner_id, current_live_version, lifecycle_status | stable ID; drafts отдельно |
| OfferVersion | offer_id, revision, type, benefit, prices, currency, rules, dates, limits, support_policy_id, commission_policy_id, moderation_status | UNIQUE(offer_id,revision); published snapshot immutable |
| OfferOutlet | offer_version_id, outlet_id | many-to-many, общий partner |
| CodeBatch / CouponCode | offer_version_id, batch_id, code_hash, encrypted_value, expiry, status, reserved_order_id | unique code scope, атомарное reservation/redeem |
| Integration | partner_id, level, connector, connector_version, environment, lifecycle_status, credentials_ref, config_ref | secrets отдельно, среда изолирована |
| ExternalMapping | integration_id, entity_type, external_id, canonical_id | UNIQUE(integration,entity_type,external_id) |
| WebhookSubscription | integration_id, URL, event_types, secret_ref, status | safe URL, rotation |
| Order | partner_id, outlet_id, offer_id, offer_version, integration_id, customer_token, source_channel, quantity, price_snapshot, amount_minor, currency, lifecycle_status, payment_status, dispute_status, environment | immutable commercial snapshot; tenant matches offer/outlet |
| StatusHistory | order_id, from_status, to_status, action, aggregate_version, occurred_at, received_at, actor, evidence_ref | UNIQUE(order_id,aggregate_version) |
| PaymentTransaction | order_id, provider_id, external_payment_id, amount_minor, currency, status | independent payment ID; UNIQUE(provider,external_payment_id) |
| Refund | order_id, payment_id, external_refund_id, amount_minor, status, reason | сумма успешных refunds ≤ captured amount |
| Dispute | order_id, case_id, status, opened_at, resolved_at, decision | один/несколько кейсов; блокирует eligible payout по policy |
| CommissionPolicyVersion | model, rate/fixed_fee, trigger, refund_policy, tax_policy_ref, effective_dates | CPA/CPS/RS не общий 20%; не меняет прошлый заказ |
| Settlement | partner_id, period_from/to, currency, scheme, status, totals, document_refs | totals = line sums, scheme соответствует collector |
| SettlementLine | settlement_id, order_id, ledger_entry_id, gross, fee, hold, payable, adjustment | order может участвовать в поздней корректировке другой периода |
| LedgerEntry | order_id, type, amount_minor, currency, policy_version, source_event_id, reversal_of | append-only; refund создаёт reversal/adjustment |
| SupportCase / Message | partner_id, order_id/offer_id, priority, owner, due_at, status; author, text, attachment_ref | сообщения persist; audit; safe content |
| CampaignRequest | partner_id, offer_version_id, criteria, desired_channels, status | пожелания, не доступ к клиентской базе |
| Notification | recipient_id, partner_id, event_id, severity, read_at | dedupe(recipient,event,type) |
| EventLog / Inbox / Outbox | event_id, aggregate_id/version, correlation/causation, producer, hashes, payload_ref, processing_status | event unique, durable commit |
| DeliveryAttempt | event_id, subscription_id, attempt, result, next_retry_at | journal/replay без нового business event |
| IdempotencyRecord | tenant/credential, environment, operation, key, payload_hash, response, expires_at | UNIQUE(scope,operation,key) |
| TestRun | integration_id, environment, suite_version, results, evidence | sandbox-only, gate evidence |

## Constraints / indexes
FK на tenant-consistent aggregates; фильтрация partner_id не заменяется скрытым UI. Индексы partner+status+created_at для списков, integration+external_id для mapping, outbox status+next_retry для dispatch, case owner+due_at для SLA. Оптимистическая version + SELECT/conditional update для transition; reservation кода и order insert в одной транзакции.
Купон может дать скидку на услугу, поэтому цена купона и оборот услуги — разные поля. One order may have multiple payment/refund/ledger entries. Closed lifecycle не означает paid settlement.

## Seed mapping HTML → canonical
| HTML | Canonical | Caveat |
|---|---|---|
| OF-… | offer display_id | canonical UUID отдельно |
| MD-… | order display_id | не unified production ID |
| offer name in order/campaign | offer_id + version | нельзя связывать по изменяемому имени |
| live/review/draft | published/in_review/draft | paused/rejected/expired отсутствуют |
| new/done/issue | created/fulfilled/needs_attention | issue не обязательно dispute, new нельзя считать confirmed |
| price string | coupon_price_minor/currency + display metadata | ручная миграция «от…», не auto parse economy |
| payout | calculated settlement estimate | demo 80% не contract |
