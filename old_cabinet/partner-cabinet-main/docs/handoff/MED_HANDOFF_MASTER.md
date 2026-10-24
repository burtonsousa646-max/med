# MED HANDOFF — единый документ

Снимок 2026-09-30. В архиве 16 разделов, 10 исходных материалов, исходный HTML, схемы Mermaid и DRAFT контракты. Скриншотов нет: браузерный runtime недоступен. JS smoke-проверки выполнены в Node VM; не являются visual QA.

# МЁД — Partner Cabinet: handoff для AI/IDE
Снимок: 30 сентября 2026. Язык продукта: русский. Пакет предназначен для продолжения разработки, а не подтверждения готовности production.

## Начать здесь
1. Прочитать этот файл, `15_AI_CODING_INSTRUCTIONS.md`, `14_DECISIONS_AND_OPEN_QUESTIONS.md`.
2. Открыть `prototype/med_partner_cabinet.html` в браузере: сборка и установка зависимостей не нужны.
3. Сопоставить семь существующих экранов с `11_UI_SCREEN_CATALOG.md` и screenshots.
4. Для backend использовать RFC в 05–08 и `contracts/`: они предложены в этом handoff и ещё не утверждены владельцами систем.
5. Выбрать задачу из 13, сохранить визуальную структуру, провести проверки соответствующего сценария.

`MED_HANDOFF_MASTER.md` объединяет все 16 разделов. Архив содержит исходный HTML, исходные материалы, схемы Mermaid, JSON Schema, пример OpenAPI и доказательства проверки.

## Метки достоверности
- **SOURCE**: положение содержится в прочитанном документе. Это не означает управленческого утверждения.
- **OBSERVED**: поведение подтверждено анализом исходного кода; runtime-проверка описана отдельно.
- **RFC**: предлагаемая детализация для разработки; не существующий API Билайна или партнёра.
- **OPEN**: нужна фиксация решения владельцем.
- **MOCK**: демонстрационные данные/действия; нельзя считать production-функцией.

## Ограничения снимка
Найден один standalone HTML-прототип. Репозиторий, commit, работающий hosted URL, backend, миграции и production design-system не предоставлены. Файл Figma, упомянутый в B2C-презентации, относится к клиентской витрине; он не проверен как дизайн ЛК. Не восстанавливать UI по презентациям при наличии HTML.
Финансовые XLSX приложены как исходные модели; формулы и актуальный утверждённый сценарий в этом пакете не аудированы. Не брать демо-комиссию 20% из HTML в бизнес-логику.

## Навигация
01 — контекст; 02 — требования; 03 — CJM; 04 — целевая спецификация ЛК; 05 — интеграционный RFC; 06 — контракты; 07 — данные; 08 — состояния; 09 — правила; 10 — архитектура; 11 — фактический UI; 12 — права; 13 — backlog; 14 — решения; 15 — master prompt.
`sources/SOURCE_REGISTER.md` содержит происхождение и границы доказательств. `MANIFEST.json` фиксирует SHA-256 каждого файла пакета.


---

# Project Context
## Продукт и ценность — SOURCE: S01, S02, S03, S04
МЁД by beeline — партнёрская платформа non-telco сервисов. Она связывает клиентские потребности, качественные предложения партнёров и клиентскую базу/каналы Билайна. ЛК — рабочее место поставщика офферов и точка входа в конвейер подключения; не самостоятельная клиентская витрина.
Клиент получает релевантную выгоду и понятный путь покупки/исполнения. Партнёр — быстрый запуск, доступ к 30+ млн клиентов через сегментацию и каналы, оплату за результат, аналитику. Билайн — удержание, NPS, доход от non-telco и монетизацию digital-активов.
Центральная задача ИТ-конвейера: массовый supply офферов в существующие каналы. Билайн изолируется от разнообразия внешних CRM/ERP/касс через Integration Hub.

## Аудитории
Локальные SMB без API; партнёры с простым digital-контуром; сети с распространённой CRM/ERP; федеральные платформы; агрегаторы поставщиков. Внутренние пользователи — КАМ, модератор, support, finance, legal, integration operations.

## Модель дохода
SOURCE S01/S04/S05: купоны, CPA, CPS, RevShare, bundle/wholesale, co-funded promo. Не все механики входят в купонный MVP. Разделять цену купона, цену услуги, GMV, выручку платформы, комиссию и выплату партнёру. Клиент может платить в контуре Билайна либо у партнёра: это разные расчётные схемы.
Публичные примеры (не подписанные API): роуминг → страховка АльфаСтрахование; переезд/домашний интернет → Профи.ру; travel/family-сценарий → онлайн-консультация СберЗдоровье. Медицинские сведения не нужны ЛК для проверки права на сервис.

