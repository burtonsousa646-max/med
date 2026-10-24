import { useSyncExternalStore } from 'react'
import { CO, GOALS, OFFER_TYPES, POINTS, SIG, type GoalId, type OfferType, type Pay, type PlaceId, type Point, type ProviderId, type Segment } from './data'

export type Bucket = 'any' | 'and' | 'not'
export type Tab = 'auto' | 'manual' | 'plan' | 'special'

const INIT = {
  provider: null as ProviderId | 'inn' | null,
  segment: 'small' as Segment,
  consents: { company: true, signer: true, profile: false },
  points: POINTS as Point[],
  pointsOn: { p1: true, p2: true } as Record<string, boolean>,
  budget: 10000,
  otype: 'click' as OfferType,
  terms: {
    click: {},
    coupon: { what: 'капучино и круассан', price: '350', old: '700', via: 'код в кабинете' },
    lead: { what: 'дегустация кофе для офиса', price: '600', via: 'почта' },
    promo: { code: 'ZERNO15', off: '15', fee: '8', check: '1200', via: 'файл раз в неделю' },
    sub: { what: 'кофейный абонемент на 30 чашек', price: '2490', trial: '7', via: 'коды доступа' },
  } as Record<OfferType, Record<string, string>>,
  tab: null as Tab | null,
  goal: 'near' as GoalId,
  adText: null as string | null,
  img: 0,
  target: 'any' as Bucket,
  aud: { live: 'any', work: 'any', rival: 'and' } as Record<string, Bucket>,
  places: { showcase: true, main: true, paid: true, rest: false, shop: false, push: false, tv: false } as Record<PlaceId, boolean>,
  special: { type: 'game', task: '', budget: '300 000 – 1 млн ₽', sent: false },
  amount: null as number | null, // null — сумма = месячный бюджет
  customAmount: '',
  pay: 'sbp' as Pay,
  offer: false,
  role: 'boss' as 'boss' | 'staff',
  sentToBoss: false,
  approved: false,
  paid: false,
  invoicePaid: false,
  launch: 0,
  notify: { sms: true, mail: true, tg: false },
  statsView: 'h48' as 'h48' | 'd14',
  period: 14 as 7 | 14,
  paused: false,
  tips: { morning: false, rest: false },
  topups: 0,
  autoTopup: false,
  edo: false,
  edoOp: 'Диадок',
  invited: '',
}
export type State = typeof INIT

const KEY = 'ad-platform-proto-v2'
function load(): State {
  try {
    return { ...structuredClone(INIT), ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return structuredClone(INIT)
  }
}

let state = load()
const subs = new Set<() => void>()

export function update(fn: (s: State) => void) {
  const next = structuredClone(state)
  fn(next)
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* приватный режим */ }
  subs.forEach(f => f())
}
export function reset() { update(s => Object.assign(s, structuredClone(INIT))) }

export function useStore() {
  return useSyncExternalStore(cb => (subs.add(cb), () => subs.delete(cb)), () => state)
}

