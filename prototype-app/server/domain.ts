// Справочники и расчёты тестового сервера. Все цифры иллюстративные: пример — кофейня с двумя точками.
// В бою справочники приходят из CMS, прогноз и статистика — из аукциона и хранилища событий.
import type { components } from '../src/api.gen.ts'

export const CO = {
  name: 'ООО «Зерно»', brand: 'кофейня «Зерно»', inn: '7701234567', kpp: '770101001', ogrn: '1227700123456',
  bank: 'АО «Альфа-Банк»', acc: '40702 810 0 0000 0012345',
  signer: 'Иванова Анна Сергеевна', signerShort: 'Иванова А. С.', role: 'генеральный директор', phone: '+7 916 000-00-00',
  employee: 'Петров Илья', site: 'mycoffee.ru',
}

export const POINTS = [
  { addr: 'ул. Покровка, 12', x: 215, y: 175 },
  { addr: 'Ленинский пр-т, 45', x: 455, y: 300 },
]
// Свободные места на карте для новых точек
export const SLOTS = [{ x: 470, y: 120 }, { x: 160, y: 360 }, { x: 330, y: 400 }]

export const PROVIDERS = [
  { id: 'gos', name: 'Госуслуги', short: 'Госуслуги' },
  { id: 'sber', name: 'СберБизнес ID', short: 'СберБизнес' },
  { id: 'alfa', name: 'Альфа ID для бизнеса', short: 'Альфа ID' },
  { id: 'inn', name: 'открытых данных', short: 'ИНН' },
] as const

export type Segment = 'small' | 'medium' | 'large'
export const SEGMENTS: Record<Segment, { name: string; hint: string }> = {
  small: { name: 'малый бизнес', hint: 'начнём с автопилота: выберете цель, остальное соберём сами' },
  medium: { name: 'средний бизнес', hint: 'откроем ручную настройку: сигналы, условия и места показа' },
  large: { name: 'крупный бизнес', hint: 'подготовим медиаплан для согласования и подключим менеджера' },
}

export type GoalId = 'near' | 'rivals' | 'showcase'
export const GOALS: Record<GoalId, { t: string; d: string; reach: number; cpc: number; conv: number; text: string; offer: string }> = {
  near: { t: 'привести соседей в точку', d: 'покажем тем, кто живёт и работает в километре от вас', reach: 12400, cpc: 9, conv: 0.26, text: 'Лучший кофе в городе — в двух шагах от дома. −20% на всё до 10:00', offer: '−20% до 10:00' },
  rivals: { t: 'перехватить клиентов конкурентов', d: 'тем, кто регулярно ходит в кофейни рядом с вами', reach: 6800, cpc: 12, conv: 0.22, text: 'Самый вкусный капучино района. Второй кофе в подарок', offer: 'второй кофе в подарок' },
  showcase: { t: 'оффер в витрине «лучшее рядом» с бонусом гигабайтами', d: 'купон в приложении билайна, гостю +5 ГБ за визит', reach: 21500, cpc: 7, conv: 0.3, text: 'Капучино за 1 ₽ при первом визите и 5 ГБ от билайна', offer: 'капучино за 1 ₽ + 5 ГБ' },
}