## Цели и пределы
SOURCE S01 p7: AS IS 17–28 дней/10 офферов в месяц; этапы 14 дней/50, 10 дней/~100, конечная цель <7 дней/100+. S01 p2 уточняет <7 рабочих дней. S03/S04: 1000+ партнёров, 10 000+ офферов, 80% подключений/операций без ручного участия ИТ. Это цели, не достигнутые метрики.
L3 может занимать 2–6 недель; цель <7 дней не является обещанием полной кастомной API-интеграции каждому партнёру. Точный старт/стоп часов T2M — OPEN.
Gate0 S02: доказать гипотезы и подготовить MVP до 31.12.2026; Gate2 до 31.03.2027. Дорожная карта S04 относительная (0–30/31–60/61–90 дней/6–12 месяцев), её нельзя механически превращать в утверждённые календарные сроки.

## Термины
| Термин | Значение |
|---|---|
| Partner | юридический контрагент, tenant платформы |
| Outlet | точка исполнения/продаж, включая онлайн-точку |
| Offer | версионированное предложение с условиями, лимитами и экономикой |
| Купон | право на выгоду/услугу по конкретным условиям |
| Промокод | код для применения механики, не равен заказу |
| КАМ | ответственный менеджер партнёра |
| CVM/NBA | выбор аудитории/следующего предложения в контуре Билайна |
| Unified order ID | сквозной ID сделки; внешние ID хранятся как mapping |
| Settlement | сверка и финансовое закрытие группы проводок |
| Sandbox | отдельная тестовая среда без реальных платежей и ПДн |
| ДОК | обозначение службы/процесса поддержки в S01/S06; точное оргназвание уточнить |


---

# Product Requirements
Основа: S01 p5–7, S04 slides 3–18, S06. Порядок ниже — RFC backlog, не утверждение сроков.

| ID | Требование | Основа | Приёмка |
|---|---|---|---|
| PR-01 | Регистрация, организация, подписант, реквизиты, черновик | S06 stage1 | Можно вернуться к черновику после новой сессии |
| PR-02 | Проверки и риск | S01/S06 | Видны результат, причина запроса уточнений, следующий шаг |
| PR-03 | Оферта/NDA, версия и свидетельство акцепта | S01/S06 | Скачивается именно принятая версия; повтор не создаёт второй договор |
| PR-04 | Конструктор и модерация оффера | S04/S06 | Ошибки показываются по полям; изменение опубликованного оффера создаёт новую версию |
| PR-05 | L0/L1, партии кодов и тестовая сделка | S01/S04 | Дубли кодов отклоняются, тест не попадает в выплаты |
| PR-06 | Единый заказ и история статусов | S03/S04 | Повтор события не создаёт заказ/начисление |
| PR-07 | Возвраты, споры, кейсы и SLA | S04 | Есть владелец, дедлайн, доказательства, hold выплат |
| PR-08 | Взаиморасчёты, документы, реестры | S01/S04/S06 | Сумма объясняется строками реестра; есть исключения сверки |
| PR-09 | Продвижение: заявка, гео/аудитория | S01/S05 | Партнёр не получает сырые клиентские сегменты и не запускает SMS напрямую |
| PR-10 | Отчёты по офферам/каналам | S01/S06 | Метрики учитывают выбранный период и единые определения |
| PR-11 | Команда, блокировка пользователя | S06 stage4 | Заблокированный пользователь теряет сессии, API не даёт доступ |
| PR-12 | КАМ, уведомления и обращения | S01/S06 | Сообщение сохраняется и доступно после перезагрузки |

## Нефункциональные требования
SOURCE S03/S04: tenant isolation, роли и аудит, минимум ПДн, токенизация клиента, retries/queues/idempotency, наблюдаемость webhooks/status latency, масштаб 1000+ партнёров/10k+ офферов. Численные uptime/latency/throughput/retention/rate-limit — OPEN, пример параметров в 05 помечен RFC.

## MVP сквозной сценарий
Партнёр регистрируется → сохраняет профиль → проходит проверку → принимает актуальную оферту → создаёт offer draft → выбирает L0/L1 → выполняет test order → получает модерацию → оффер публикуется → реальный заказ подтверждён и исполнен → поддержка/возврат при необходимости → сверка → расчётный реестр. Не объявлять весь сценарий готовым при готовности формы создания оффера.

