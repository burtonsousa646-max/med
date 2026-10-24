# Decisions / contradictions / open questions
Не найден протокол утверждения управленческих решений. SOURCE означает «в материалах», не «финально согласовано». Предложенные resolution — RFC.

## Стабильная база для продолжения
Partner Cabinet как точка взаимодействия; supply conveyor; Hub isolation; L0–L3; canonical entities и unified order ID; модерация/поддержка/расчёты как обязательные этапы; HTML является точным доступным состоянием UI. Эти положения согласуются с S01/S03/S04/S05.

| ID | Расхождение / OPEN | Источники | Resolution / владелец |
|---|---|---|---|
| Q01 | Отдельное ЮЛ/внутри, договородатель, платёжный получатель | S02 p9 «наиболее вероятное» отдельное ЮЛ; S04 список решений | CEO/legal/finance; не hardcode entity |
| Q02 | Собственная система/готовое ядро/гибрид; stack/deploy | S02/S04/S05 | CTO buy/build ADR; HTML не диктует framework |
| Q03 | <7 дней vs <7 рабочих дней; L3 2–6 недель | S01 p2/p7 vs S03 p6 | определить start/stop, рабочий календарь, SLA по level |
| Q04 | Stage1/2/3 и Gate1/2 имеют разные критерии | S01 p7 vs S02 p8 vs S04 slide17 | PM синхронизирует; не объявлять этап завершённым по календарю |
| Q05 | «Confirmed завершает сделку» vs Fulfilled/Closed | S03 p11/12, S04 slide13/14 | finance/product подтверждают отдельные accrual и payout triggers |
| Q06 | Mobile ID партнёра, domain email сотрудника | S06 | IAM provider contract, recovery, signatory binding |
| Q07 | Категории исключений не приложены | S01 p5 ссылается на slide16, PDF12pages | Risk/legal присылают authoritative registry |
| Q08 | ОРД «не требуется» | S01 p7 stage-flow | Legal подтверждает для каждого placement/schema; не принимать как blanket exemption |
| Q09 | Scope: купонный B2C или wider non-telco platform | S01 vs S02/S04/S05 | product фиксирует MVP mechanics и расширение |
| Q10 | Финмодели разного scope/версий | S01 купоны2029≈6.993млрд; S02 p11≈12.72млрд; S05 broad strategic40млрд | finance выбирает workbook/scenario; никаких blended totals |
| Q11 | Demo fee20%/payable80% | S07 | не production policy; определить collector/commission/tax/rounding |
| Q12 | Доступ к CVM/каналам, квота, SLA публикации | S02 запрос активов, S01 p8 no promo obligation | channel owner contract; не обещать доступ автоматически |
| Q13 | Готовность adapters | S03/S04 target connector list | due diligence и test env каждого vendor, не shipped feature |
| Q14 | Source support chat/обработка vs prototype toast | S01/S06 vs S07 | B08 real persistence/routing; сейчас MOCK |
| Q15 | UI пользователи/роли/cases lifecycle | S06 stages vs S07 | permissions RFC12; approvals требуются |
| Q16 | Actual repo/hosted URL/commit/backend | найден S07 standalone HTML | owner предоставляет если есть; этот архив содержит доступный source |
| Q17 | API auth/events/SLA/retention/rate limit | источники high-level only | CTO/security/ops approve RFC05; contracts draft |
| Q18 | Refund/dispute/late adjustment и window закрытия | S03/S04 | Finance/support policy matrix |
| Q19 | Критерии сегментов и consent scope | S01 self-service geo/social; S03 tokenisation | CVM/legal разрешённые поля/aggregation thresholds |
| Q20 | Purchase payment flow / balance/card/SBP | S01 p9, S02 p13 assets | payment owner decides create/capture/activation contract |

## Финансовые приложения
S08/S09 прикладываются оригинальными XLSX без переноса финансовых прогнозов в schema. Не включать персональные оклады/штатные параметры в публичную документацию UI. Перед делением пакета с внешним AI согласовать допустимость загрузки коммерческих данных; это не блокирует локальную разработку.

## ADR шаблон
Decision ID/date/status (proposed/accepted/superseded), owner, context, options, decision, consequences, source/evidence, affected API/schema/UI, rollout/migration, supersedes. Accepted только при конкретном подтверждении владельца; новая AI-среда не повышает статус гипотезы самостоятельно.
