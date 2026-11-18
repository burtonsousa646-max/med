// Порты: что платформа ждёт от каждой внешней системы, в своих терминах.
// Ядро вызывает только эти интерфейсы. За портом — заглушка (stubs.ts) или адаптер билайна (beeline/<порт>.ts).
// Деньги — копейки (number, до 2^53 хватает с запасом для одной операции), время — ISO-строки.

export type PartnerProvider = 'gos' | 'sber' | 'alfa' | 'yandex' | 'b2b'

export type ExternalCompany = { inn: string; name: string; kpp?: string; ogrn?: string; role?: string }

/** 1. Вход партнёра: ЕСИА, СберБизнес ID, Альфа ID для бизнеса, Яндекс ID, ЛК B2B билайна. OAuth / OIDC. */
export interface Idp {
  authUrl(p: { provider: PartnerProvider; state: string; redirectUri: string }): string
  exchange(p: { provider: PartnerProvider; code: string; redirectUri: string }): Promise<{
    subject: string; name: string; email?: string; phone?: string; company?: ExternalCompany
  }>
}

/** 2. Вход сотрудников билайна в бэкофис: корпоративный SSO. */
export interface StaffSso {
  authUrl(p: { state: string; redirectUri: string }): string
  exchange(p: { code: string; redirectUri: string }): Promise<{ subject: string; email: string; name: string; roles: string[] }>
}

/** 3. Реестр юрлиц: DaData, Контур.Фокус, ЕГРЮЛ. */
export interface CompanyRegistry {
  findByInn(inn: string): Promise<null | {
    inn: string; kpp?: string; ogrn: string; name: string; address: string; director?: string
    status: 'active' | 'liquidating' | 'liquidated'; risk: 'low' | 'medium' | 'high'
  }>
}

/** 4. CRM корпоративных клиентов билайна. */
export interface B2bCrm {
  findClient(inn: string): Promise<null | { clientId: string; manager?: { name: string; email: string } }>
  createLead(p: { inn: string; topic: string; details: string }): Promise<{ leadId: string }>
}

/** 5. Геокодер и гео-сервис билайна. */
export interface Geo {
  geocode(addr: string): Promise<null | { lat: number; lon: number; normalized: string }>
  reach(p: { lat: number; lon: number; radiusM: number }): Promise<{ people: number }>
}

/** 6. Эквайринг: СБП и карты. Результат оплаты приходит вебхуком payments/payment.succeeded|payment.failed. */
export interface Payments {
  create(p: { paymentId: string; method: 'sbp' | 'card'; amountKop: number; description: string; returnUrl: string }): Promise<{ externalId: string; confirmUrl: string }>
  refund(p: { paymentId: string; externalId: string; amountKop: number }): Promise<{ externalId: string }>
}

/** 7. Выписка расчётного счёта билайна: оплата счетов-оферт. */
export interface BankStatement {
  incoming(p: { since: string }): Promise<{ externalId: string; date: string; amountKop: number; payerInn: string; purpose: string }[]>
}

/** 8. Биллинг абонентов: оплата со счёта телефона, бонусы абоненту. Продления подписок — вебхуком. */
export interface SubscriberBilling {
  charge(p: { medId: string; amountKop: number; purpose: string; idempotencyKey: string }): Promise<{ externalId: string; status: 'ok' | 'declined' }>
  grantBonus(p: { medId: string; kind: 'gb' | 'minutes' | 'points'; amount: number; reason: string; idempotencyKey: string }): Promise<{ externalId: string }>
}

/** 9. Учётная система билайна (SAP / 1С): контрагенты, выручка, выплаты. */
export interface Accounting {
  syncCounterparty(p: { companyId: string; inn: string; kpp?: string; name: string; bank?: { bik: string; account: string } }): Promise<{ externalId: string }>
  postRevenue(p: { companyId: string; period: string; amountKop: number; documentIds: string[] }): Promise<{ externalId: string }>
  requestPayout(p: { payoutId: string; companyId: string; amountKop: number; bank: { bik: string; account: string } }): Promise<{ externalId: string }>
}

/** 10. Оператор ЭДО. Статусы документов — вебхуком edo/document.status. */
export interface Edo {
  invite(p: { inn: string; kpp?: string; operator?: string }): Promise<{ externalId: string; status: 'sent' | 'accepted' }>
  send(p: { documentId: string; inn: string; kind: string; fileKey: string }): Promise<{ externalId: string }>
}

/** 11. Подпись: ПЭП по SMS, КЭП. */
export interface Signature {
  request(p: { phone: string; text: string; idempotencyKey: string }): Promise<{ requestId: string }>
  verify(p: { requestId: string; code: string }): Promise<boolean>
}

