# Business Rules
SOURCE не равно юридическому заключению. Ниже извлечение внутренней концепции и RFC; действительность правовых предпосылок не проверялась по законодательству.

| ID | Правило | Происхождение / статус |
|---|---|---|
| BR-01 | Категория не входит в исключения; риск не выше среднего | S01 p5 SOURCE; список исключений не найден в файле: ссылка на слайд16, а файл содержит12 страниц → OPEN |
| BR-02 | Партнёр готов поддерживать купоны и support SLA | S01 p5 SOURCE |
| BR-03 | Оффер лучше публичного предложения, прозрачные ограничения | S01 p5 SOURCE; comparator evidence RFC |
| BR-04 | В базовых партнёрствах цена купона ≥300 ₽ | S01 p5 SOURCE; не переносить на все локальные/CPA offers |
| BR-05 | Партнёру не гарантируется объём CVM промо | S01 p8 SOURCE |
| BR-06 | Обязательные карточки: описание, цена, партнёр, logo, codes, geo target | S01 p6 SOURCE |
| BR-07 | Изоляция внешних систем через Hub, единый ID | S03/S04 SOURCE |
| BR-08 | Возвраты/споры удерживаются до разрешения | S03 p12/S04 slide14 SOURCE; точная policy OPEN |
| BR-09 | Published условия фиксируются в заказе; новая цена только новой версии | RFC |
| BR-10 | Один код не выдаётся двум заказам; test codes не production | RFC |
| BR-11 | Выдача закрывается при expiry/limit/code exhaustion, ранее выданные права сохраняются | RFC |
| BR-12 | Партнёр не акцептует средний риск сам и не approve свои выплаты | S06 + RFC permissions |
| BR-13 | Approval/moderation и execution/payment независимы | RFC |
| BR-14 | Токены вместо клиентских профилей; диагнозы не проходят в ЛК | S03 p10/13 SOURCE intent |

## Экономика
CPA: fixed commission за agreed qualified action. CPS: fee от agreed оплаченной продажи. RevShare: доля agreed revenue base. Купон: учитывать цену купона отдельно от услуги; Bundle/wholesale — separate entitlement/закупка; co-funded promo — budget allocation. Для каждого offer policy version: payer/collector, tax basis, fee base, trigger, refund reversal, hold window, payout calendar, rounding, minimum payout. Всё это OPEN до контракта.
RFC денежный ledger append-only, corrections через reversal. Не определять rev=GMV, не считать payable=amount×0.8 без policy. Когда деньги собирает партнёр, платформа может получить commission receivable, а не платить партнёру gross-minus-fee. Эти схемы нельзя смешивать в одном dashboard без явного типа.

## Legal / consent
S01 stage-flow предлагает не регистрировать ОРД при позиционировании как услуги Билайн. Это **предложение источника**, не подтверждённое освобождение от маркировки. Legal approval нужен на схему, категории и контент.
Оферта/NDA: версия, акцепт, полномочия и evidence; правовая модель подписи OPEN. Consent: purpose/recipient/version/obtained_at/withdrawn_at, отделять service transfer от marketing consent; scope transmission data минимальный. Retention/localisation/deletion/access requests определяются legal policy. Прототип не реализует ни consent, ни legal checks.

## Fraud / abuse — RFC
Дубли ИНН/код/заказ/событие, неправомерная смена реквизитов, массовое redeem, fake fulfilment, callback spoofing → exception queue и лимиты; не делать автоматическое обвинение или payout без evidence. Экспорт CSV нейтрализует formula prefixes (=,+,-,@) в текстовых ячейках. Архив конфиденциален для разработки: не загружать исходные коммерческие материалы в публичные репозитории.