// Типы офферов. Основной — реклама с оплатой за переход, остальные — схемы из старого кабинета
// (купон, CPA, CPS, подписка). Путь подключения общий, отличаются условия, расчёт и подтверждение результата.
export type OfferType = 'click' | 'coupon' | 'lead' | 'promo' | 'sub'
type Field = { k: string; label: string; num?: boolean; suffix?: string; wide?: boolean }
export type OfferTypeInfo = {
  t: string; short: string; cta: string; d: string; gets: string; pay: string; fit: string
  share: boolean // true — клиент платит билайну, мы выплачиваем вам; false — вы пополняете баланс
  rate: number // доля охвата, которая становится результатом (для share-типов)
  fee: number // доля билайна, %, для share-типов
  unit: string; many: string; per: string; payFor: string; live: string; wait: string
  fields: Field[]
  via: { label: string; options: string[]; hint: string }
}
export const OFFER_TYPES: Record<OfferType, OfferTypeInfo> = {
  click: {
    t: 'реклама с оплатой за переход', short: 'переход', cta: 'запустить рекламу',
    d: 'Показываем ваш оффер в приложении билайна в нужный момент. Клиент нажимает и попадает к вам: на сайт, в Карты или звонит.',
    gets: 'ваше предложение, когда оно нужно', pay: 'за переход, показы бесплатно', fit: 'кофейни, сервисы, магазины, клиники',
    share: false, rate: 0, fee: 0, unit: 'визиты', many: 'гостей', per: 'один гость', payFor: 'за клик',
    live: 'сохранили купон', wait: 'Гости ещё идут до вас. Визиты в точку появятся завтра к 18:00, пока смотрите, как люди реагируют на объявление.',
    fields: [], via: { label: '', options: [], hint: '' },
  },
  coupon: {
    t: 'купон со скидкой', short: 'купон', cta: 'подключить купоны',
    d: 'Клиент заранее покупает купон в приложении билайна, а потом приходит к вам и показывает его на кассе.',
    gets: 'скидку по оплаченному купону', pay: 'комиссию с погашенного купона', fit: 'кафе, салоны красоты, развлечения',
    share: true, rate: 0.03, fee: 20, unit: 'погашенные купоны', many: 'купонов', per: 'вам за купон', payFor: 'комиссия с купона',
    live: 'купили купон', wait: 'Купоны покупают сразу, а погашать на кассе начнут завтра. Выплата за погашенные — 1 декабря.',
    fields: [{ k: 'what', label: 'что в купоне', wide: true }, { k: 'price', label: 'цена купона', num: true, suffix: '₽' }, { k: 'old', label: 'обычная цена', num: true, suffix: '₽' }],
    via: { label: 'как гасить купон', options: ['код в кабинете', 'приложение кассира', 'коннектор к кассе'], hint: 'кассир вводит код с телефона гостя, купон сгорает' },
  },
  lead: {
    t: 'оплата за заявку', short: 'заявка', cta: 'подключить заявки',
    d: 'Клиент оставляет заявку, регистрируется или ставит ваше приложение. Дальше вы работаете с ним сами.',
    gets: 'продукт или услугу по заявке', pay: 'фикс за подтверждённую заявку', fit: 'банки, страхование, онлайн-школы',
    share: false, rate: 0, fee: 0, unit: 'заявки', many: 'заявок', per: 'цена заявки', payFor: 'за заявку',
    live: 'оставили заявку', wait: 'Заявки уже приходят. Отметьте, какие подтверждены, за 7 дней — после этого засчитаем сами.',
    fields: [{ k: 'what', label: 'на что заявка', wide: true }, { k: 'price', label: 'плачу за заявку', num: true, suffix: '₽' }],
    via: { label: 'куда отправлять заявки', options: ['почта', 'Битрикс24', 'amoCRM', 'API'], hint: 'имя и телефон клиента, с его согласия' },
  },
  promo: {
    t: 'промокод на покупку', short: 'промокод', cta: 'подключить промокод',
    d: 'Клиент получает промокод и покупает на вашем сайте. За возвраты не платите.',
    gets: 'скидку на вашем сайте', pay: 'процент с оплаченной покупки', fit: 'интернет-магазины, доставка, билеты',
    share: false, rate: 0, fee: 0, unit: 'покупки', many: 'покупок', per: 'комиссия с покупки', payFor: '% с покупки',
    live: 'скопировали промокод', wait: 'Покупки по коду увидим после первой выгрузки заказов. Комиссию спишем через 14 дней, когда пройдёт срок возврата.',
    fields: [{ k: 'code', label: 'промокод' }, { k: 'off', label: 'скидка', num: true, suffix: '%' }, { k: 'fee', label: 'комиссия билайну', num: true, suffix: '%' }, { k: 'check', label: 'средний чек', num: true, suffix: '₽' }],
    via: { label: 'как передадите заказы', options: ['файл раз в неделю', 'постбэк', 'коннектор 1С'], hint: 'нужны сумма заказа и возвраты, без данных клиента' },
  },
  sub: {
    t: 'подписка на сервис', short: 'подписка', cta: 'подключить подписку',
    d: 'Клиент подключает ваш сервис и платит каждый месяц со счёта телефона, пока подписка активна.',
    gets: 'пробный период и оплату со счёта', pay: 'долю каждого платежа', fit: 'кино, музыка, облако, курсы',
    share: true, rate: 0.008, fee: 30, unit: 'подписки', many: 'подписок', per: 'вам с подписки в месяц', payFor: 'доля платежа',
    live: 'начали пробный период', wait: 'Идёт пробный период. Первые платные продления — через неделю, выплата раз в месяц.',
    fields: [{ k: 'what', label: 'что в подписке', wide: true }, { k: 'price', label: 'в месяц', num: true, suffix: '₽' }, { k: 'trial', label: 'бесплатно', num: true, suffix: 'дн.' }],
    via: { label: 'как выдать доступ', options: ['коды доступа', 'API'], hint: 'включаем и отключаем доступ при оплате и отмене' },
  },
}