/** 12. ОРД → ЕРИР: маркировка рекламы. */
export interface Ord {
  registerOrganization(p: { companyId: string; inn: string; name: string }): Promise<{ externalId: string }>
  registerContract(p: { companyId: string; orgRef: string; number: string; date: string }): Promise<{ externalId: string }>
  registerCreative(p: { creativeId: string; contractRef: string; text: string; imageUrl?: string; kind: 'banner' | 'text' | 'push' }): Promise<{ erid: string }>
  reportStats(p: { period: string; rows: { erid: string; placement: string; impressions: number; amountKop: number }[] }): Promise<{ externalId: string }>
}

/** 13. DMP / Big Data билайна: флаги сигналов в момент показа, оценка охвата. */
export interface Dmp {
  match(p: { medId: string; triggerIds: string[] }): Promise<Record<string, number>> // id → уверенность 0..1
  estimate(p: { triggerIds: string[]; lat?: number; lon?: number; radiusM?: number }): Promise<{ people: number }>
}

/** 14. Сигналы партнёров данных (X5, Альфа, страховщики) через контур билайна. Запись — как в «Триггерах», раздел 3.1. */
export type PartnerSignal = {
  signalId: string; medId: string; source: string; value: string; confidence: number
  observedAt: string; expiresAt: string; consentBasis: string; sensitivity: 'low' | 'medium'; exclusivity?: string
}
export interface CleanRoom {
  signals(p: { medId: string }): Promise<PartnerSignal[]>
}

/** 15. Реестр согласий абонентов: реклама (ст. 18 ФЗ «О рекламе»), пуши, профиль. */
export interface Consents {
  check(p: { medId: string; purpose: 'ads' | 'push' | 'profile' }): Promise<boolean>
}

/** 16. Поверхности (приложение, сайт, магазин, ЛК B2B, ТВ) — не порт: они вызывают public API платформы. */

/** 17. CVM-платформа билайна: доставка оффера в пуш, входящие, SMS. */
export interface Cvm {
  deliver(p: { medId: string; channel: 'push' | 'inbox' | 'sms'; campaignId: string; text: string; url: string; idempotencyKey: string }): Promise<{ externalId: string }>
}

/** 18. Билайн Adtech: антифрод кликов. Внешний инвентарь (OpenRTB) и выбор рекламы — следующим шагом. */
export interface Adtech {
  fraudScore(p: { clickId: string; medId?: string; ip?: string; userAgent?: string; placement: string }): Promise<{ score: number; reason?: string }>
}

/** 19. CRM партнёра (Битрикс24, amoCRM): заявки уходят партнёру. Постбэк и CSV — входящие, через cabinet/public API. */
export interface PartnerCrm {
  connectUrl(p: { companyId: string; system: 'bitrix24' | 'amocrm'; state: string; redirectUri: string }): string
  pushLead(p: { companyId: string; system: 'bitrix24' | 'amocrm'; lead: { name: string; phone: string; campaign: string; comment?: string } }): Promise<{ externalId: string }>
}

/** 20. Кассы партнёров: погашение купона — входящий вебхук pos/coupon.redeemed. Исходящих вызовов нет. */

/** 21. Уведомления партнёру: SMS-шлюз билайна, почта, Telegram. */
export interface Messaging {
  send(p: { channel: 'sms' | 'email' | 'tg'; to: string; template: string; params: Record<string, string>; idempotencyKey: string }): Promise<{ externalId: string }>
}

/** 22. Языковая модель: модерация текста и картинки. */
export interface Llm {
  moderate(p: { text: string; imageUrl?: string; offerType: string }): Promise<{
    verdict: 'ok' | 'reject' | 'review'; confidence: number; reasons: { word: string; why: string; fix: string }[]
  }>
}

/** 23. Хранилище файлов: креативы, документы. S3 облака билайна. */
export interface Storage {
  put(p: { key: string; body: Uint8Array; contentType: string }): Promise<{ key: string }>
  get(key: string): Promise<null | { body: Uint8Array; contentType: string }>
  url(key: string): string
}

/** 24. BI и хранилище данных билайна: выгрузка агрегатов. */
export interface Bi {
  export(p: { dataset: string; period: string; rows: Record<string, unknown>[] }): Promise<{ externalId: string }>
}

/** 25. Service desk билайна: обращения и спецпроекты. */
export interface Support {
  createTicket(p: { companyId: string; topic: string; text: string; contact: string }): Promise<{ externalId: string }>
}

/** 26. Мониторинг: метрики. Трассы и логи — средствами окружения. */
export interface Observability {
  metric(name: string, value: number, tags?: Record<string, string>): void
}

export type Ports = {
  idp: Idp; staffSso: StaffSso; companyRegistry: CompanyRegistry; b2bCrm: B2bCrm; geo: Geo
  payments: Payments; bankStatement: BankStatement; subscriberBilling: SubscriberBilling; accounting: Accounting
  edo: Edo; signature: Signature; ord: Ord; dmp: Dmp; cleanRoom: CleanRoom; consents: Consents; cvm: Cvm
  adtech: Adtech; partnerCrm: PartnerCrm; messaging: Messaging; llm: Llm; storage: Storage; bi: Bi
  support: Support; observability: Observability
}
export type PortName = keyof Ports