## Scope
Сначала закрыть одну купонную механику end-to-end. L2 коннекторы, L3 API, SSO/entitlement, подписки и AI-контент подключать после базового ядра. Коммерческие договорённости, доступ к CVM, правовые модели акцепта и выплаты нельзя заменить mock-логикой.


---

# Partner Journey / CJM
SOURCE S01 p6–7, S03 p9–12, S04, S05 p4. Детализация критериев и исключений ниже — RFC.

| Этап | Партнёр / вход | Платформа / владелец | Выход и gate | Исключения / уведомления |
|---|---|---|---|---|
| 1. Scouting | Лид: категория, гео, предложение, контакт | КАМ квалифицирует ценность и потенциал; source lead | Уникальный lead, назначен КАМ | Дубликат ИНН: связать с существующей организацией, не создать tenant |
| 2. Приглашение | Получает ссылку, подтверждает контакт | IAM проверяет приглашение, срок и роль | User + membership; организация draft | Просроченное приглашение, уже состоит в tenant, недоступен Mobile ID |
| 3. Onboarding | ИНН, юрформа, имя, адрес, реквизиты, подписант | Сохранение черновика, автозаполнение где доступно | Полный профиль; готов к проверке | Несовпадение данных, неверные реквизиты, нет полномочий |
| 4. Проверки | Отправляет организацию, дополняет документы | Risk/Legal, автоматический screening + ручные исключения | Допущен / needs_info / rejected | Средний риск: решение уполномоченного сотрудника; причина и история |
| 5. Договоры | Читает/скачивает оферту/NDA, акцептует | Legal фиксирует версию, полномочия, timestamp, доказательства | Contract accepted; gates выполнены | Новая версия до акцепта, кастомный NDA, неподтверждённый подписант |
| 6. Точки | Адреса, расписание, контакты, зона сервиса | Registry валидирует принадлежность и гео | Outlet active | Онлайн-точка, сеть, закрытие точки, несколько часовых поясов |
| 7. Оффер | Формат, выгода, цена, правила, лимиты, срок, контент, FAQ | Offer Management формирует machine-readable card | Версия draft/submitted | Скрытые условия, невыгодное публичное предложение, категория исключения |
| 8. Интеграция | Выбирает L0/L1/L2/L3, конфигурирует обмен | Integration Hub, operations; mapping ID/statuses | Connection configured | Нет API → L0; connector ещё не готов; callback недоступен |
| 9. Sandbox | Загружает test codes, проводит тест | Автотест: создание, повтор, статусы, отмена, ошибки | Test run passed, evidence | Out-of-order, replay, timeout; успешный UI toast не доказательство теста |
| 10. Модерация | Исправляет замечания, согласует контент | Модератор + Legal; проверка support/финансов | Approved version | Reject с причинами, request_changes, conflicting concurrent edit |
| 11. Публикация | Запрашивает запуск | Каналы принимают разрешённую версию; проверка лимитов/доступности | Published + channel ack | Partial failure канала: staged retry, не заявлять полный запуск |
| 12. Продвижение | Предлагает гео/соцдем/триггер/канал | CVM определяет аудиторию, контактную политику, контрольную группу | Campaign approved/scheduled | Нет обязательства минимального объёма; restricted audience |
| 13. Заказы | Получает минимальные данные, подтверждает/исполняет | Order Hub создаёт единый ID и маршрутизирует | Created → Confirmed → Fulfilled | Дубликаты, срок подтверждения, код закончился, партнёр offline |
| 14. Поддержка | Отвечает на назначенный кейс, связывается с КАМ | Support owner, таймер SLA, эскалация | Решение и evidence | Спор, возврат, повторный кейс, ПДн в свободном тексте |
| 15. Сверка | Проверяет строки/удержания, сообщает расхождения | Finance сверяет платежи, исполнение, возвраты | Settlement reconciled/approved | Нет подтверждения, hold, partial refund, поздний возврат |
| 16. Выплата | Скачивает акт/счёт/реестр, видит статус | Платёжный контур по договору; independent status | Paid/failed + payment reference | Новые реквизиты требуют проверки; повтор не платит дважды |
| 17. Аналитика | Смотрит период, оффер, канал, ошибки | BI считает согласованную воронку, качество и экономику | Рекомендации/повторный оффер | Delayed attribution, малые группы, refund-adjusted sales |
| 18. Изменение/пауза | Запрашивает изменение/остановку | Новая версия + moderation; pause защищает старые обязательства | Paused/expired/archived или новая live version | Заказы и купоны старой версии сохраняются, экстренная блокировка |
| 19. Offboarding | Завершает сотрудничество | Legal/Support/Finance закрывают obligations; revoke keys | Terminated, доступ ограничен | Незакрытые споры/выплаты не исчезают |

