# State Machines — RFC с source anchors
SOURCE S03 p11/S04: Created → Confirmed → Fulfilled → Closed; cancelled/refunded/disputed. Остальные state machines и guards — предлагаемая детализация.

## Partner
draft → submitted → checking → approved → active. checking → needs_info → submitted; checking → rejected. active ↔ suspended; active/suspended → terminating → terminated.
Guards active: проверки допущены, обязательные документы приняты, реквизиты и права подтверждены. Suspended блокирует новые продажи/запуски; исторические support/settlement доступны. Terminated только после offboarding checklist, не после удаления UI аккаунта. Risk acceptance medium отдельное internal permission.

## Offer
draft → in_review → approved → scheduled → published. in_review → changes_requested → draft; in_review → rejected. published → paused → published (если действительна approved version); published/paused → expired → archived. Emergency suspension позволяет остановить выдачу немедленно.
Новая редакция published offer создаёт draft OfferVersion при сохранении старой live версии. Promotion requires current approved version, partner active, integration gate, code/limit availability, legal approvals, channel ack. Изменение price/usage/refund нельзя применять к уже купленным заказам.

## Integration
not_configured → configuring → testing → ready → active. testing → failed → configuring; active → degraded → active; active/degraded → paused → testing/active; любой рабочий status → revoked. Degraded не автоматически invalid all offers: policy определяет stop/queue/fallback. Production activation требует sandbox evidence и ops approval; secret revoked независимо от visual status.

## Order: lifecycle vs payment vs dispute
Lifecycle: created → confirmed → fulfilled → closed; created/confirmed → cancelled.
Payment: pending → authorised → captured; pending/authorised → failed/voided; captured → partially_refunded → refunded. Для external-payment схемы может быть tracked externally с evidence, не вымышленный captured.
Dispute: none → open → resolved. Display state refunded/disputed — projection трёх измерений, а не потеря underlying fulfilment status.

| Команда | Входное состояние | Guard / owner | Effect |
|---|---|---|---|
| confirm | created | партнёр; stock/code valid; version matches | confirmed + event; fee eligibility по policy |
| fulfil | confirmed | партнёр; evidence исполнения | fulfilled + event |
| cancel | created/confirmed | permitted owner, reason; fulfilment не завершено | cancelled; payment void/refund workflow отдельный |
| close | fulfilled | platform service; завершены обязательства/окно по policy | closed; settlement ещё может быть pending |
| request_refund | captured / partial refund | finance/support authorised, reason, amount bound | refund pending, hold affected funds |
| refund_succeeded | refund pending | trusted payment evidence | reversal ledger, partial/refunded projection |
| open_dispute | non-cancelled or policy permitted | support, case + evidence | dispute open, hold, SLA |
| resolve_dispute | dispute open | authorised operator | decision, release hold/refund; lifecycle сохраняется |

## Settlement
draft → reconciling → reconciled → awaiting_approval → approved → payment_pending → paid; reconciling → discrepancies → reconciling; payment_pending → failed → payment_pending. Dispute/hold действует на строки. Paid immutable: поздний refund — adjustment следующего периода, не тихое изменение paid report.

## Source contradiction
S03 p11 подписывает «сделка завершена только после Confirmed», но сама диаграмма содержит Fulfilled/Closed. S03 p12 привязывает CPA/CPS/RS к confirmed; S04 требует не выплачивать returns/disputes до закрытия. RFC различает business confirmation, commission accrual eligibility, fulfilment completion и payout eligibility. OPEN trigger каждой commission model фиксируется finance, не общей строкой `confirmed => paid`.