/* ───────── производные величины ───────── */
export const tabOf = (s: State): Tab => s.tab ?? ({ small: 'auto', medium: 'manual', large: 'plan' } as const)[s.segment]
export const modeOf = (s: State) => (tabOf(s) === 'manual' ? 'manual' : 'auto')
export const typeOf = (s: State) => OFFER_TYPES[s.otype]
export const campName = (s: State) => s.otype === 'click' ? (modeOf(s) === 'manual' ? 'своя аудитория' : GOALS[s.goal].t) : deal(s).name
export const activePoints = (s: State) => s.points.filter(p => s.pointsOn[p.id] !== false)
export const adText = (s: State) => s.adText ?? (s.otype === 'click' ? GOALS[s.goal].text : deal(s).text)

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
/* Условия оффера выбранного типа: название кампании, строка условий, текст и кнопка объявления, цена результата */
export function deal(s: State) {
  const t = s.terms[s.otype], T = OFFER_TYPES[s.otype], num = (k: string) => +t[k] || 0
  switch (s.otype) {
    case 'coupon': return { name: `купон: ${t.what}`, line: `${num('price')} ₽ вместо ${num('old')} ₽ · комиссия ${T.fee} %`, offer: `${t.what} за ${num('price')} ₽`, cta: `купить за ${num('price')} ₽`, text: `${cap(t.what)} за ${num('price')} ₽ вместо ${num('old')} ₽. Купон в приложении билайна`, per: num('price') * (1 - T.fee / 100) }
    case 'lead': return { name: `заявки: ${t.what}`, line: `${num('price')} ₽ за подтверждённую заявку`, offer: t.what, cta: 'оставить заявку', text: `${cap(t.what)}. Оставьте заявку, перезвоним за 15 минут`, per: num('price') }
    case 'promo': return { name: `промокод ${t.code}`, line: `−${num('off')} % по коду ${t.code} · ${num('fee')} % с оплаченной покупки`, offer: `−${num('off')} % по промокоду`, cta: 'получить промокод', text: `−${num('off')} % на заказ на ${CO.site} по промокоду ${t.code}`, per: num('check') * num('fee') / 100 }
    case 'sub': return { name: `подписка: ${t.what}`, line: `${num('price')} ₽ в месяц, ${num('trial')} дней бесплатно · доля билайна ${T.fee} %`, offer: `${num('trial')} дней бесплатно`, cta: `попробовать ${num('trial')} дней`, text: `${cap(t.what)}: ${num('trial')} дней бесплатно, потом ${num('price')} ₽ в месяц со счёта телефона`, per: num('price') * (1 - T.fee / 100) }
    default: return { name: GOALS[s.goal].t, line: 'оплата за переход, показы бесплатно', offer: GOALS[s.goal].offer, cta: 'перейти', text: GOALS[s.goal].text, per: 0 }
  }
}
// share-типы (купон, подписка) не требуют пополнения: клиент платит билайну, мы выплачиваем партнёру
export const payAmount = (s: State) => OFFER_TYPES[s.otype].share ? 0 : (s.amount === 0 ? +s.customAmount.replace(/\D/g, '') || 0 : s.amount ?? s.budget)

export function audience(s: State) {
  const by = (k: Bucket) => Object.entries(s.aud).filter(([, v]) => v === k).map(([id]) => SIG[id]).filter(Boolean)
  const any = by('any'), and = by('and'), not = by('not')
  let reach = any.reduce((a, x) => a + x.reach, 0) * 0.8
  and.forEach(x => (reach *= Math.min(0.6, x.reach / 6000 + 0.2)))
  reach *= 1 - not.length * 0.08
  const all = [...any, ...and]
  const cpc = all.length ? all.reduce((a, x) => a + x.cpc, 0) / all.length + and.length * 1.5 : 0
  return { any, and, not, reach: Math.max(0, reach), cpc, empty: any.length + and.length === 0 }
}

export function forecast(s: State) {
  const k = activePoints(s).length / 2
  const manual = modeOf(s) === 'manual'
  const g = GOALS[s.goal], a = audience(s)
  const cpc = manual ? a.cpc || 9 : g.cpc
  const conv = manual ? 0.24 : g.conv
  const reach = (manual ? a.reach : g.reach) * k
  const clicks = s.budget / cpc
  const visits = clicks * conv
  const amount = payAmount(s)
  const guest = visits ? s.budget / visits : 0
  // res — главный результат типа (для перехода — визиты), per — цена одного результата, money — потратите или получите
  const T = OFFER_TYPES[s.otype]
  let res = visits, per = guest, money = s.budget
  if (s.otype !== 'click') {
    per = Math.max(deal(s).per, 1)
    if (T.share) { res = reach * T.rate; money = res * per } else res = s.budget / per
  }
  return { reach, cpc, conv, clicks, visits, guest, amount, aClicks: amount / cpc, aVisits: (amount / cpc) * conv, res, per, money, aRes: amount / per }
}

export const BONUS = 3000
export function balance(s: State) {
  if (!s.paid || (s.pay === 'invoice' && !s.invoicePaid)) return s.topups
  const spent = s.statsView === 'd14' ? Math.min(s.budget * 0.64, payAmount(s) + BONUS) : 380
  return Math.round(payAmount(s) + BONUS - spent + s.topups)
}
// К выплате партнёру по share-типам: за первые 48 часов — пара процентов месячного прогноза, за 2 недели — половина
export function payout(s: State) {
  if (!s.paid) return 0
  const f = forecast(s)
  return Math.round(f.res * (s.statsView === 'd14' ? 0.5 : 0.02)) * f.per // целое число купонов или подписок
}
// Выбор типа оффера, общий для лендинга и кабинета: текст объявления и режим сборки начинаются заново
export const pickType = (t: OfferType) => update(x => { x.otype = t; x.adText = null; x.tab = null; x.launch = 0 })