## T2M и ответственность
RFC измерять отдельно: time-to-onboard, time-to-integrate, time-to-offer, time-to-first-sale. Логировать моменты подачи полного пакета, запроса уточнений, проверки, акцепта, теста, approval и channel ack. Паузы из-за партнёра показывать отдельно, не удалять из полной длительности. S01 AS IS: проверки/подписание 2 дня; заведение 1 день; вывод и промо 14–25 дней. Scouting идёт постоянно.
По каждому gate хранить responsible_user_id, due_at, decision_reason и evidence. ИИ-консультант может помогать заполнению, но не принимает риски, не акцептует договор и не утверждает выплаты.


---

# ЛК партнёра — целевая Product Spec
SOURCE: S01/S04/S06. Поля, статусы, validation и guards ниже — RFC, кроме явно указанных ограничений HTML. Фактическая реализация перечислена в 11.

## Общие требования
Русский интерфейс; tenant выбирается только из разрешённых membership; действия авторизуются на сервере. Каждая запись имеет ID/статус/версию, историю, ответственного и следующий шаг. Формы: loading, empty, validation error, forbidden, network error, saved, optimistic conflict. Не показывать успех до подтверждения сохранения. UTC в данных, локальное время с пояснением на экране. Финансовые суммы — число + валюта, не текст вида «от 1200 ₽».

| Раздел / экран | Поля / данные | Действия | Guards и состояния |
|---|---|---|---|
| Вход | контакт, статус приглашения | Mobile ID (S06), повторный вход | Provider contract OPEN; локальный demo-login не является Mobile ID |
| Onboarding | ИНН, юрформа, legal_name, адрес, ОГРН/ОГРНИП, подписант, основание полномочий, банк/БИК/счёт, контакты | сохранить, отправить на проверку | Формат ИНН и контрольная сумма; для РФ 10/12 цифр в зависимости от юрформы; серверная проверка |
| Проверки | checklist, risk level, причины, документы, история | дополнить, повторно отправить | Изменение критических реквизитов открывает recheck; партнёр не утверждает риск |
| Документы | тип, версия, valid_from, hash, состояние акцепта, signatory | открыть, скачать, принять | Принять только актуальную версию при проверенных полномочиях; неизменяемое evidence |
| Организация / точки | реквизиты, адрес, гео, расписание, timezone, online/offline | редактировать draft, добавить/закрыть точку | Закрытие точки не удаляет прошлые заказы |
| Обзор | активные офферы, незакрытые задачи, продажи, SLA, сумма к выплате | перейти к объекту, создать оффер | Цифры реальны только после подключения источников; mark delayed |
| Каталог офферов | ID, версия, формат, статус, период, доступность, performance | поиск, фильтры, создать, открыть | Tenant pagination; разные состояния moderation/publishing |
| Конструктор | name, type, benefit, coupon_price, service_price, public_price, currency, dates, timezone, outlets, geography, limits, usage_rules, refund_rules, description, logo/media, FAQ, support SLA, commission model | draft, preview, submit | Обязательные поля перед submit; dates start<end; цена/лимиты неотрицательны; публичная выгода доказуема |
| Модерация | замечания по полям, версии контента, approvals | исправить, отправить, согласовать контент | Нельзя публиковать неутверждённую версию; повтор submit идемпотентен |
| Промокоды | batch ID, codes, expiry, состояния available/reserved/issued/redeemed/expired/revoked | CSV upload, preview errors, commit, отчёт | Дубли в batch и tenant выявляются; атомарная выдача, rollback reservation, коды маскируются |
| Интеграция | уровень, connector, environment, mapping, credentials metadata, endpoint, health | тест, rotate key, pause, replay authorised event | Секрет показывать один раз, хранить зашифрованно; key revoke, separate sandbox |
| Sandbox | сценарий, run ID, события, результат | создать тестовый заказ, повторить, проверить callback | Нельзя использовать реальные ПДн/платежи; production gate по обязательным тестам |
| Продвижение | approved offer version, гео, broad audience criteria, trigger, requested channels, desired dates | создать заявку, отменить заявку | Желаемый канал не гарантирует запуск; CVM имеет final approval |
| Заказы | unified ID, external ID, offer version, amount, currency, channel, token, lifecycle/payment/dispute status | открыть, подтвердить, исполнить, запросить отмену/возврат | Серверные allowed transitions, reason required; не менять через произвольный PATCH status |
| Расчёты | period, gross, refunds, fee, adjustments, holds, payable, status | скачать, disputed line, согласовать, открыть документ | Без подтверждения и сверки нет payable; расчётный статус независим от исполнения |
| Аналитика | exposures, views, purchases, confirmations, fulfilments, refunds, GMV, fee, conversion | период, оффер, канал, экспорт | Определения знаменателя, attribution window, data freshness; без персональных сегментов |
| Обращения / КАМ | case ID, order/offer ID, priority, owner, due_at, messages, attachments | создать, ответить, приложить, эскалировать | История append-only; tenant scope; не обещать email отправку без интеграции |
| Уведомления | тип, entity ref, severity, read_at | открыть объект, прочитать, настройки | Critical: нерабочие коды/жалобы S06; delivery dedupe, preferences для некритичных |
| Команда | имя, контакт, role, status, приглашение | пригласить, изменить роль, заблокировать | Нельзя удалить последнего owner; блокировка отзывает сессии |
| Admin (внутренний) | queue, partner/offer, риск, SLA, audit | assign КАМ, moderate, suspend, approve exception | S06 вход сотрудника по доменной почте; SSO contract OPEN |

