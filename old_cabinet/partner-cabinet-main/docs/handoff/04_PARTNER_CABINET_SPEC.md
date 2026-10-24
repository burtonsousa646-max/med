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
