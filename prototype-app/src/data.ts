// Демо-данные прототипа. Все цифры иллюстративные: пример — кофейня с двумя точками.

export const CO = {
  name: 'ООО «Зерно»', brand: 'кофейня «Зерно»', inn: '7701234567', kpp: '770101001', ogrn: '1227700123456',
  bank: 'АО «Альфа-Банк»', acc: '40702 810 0 0000 0012345',
  signer: 'Иванова Анна Сергеевна', signerShort: 'Иванова А. С.', role: 'генеральный директор', phone: '+7 916 000-00-00',
  employee: 'Петров Илья', site: 'mycoffee.ru',
}

export type Point = { id: string; addr: string; x: number; y: number }
export const POINTS: Point[] = [
  { id: 'p1', addr: 'ул. Покровка, 12', x: 215, y: 175 },
  { id: 'p2', addr: 'Ленинский пр-т, 45', x: 455, y: 300 },
]

export type ProviderId = 'gos' | 'sber' | 'alfa'
export const PROVIDERS: Record<ProviderId, { name: string; short: string; letter: string; color: string }> = {
  gos: { name: 'Госуслуги', short: 'Госуслуги', letter: 'Г', color: 'var(--color-static-blue-600)' },
  sber: { name: 'СберБизнес ID', short: 'СберБизнес', letter: 'С', color: 'var(--color-static-green-600)' },
  alfa: { name: 'Альфа ID для бизнеса', short: 'Альфа ID', letter: 'А', color: 'var(--color-static-red-600)' },
}

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
  showcase: { t: 'оффер в Витрине выгод с бонусом гигабайтами', d: 'купон в приложении билайна, гостю +5 ГБ за визит', reach: 21500, cpc: 7, conv: 0.3, text: 'Капучино за 1 ₽ при первом визите и 5 ГБ от билайна', offer: 'капучино за 1 ₽ + 5 ГБ' },
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
export function stopHit(text: string) {
  for (const s of STOP) {
    const m = text.match(s.re)
    if (m) return { word: m[0], why: s.why, fix: s.fix }
  }
  return null
}

export const IMAGES = ['фото зала с Яндекс Карт', 'латте-арт с сайта', 'логотип на фирменном фоне']

export type Value = 'hot' | 'week' | 'wide' | 'off'
export const VALUE: Record<Exclude<Value, 'off'>, { t: string; cls: string }> = {
  hot: { t: 'горячий спрос 24 ч', cls: 'bl-tag--soft-green' },
  week: { t: 'событие недели', cls: 'bl-tag--soft-violet' },
  wide: { t: 'широкий интерес', cls: 'bl-tag--soft-blue' },
}
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
  { id: 'showcase', t: 'Витрина выгод', f: 'нативная карточка', ctr: 3.1, pay: 'клик' },
  { id: 'push', t: 'Пуш', f: 'только тем, кто согласился на рекламу', ctr: 4.0, pay: 'клик' },
  { id: 'rest', t: 'Экран остатков', f: 'награда гигабайтами', ctr: 2.2, pay: 'клик' },
  { id: 'paid', t: '«Платёж прошёл»', f: 'карточка после оплаты', ctr: 1.6, pay: 'клик' },
  { id: 'shop', t: 'Магазин в приложении', f: 'продвигаемый товар', ctr: 1.4, pay: 'клик' },
  { id: 'main', t: 'Главная приложения', f: 'баннер', ctr: 0.5, pay: 'клик' },
  { id: 'tv', t: 'Меню ТВ', f: 'баннер с QR-кодом', ctr: null, pay: 'показы' },
]

// Калькулятор лендинга: средние по сферам
export const NICHES = [
  { id: 'coffee', t: 'кофейня', cpc: 9, conv: 0.26, unit: 'гостей' },
  { id: 'auto', t: 'автосервис', cpc: 14, conv: 0.18, unit: 'клиентов' },
  { id: 'beauty', t: 'салон красоты', cpc: 11, conv: 0.22, unit: 'клиентов' },
  { id: 'fitness', t: 'фитнес-клуб', cpc: 12, conv: 0.15, unit: 'визитов' },
  { id: 'dev', t: 'застройщик', cpc: 35, conv: 0.05, unit: 'визитов в офис' },
]

export const PAY_NAMES = { sbp: 'СБП для бизнеса', card: 'бизнес-карта', invoice: 'счёт-оферта', post: 'постоплата' } as const
export type Pay = keyof typeof PAY_NAMES

export const n = (v: number) => Math.round(v).toLocaleString('ru-RU')
export const rub = (v: number) => `${n(v)} ₽`
