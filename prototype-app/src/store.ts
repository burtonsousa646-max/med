import { useSyncExternalStore } from 'react'
import { GOALS, POINTS, SIG, type GoalId, type Pay, type PlaceId, type Point, type ProviderId, type Segment } from './data'

export type Bucket = 'any' | 'and' | 'not'
export type Tab = 'auto' | 'manual' | 'plan' | 'special'

const INIT = {
  provider: null as ProviderId | 'inn' | null,
  segment: 'small' as Segment,
  consents: { company: true, signer: true, profile: false },
  points: POINTS as Point[],
  pointsOn: { p1: true, p2: true } as Record<string, boolean>,
  budget: 10000,
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
export const campName = (s: State) => (modeOf(s) === 'manual' ? 'своя аудитория' : GOALS[s.goal].t)
export const activePoints = (s: State) => s.points.filter(p => s.pointsOn[p.id] !== false)
export const adText = (s: State) => s.adText ?? GOALS[s.goal].text
export const payAmount = (s: State) => (s.amount === 0 ? +s.customAmount.replace(/\D/g, '') || 0 : s.amount ?? s.budget)

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
  return { reach, cpc, conv, clicks, visits, guest: visits ? s.budget / visits : 0, amount, aClicks: amount / cpc, aVisits: (amount / cpc) * conv }
}

export const BONUS = 3000
export function balance(s: State) {
  if (!s.paid || (s.pay === 'invoice' && !s.invoicePaid)) return s.topups
  const spent = s.statsView === 'd14' ? Math.min(s.budget * 0.64, payAmount(s) + BONUS) : 380
  return Math.round(payAmount(s) + BONUS - spent + s.topups)
}