// Модерация: превосходная степень без подтверждения
export const STOP = [
  { re: /лучший[^.,—]*?в городе|лучший/i, why: 'превосходная степень без подтверждения, п. 1 ч. 3 ст. 5 закона «О рекламе»', fix: 'Свежая обжарка каждый день' },
  { re: /самый [а-яё]+/i, why: '«самый» без подтверждения данными, п. 1 ч. 3 ст. 5 закона «О рекламе»', fix: 'Наш' },
]

export const WIDE_MARKUP = 30 // широкая карточка в витрине, % к цене клика или результата
export const IMAGES = ['чашка кофе на тёмном фоне', 'латте-арт на светлом фоне', 'кофейные зёрна на фиолетовом фоне']

export type Value = 'hot' | 'week' | 'wide' | 'off'
export type Signal = { id: string; t: string; v: Value; reach: number; cpc: number }
const sig = (id: string, t: string, v: Value, reach = 0, cpc = 0): Signal => ({ id, t, v, reach, cpc })
export const SIGNALS: { g: string; items: Signal[] }[] = [
  { g: 'жизненные события', items: [sig('moved', 'переехали в район', 'week', 1900, 14), sig('phone', 'купили новый смартфон', 'hot', 800, 16), sig('trip', 'поездка через 7–30 дней', 'week', 1200, 12), sig('policy', 'полис ОСАГО истекает через 14 дней', 'week', 600, 15), sig('home', 'новоселье после ипотеки', 'week', 300, 14)] },
  { g: 'деньги', items: [sig('salary', 'день зарплаты', 'hot', 3100, 11), sig('up', 'стали тратить больше', 'wide', 2600, 8), sig('stress', 'денежные трудности', 'off')] },
  { g: 'момент на экране', items: [sig('paid', 'платёж прошёл', 'hot', 4200, 10), sig('traffic', 'трафик заканчивается', 'hot', 1500, 9), sig('showcase', 'открыл Витрину выгод', 'hot', 5200, 8)] },
  { g: 'место и маршруты', items: [sig('live', 'живут рядом, 1 км', 'wide', 7400, 7), sig('work', 'работают рядом, 1 км', 'wide', 5000, 7), sig('route', 'каждый день проезжают мимо', 'wide', 6100, 6), sig('rival', 'ходят в кофейни рядом', 'week', 2900, 12), sig('tourist', 'приезжие в городе', 'week', 1700, 10)] },
  { g: 'образ жизни', items: [sig('car', 'автовладельцы', 'wide', 4400, 6), sig('kids', 'семьи с детьми', 'wide', 3600, 6), sig('pets', 'владельцы питомцев', 'wide', 2100, 6)] },
  { g: 'ваши клиенты', items: [sig('base', 'ваша база гостей, файл', 'wide', 900, 5), sig('look', 'похожие на лучших гостей', 'wide', 3300, 8)] },
]
export const SIG: Record<string, Signal> = Object.fromEntries(SIGNALS.flatMap(g => g.items.map(s => [s.id, s])))

