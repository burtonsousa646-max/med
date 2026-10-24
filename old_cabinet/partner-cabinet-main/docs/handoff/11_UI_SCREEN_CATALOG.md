# UI/UX prototype — каталог фактического состояния
OBSERVED по S07 `prototype/med_partner_cabinet.html`. Семь страниц в navItems, пять типов modal. Runtime evidence отдельно в `prototype/VERIFICATION.md`.

## Design tokens / layout
Inline CSS: Inter с Arial fallback; Inter не загружается из сети. Background #f7f7f5, ink #202124, yellow #f9d62f, muted #73777c, line #e8e8e5, green #137955, blue #2858a4. Desktop sidebar244px, content max1480px, card radius15px, button9px, h1 31px. Breakpoints1100/760/420px, mobile sidebar toggle, metrics2 columns, table horizontal scroll. SVG icons inline, no external image/font deps.

| Page key / функция | Назначение и компоненты | Данные / действия / переходы | Реализовано и TODO |
|---|---|---|---|
| home / home() | greeting, 4 KPI cards, day bars, channel shares, offers table, next steps | 28030 views,417 orders,1.49%,386400 payable; new-offer, offer detail, link offers, period7/30/90 | layout работает; numbers/chart статичны, period меняет подпись; onboarding checkmarks фиктивны |
| offers / offers() | counters, search, status filter, table, callout | seed4 offers; live/review/draft; поиск title/id/type; открыть detail; создать draft | in-memory CRUD create only; draft→review; edit/pause/delete/approval отсутствуют |
| campaigns / campaigns() | 3 metrics, campaign table, launch modal | seed2 campaigns; новый request для live offers, channels/audience free text | добавляется в массив review; не запускает CVM; нет проверки отсутствия live offers |
| orders / orders() | counters new/done/issue, table, detail, CSV | seed4 orders; сумма и payout; new→done в modal | нет confirm guard/evidence; wrong production lifecycle; export только demo |
| analytics / analytics() | KPI, funnel exposures→views→orders, live-offer table |64900/28030/417; conversion1.49%; period dropdown | период не фильтрует цифры; нет live data/attribution/refund adjustment |
| money / settlements() | four financial cards, ledger summary, payment explanation, CSV |483000 gross,96600 fee,386400 payable, zero refunds | 20% example hardcoded, нет actual reconciliation/payment/document |
| help / help() | fixed2 cases, suggested topics, support modal | SP-214 review/SP-188 done; topic+text | submit закрывает modal и показывает toast; текст не сохраняется и кейс не создаётся |

## Modals / field contract AS IS
| Функция | Поля и кнопки | Состояние / validation |
|---|---|---|
| newOffer() | name required maxlength70; type Купон/Промокод/Подписка/Услуга; price required free text; desc textarea; cancel/save | submit unshift {random OF-ID,name,type,draft,price,views0,sales0}; **desc читается формой, но не записывается в object**; trim после native validation допускает пробельное имя |
| offerDetail(id) | ID/type/price/status/views/sales/conversion; close; draft submit review | нет content description/edit; manual publish approval отсутствует |
| newCampaign() | name required max70; select live offer names; channel; audience; cancel/create | name trimmed, audience fallback; reference по имени, не offer ID; review only |
| orderDetail(id) | ID/date/offer/channel/sum/payout/status; close; complete for new | complete сразу done, нет confirmed stage; в памяти |
| support() | topic select; text required; cancel/save | не создаёт entity, не вызывает service; toast «сохранено» вводит в заблуждение |

## Navigation / global behavior
`render()` обновляет sidebar active/aria-current и crumb, вставляет page HTML и закрывает mobile sidebar. Search/filter reset при nav. Modal закрывается кнопкой, кликом backdrop, Escape; фокус ставится на close button, **focus trap и restore focus отсутствуют**. Notifications bell показывает fixed toast. Toast aria-live polite; duration3900ms. URLs не отражают page; reload всегда home.
CSV: BOM UTF-8, разделитель`;`, quotes escaped; numeric values demo, formula-injection guard нет. Random OF ID может столкнуться. Seed order ссылается на имя оффера, который сейчас draft; это demo inconsistency, не разрешённое production правило.

## Отсутствующие экраны
Регистрация/Mobile ID, organization/signatory/bank profile, checks/risk, accepted documents/NDA, team, code upload, integration config/health/sandbox, полноценные notifications, chat с КАМ, реальные cases, refund/dispute workflows, versioned moderation, admin panel. S06 stages — target roadmap, не реализованные HTML функции.
Не считать counters/графики доказательством продаж. Сохранять визуальный язык при переносе в framework; сперва сделать явными mock boundaries и persistence.