## Notification matrix — RFC
| Событие | Получатель | Канал / действие |
|---|---|---|
| Проверка требует данных / завершена | partner admin + КАМ | in-app, ссылка на checklist |
| Новая версия оферты | уполномоченный подписант | in-app; email только если подключён |
| Оффер approved/rejected/paused | editor + admin | field-level reasons, audit link |
| Коды исчерпаны/неработоспособны | operations + КАМ | critical alert, при необходимости stop new orders |
| Новый заказ / SLA истекает | order manager | in-app, escalation owner |
| Возврат / спор / расхождение | finance + support | case + hold explanation |
| Сверка / выплата failed/paid | finance | settlement reference |
| Integration degraded / DLQ | developer + operations | technical alert, safe payload metadata |

## Edge cases
Двойной submit; формы из двух вкладок (version conflict); пробельное название; потеря сети после принятого POST; истекший договор; изменение цены после покупки; отсутствие live офферов при создании кампании; нехватка кодов; timezone/переход даты; частичное исполнение/возврат; поздний dispute; заблокированный user; suspended partner с незакрытыми obligations. Эти случаи требуют серверного решения, UI toast недостаточен.


---

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


---

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


---

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


---

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


---

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


---

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


---

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


---

# Roles / permissions — RFC
SOURCE S06 разделяет партнёра и сотрудника Билайна, назначение КАМ, риск medium, модерацию и team blocking. Точные role names/grants ниже предложены, не реализованы в HTML.

| Action | Owner/admin | Offer editor | Orders ops | Finance | Developer | Viewer | Internal |
|---|---|---|---|---|---|---|---|
| Профиль draft | RW | R | R | R* | R | R | КАМ R; risk/legal approve |
| Акцепт документов | при полномочиях | — | — | — | — | — | legal manages versions |
| Команда/роли | RW | — | — | — | — | — | authorised IAM admin |
| Офферы/codes | RW | RW | R* | R | R | R | moderator approves; ops emergency pause |
| Campaign request | RW | RW | — | R | — | R | CVM approves/executes |
| Заказ confirm/fulfil | W | — | W | R | API scope* | R* | ops per workflow |
| Возврат request | W* | — | W* | W* | — | — | finance/payment actual processing |
| Settlement/report | R | — | — | R/export/dispute | — | R* | finance approve, payment service execute |
| API config/keys/test | RW* | — | — | — | RW | — | integration ops |
| Support/messages | RW | own offer* | own order* | finance* | tech* | R* | support owner |
| Accept medium risk | — | — | — | — | — | — | designated risk approver |
| Publish offer | request | request | — | — | — | — | moderation + channel service |
| Audit | tenant R* | — | — | finance R* | tech R* | — | compliance / admin scope |

*Grant/detail OPEN; минимум необходимых данных. Partner owner не значит authorised signatory. Finance доступ к банковским реквизитам ограничен отдельным permission. Developer видит технические metadata, не raw ПДн. Internal access tenant-scoped по assignment или explicit privileged scope; нельзя default all partners.

## Enforcement
Сервер проверяет user status, membership, tenant, permission, entity state, expected_version. Object ID чужого tenant →404; запрещённое действие над своим →403. Audit allow/deny для sensitive commands. Secret rotation требует elevated permission, audit; secrets не возвращать GET list. Last owner protection; block user revokes sessions/invitations; integration credentials lifecycle управляется отдельно.
Финансы: maker-checker для bank change/payout approve; partner не approves payment execution. В HTML лишь надпись «Администратор», нет auth/RBAC.


---

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


---

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


---

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