export type PlaceId = 'showcase' | 'main' | 'paid' | 'rest' | 'shop' | 'push' | 'tv'
export const PLACES: { id: PlaceId; t: string; f: string; ctr: number | null; pay: 'клик' | 'показы' }[] = [
  { id: 'showcase', t: 'Лучшее рядом', f: 'витрина предложений рядом с абонентом', ctr: 3.1, pay: 'клик' },
  { id: 'push', t: 'Пуш', f: 'только тем, кто согласился на рекламу', ctr: 4.0, pay: 'клик' },
  { id: 'rest', t: 'Экран остатков', f: 'награда гигабайтами', ctr: 2.2, pay: 'клик' },
  { id: 'paid', t: '«Платёж прошёл»', f: 'карточка после оплаты', ctr: 1.6, pay: 'клик' },
  { id: 'shop', t: 'Магазин в приложении', f: 'продвигаемый товар', ctr: 1.4, pay: 'клик' },
  { id: 'main', t: 'Главная приложения', f: 'баннер', ctr: 0.5, pay: 'клик' },
  { id: 'tv', t: 'Меню ТВ', f: 'баннер с QR-кодом', ctr: null, pay: 'показы' },
]

export const PAY_METHODS = [
  { id: 'sbp', name: 'СБП для бизнеса', hint: 'зачисление за 10 секунд, без комиссии', largeOnly: false },
  { id: 'card', name: 'бизнес-карта', hint: 'любая карта юрлица, зачисление сразу', largeOnly: false },
  { id: 'invoice', name: 'счёт-оферта', hint: 'зачисление 1–3 дня, запуск после оплаты', largeOnly: false },
  { id: 'post', name: 'постоплата', hint: 'лимит 500 000 ₽, счёт в конце месяца', largeOnly: true },
] as const

/* ───────── расчёты ───────── */
type S = components['schemas']
export type Clock = S['Session']['clock']
export const BONUS = 3000

export const DEFAULT_TERMS: Record<OfferType, Record<string, string>> = {
  click: {},
  coupon: { what: 'капучино и круассан', price: '350', old: '700', via: 'код в кабинете' },
  lead: { what: 'дегустация кофе для офиса', price: '600', via: 'почта' },
  promo: { code: 'ZERNO15', off: '15', fee: '8', check: '1200', via: 'файл раз в неделю' },
  sub: { what: 'кофейный абонемент на 30 чашек', price: '2490', trial: '7', via: 'коды доступа' },
}

// Кампания, как она хранится: то, что задаёт партнёр, плюс служебные даты. Вычисляемое — в view()
export type CampaignRow = Omit<S['Campaign'], 'name' | 'adText' | 'launchStep' | 'deal' | 'forecast' | 'moderation' | 'launchedAt' | 'totals' | 'trackingUrl' | 'partnerEventAt'> & {
  adText: string | null; approved: boolean; submittedAt: string | null
}

export const catalog = (): S['Catalog'] => ({
  offerTypes: (Object.entries(OFFER_TYPES) as [OfferType, OfferTypeInfo][]).map(([id, { rate: _, ...o }]) => ({ id, ...o })),
  goals: (Object.entries(GOALS) as [GoalId, (typeof GOALS)[GoalId]][]).map(([id, g]) => ({ id, t: g.t, d: g.d, reach: g.reach, cpc: g.cpc })),
  signals: SIGNALS.map(g => ({ g: g.g, items: g.items.map(({ id, t, v }) => ({ id, t, v })) })),
  places: PLACES,
  providers: [...PROVIDERS],
  segments: (Object.entries(SEGMENTS) as [Segment, { name: string; hint: string }][]).map(([id, x]) => ({ id, ...x })),
  payMethods: [...PAY_METHODS],
  images: IMAGES,
  bonus: BONUS,
  wideMarkup: WIDE_MARKUP,
})

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
export function deal(c: CampaignRow) {
  const t = c.terms, T = OFFER_TYPES[c.type], num = (k: string) => +t[k] || 0
  switch (c.type) {
    case 'coupon': return { name: `купон: ${t.what}`, line: `${num('price')} ₽ вместо ${num('old')} ₽ · комиссия ${T.fee} %`, offer: `${t.what} за ${num('price')} ₽`, cta: `купить за ${num('price')} ₽`, text: `${cap(t.what)} за ${num('price')} ₽ вместо ${num('old')} ₽. Купон в приложении билайна`, per: num('price') * (1 - T.fee / 100) }
    case 'lead': return { name: `заявки: ${t.what}`, line: `${num('price')} ₽ за подтверждённую заявку`, offer: t.what, cta: 'оставить заявку', text: `${cap(t.what)}. Оставьте заявку, перезвоним за 15 минут`, per: num('price') }
    case 'promo': return { name: `промокод ${t.code}`, line: `−${num('off')} % по коду ${t.code} · ${num('fee')} % с оплаченной покупки`, offer: `−${num('off')} % по промокоду`, cta: 'получить промокод', text: `−${num('off')} % на заказ на ${CO.site} по промокоду ${t.code}`, per: num('check') * num('fee') / 100 }
    case 'sub': return { name: `подписка: ${t.what}`, line: `${num('price')} ₽ в месяц, ${num('trial')} дней бесплатно · доля билайна ${T.fee} %`, offer: `${num('trial')} дней бесплатно`, cta: `попробовать ${num('trial')} дней`, text: `${cap(t.what)}: ${num('trial')} дней бесплатно, потом ${num('price')} ₽ в месяц со счёта телефона`, per: num('price') * (1 - T.fee / 100) }
    default: return { name: c.mode === 'manual' ? 'своя аудитория' : GOALS[c.goal].t, line: 'оплата за переход, показы бесплатно', offer: GOALS[c.goal].offer, cta: 'перейти', text: GOALS[c.goal].text, per: 0 }
  }
}

// Купон и подписка не требуют пополнения: клиент платит билайну, мы выплачиваем партнёру
export const payAmount = (c: CampaignRow) => (OFFER_TYPES[c.type].share ? 0 : c.amount ?? c.budget)

function audience(aud: Record<string, string>) {
  const by = (k: string) => Object.entries(aud).filter(([, v]) => v === k).map(([id]) => SIG[id]).filter(Boolean)
  const any = by('any'), and = by('and'), not = by('not')
  let reach = any.reduce((a, x) => a + x.reach, 0) * 0.8
  and.forEach(x => (reach *= Math.min(0.6, x.reach / 6000 + 0.2)))
  reach *= 1 - not.length * 0.08
  const all = [...any, ...and]
  const cpc = all.length ? all.reduce((a, x) => a + x.cpc, 0) / all.length + and.length * 1.5 : 0
  return { reach: Math.max(0, reach), cpc, empty: any.length + and.length === 0 }
}

export function forecast(c: CampaignRow, activePoints: number): S['Forecast'] {
  const k = activePoints / 2, manual = c.mode === 'manual'
  const g = GOALS[c.goal], a = audience(c.audience)
  const T = OFFER_TYPES[c.type], wide = c.wideCard && c.places.showcase ? 1 + WIDE_MARKUP / 100 : 1
  const cpc = (manual ? a.cpc || 9 : g.cpc) * wide
  const conv = manual ? 0.24 : g.conv
  const reach = (manual ? a.reach : g.reach) * k
  const clicks = c.budget / cpc, visits = clicks * conv, amount = payAmount(c)
  const guest = visits ? c.budget / visits : 0
  // results — главный результат типа (для перехода — визиты), per — цена одного результата, money — потратите или получите
  let results = visits, per = guest, money = c.budget
  if (c.type !== 'click') {
    per = Math.max(deal(c).per, 1) * (T.share ? 1 : wide) // у купона и подписки широкая карточка входит в комиссию
    if (T.share) { results = reach * T.rate; money = results * per } else results = c.budget / per
  }
  return { reach, cpc, clicks, visits, guest, results, per, money, amount, payClicks: amount / cpc, payVisits: (amount / cpc) * conv, payResults: per ? amount / per : 0, audienceEmpty: a.empty }
}

export function stopHit(text: string) {
  for (const s of STOP) {
    const m = text.match(s.re)
    if (m) return { word: m[0], why: s.why, fix: s.fix }
  }
  return null
}

// Запуск после отправки: проверка 1,6 с, маркировка до 2,8 с, подключение до 4 с, потом показы
const STEPS_MS = [1600, 2800, 4000]
const LAUNCHED = ['moderation', 'live', 'paused'] as const
export const launched = (c: CampaignRow) => (LAUNCHED as readonly string[]).includes(c.status)

export function view(c: CampaignRow, activePoints: number, clock: Clock, partnerEventAt: string | null = null): S['Campaign'] {
  const d = deal(c), adText = c.adText ?? d.text, hit = stopHit(adText)
  const since = c.submittedAt ? Date.now() - Date.parse(c.submittedAt) : 0
  let status = c.status, launchStep = launched(c) ? 3 : 0, launchedAt: string | null = null
  if (c.status === 'moderation') {
    if (hit) { status = 'rejected'; launchStep = 0 } else {
      launchStep = STEPS_MS.filter(ms => since >= ms).length
      if (launchStep === 3) status = 'live'
    }
  }
  if (launched(c) && status !== 'rejected' && c.submittedAt) launchedAt = new Date(Date.parse(c.submittedAt) + STEPS_MS[2]).toISOString()
  const { approved: _a, submittedAt: _s, ...rest } = c
  const st = status === 'live' || status === 'paused' ? stats(c, clock, activePoints) : null
  return { ...rest, wideCard: !!c.wideCard /* у кампаний до появления поля его нет */, partnerEventAt, landingUrl: landingOf(c), trackingUrl: trackingUrl(c), status, name: d.name, adText, launchStep, launchedAt, deal: { line: d.line, offer: d.offer, cta: d.cta }, forecast: forecast(c, activePoints), moderation: hit, totals: st && { clicks: st.clicks, results: st.results } }
}

/* ───────── отслеживание ───────── */
// Срок на спор, дней: заявку партнёр проверяет звонком, заказ по промокоду ждёт окончания срока возврата
export const DISPUTE_DAYS: Partial<Record<OfferType, number>> = { lead: 7, promo: 14 }
export const KIND: Record<Exclude<OfferType, 'click'>, S['Conversion']['kind']> = { coupon: 'redeem', lead: 'lead', promo: 'order', sub: 'renewal' }

// click_id тестового сервера: номер кампании внутри, чтобы найти её без таблицы кликов
export const newClickId = (campaignId: number) => `bl${campaignId}x${Math.random().toString(16).slice(2, 10)}`
export const clickCampaign = (clickId: string) => Number(/^bl(\d+)x[0-9a-f]{4,}$/.exec(clickId)?.[1] ?? NaN)

export const landingOf = (c: CampaignRow) => c.landingUrl ?? `https://${CO.site}` // кампании, созданные до появления поля
export function trackingUrl(c: CampaignRow) {
  const url = landingOf(c)
  return `${url}${url.includes('?') ? '&' : '?'}utm_source=beeline&utm_medium=${c.type}&utm_campaign=${c.id}&click_id={click_id}`
}

// Сколько списано с баланса на момент демо-часов
export function spent(c: CampaignRow, clock: Clock) {
  if (OFFER_TYPES[c.type].share || !launched(c)) return 0
  return clock === 'h48' ? 380 : Math.round(Math.min(c.budget * 0.64, payAmount(c) + BONUS))
}

// Выплата партнёру по купону и подписке: целое число результатов
export function payout(c: CampaignRow, clock: Clock, activePoints: number) {
  if (!OFFER_TYPES[c.type].share || !launched(c)) return { count: 0, due: 0, per: 0 }
  const f = forecast(c, activePoints), count = Math.round(f.results * (clock === 'd14' ? 0.5 : 0.02))
  return { count, due: Math.round(count * f.per), per: f.per }
}

export function stats(c: CampaignRow, clock: Clock, activePoints: number): S['Stats'] {
  const f = forecast(c, activePoints), T = OFFER_TYPES[c.type], click = c.type === 'click'
  const pay = payout(c, clock, activePoints)
  const hourly = [2, 4, 3, 7, 9, 6, 5, 8, 11, 9, 14, 12].map((value, i) => ({ label: `${String(8 + i).padStart(2, '0')}:00`, value }))
  const base = { clock, reachTotal: Math.round(f.reach), per: f.per, cpc: f.cpc, payout: pay.due, hourly }
  if (clock === 'h48') return { ...base, reach: 4120, impressions: 2350, clicks: 42, ctr: 1, results: click ? 17 : 6, returning: 0, spent: spent(c, clock), daily: [], breakdownBy: 'places', breakdown: [], tips: [] }
  const k = c.budget / 10000
  const money = Math.min(c.budget * 0.64, payAmount(c) + BONUS)
  const clicks = Math.round(money / f.cpc)
  const results = Math.round(click ? clicks * (f.visits / f.clicks) : T.share ? f.results * 0.5 : money / f.per)
  const daily = [8, 20, 30, 45, 40, 60, 55, 50, 65, 75, 60, 80, 90, 100].map((v, i) => ({ label: `${i + 1} ноя`, value: Math.round(v * results / 900) }))
  const manual = c.mode === 'manual'
  const rows: [string, number, number, number][] = manual
    ? [['живут рядом, 1 км', 0.56, 2.4, 37], ['работают рядом, 1 км', 0.3, 3.8, 27], ['ходят в кофейни рядом', 0.14, 6.1, 41]]
    : [['Лучшее рядом', 0.56, 3.1, 31], ['«Платёж прошёл»', 0.28, 1.6, 38], ['Главная приложения', 0.16, 0.5, 44]]
  const many = (x: number) => `ещё ≈ ${Math.max(2, Math.round(x))} ${T.many}`
  const tips = [
    click ? { id: 'morning', title: 'поднять ставку утром', detail: `ещё ≈ ${Math.round(60 * k)} гостей за клик 14 ₽`, doneTitle: 'ставка утром 14 ₽' }
      : { id: 'morning', title: 'показывать чаще утром', detail: many(results * 0.15), doneTitle: 'утром показываем чаще' },
    { id: 'rest', title: 'добавить экран остатков', detail: click ? 'у кофеен рядом гость дешевле на 20 %' : `${many(results * 0.2)} от тех, у кого кончается трафик`, doneTitle: 'экран остатков подключён' },
  ].map(t => ({ ...t, applied: c.tips.includes(t.id) }))
  return {
    ...base, reach: Math.round(f.reach * 0.8), impressions: clicks * 56, clicks, ctr: 1.2, results, returning: click ? Math.round(results * 0.22) : 0,
    spent: spent(c, clock), daily, breakdownBy: manual ? 'signals' : 'places', tips,
    breakdown: rows.map(([label, share, ctr, guest]) => ({ label, clicks: Math.round(clicks * share), ctr, results: Math.round(results * share), per: click ? guest : Math.round(f.per) })),
  }
}
