import { audienceGroups } from './campaign-draft.ts'
import { normalizeBusinessWebsite } from './campaign-business.ts'
import type { Tone } from './campaign-offer.ts'

export type Profile = { inn: string; company: string; addr: string; category?:string; website?: string }
export type MvpSession = { role?: 'staff' | 'admin'; email: string; profile: Profile | null }
export type PromoPhoto = { name: string; src: string }
export type Promo = MvpTargeting & { code: string; off: string; cond: string; site: string; till: string; fee?: string; check?: string; via?: string; design?: string; photo?: PromoPhoto; usePhoto?: boolean }
export type PartnerCampaignStatus = import('../src/api.gen.ts').components['schemas']['PartnerCampaignStatus']
export type Receipt = { status: PartnerCampaignStatus; publicId: string | null; id: string; profile: Profile; promo: Promo; submittedAt: number }
export type ReceiptSummary = { status: PartnerCampaignStatus; id: string; code: string; company: string; submittedAt: number }
export const VIA = ['файл раз в неделю', 'постбэк', 'коннектор 1С']

export const designs: { file: string; label: string; tone: Tone }[] = [
  { file: 'coffee-ivory.png', label: 'Светлый', tone: 'violet' },
  { file: 'coffee-teal.png', label: 'Бирюзовый', tone: 'teal' },
  { file: 'coffee-takeaway.png', label: 'Кофе с собой', tone: 'dark' },
]
export type MvpTargeting = {
  addresses?: string[]; online?: boolean; mode?: 'auto' | 'manual'; area?: string; city?: string
  gender?: string; age?: string; income?: string; moment?: string; wishes?: string
}
export const [geo, gender, age, income, moment] = audienceGroups
export const whenLabel = (value: string) => ['в любой момент', 'после переезда', 'в день зарплаты'][moment.choices.indexOf(value)] ?? value
export const filters = [
  { key: 'gender', group: gender }, { key: 'age', group: age }, { key: 'income', group: income },
  { key: 'moment', group: moment },
] as const

// Drafts from the first combined form already contain the partner's manual choices.
export const modeOf = (t: MvpTargeting) => t.mode ?? (t.area || t.moment ? 'manual' : 'auto')
export const areaOf = (t: MvpTargeting) => {
  const area = modeOf(t) === 'manual' ? t.area ?? geo.choices[0] : geo.choices[0]
  return t.online && area === geo.choices[0] ? geo.choices[2] : area
}
const normalized = (address: string) => address.trim().toLowerCase().replace(/\s+/g, ' ')
export function addressError(addresses: string[], index: number) {
  const address = normalized(addresses[index])
  if (address.length < 5) return 'Укажите город, улицу и дом'
  return addresses.some((other, i) => i !== index && normalized(other) === address) ? 'Эта точка уже добавлена' : ''
}
export function targetingErrors(t: MvpTargeting) {
  const addresses = t.addresses?.length ? t.addresses : ['']
  return {
    addresses: !t.online && addresses.some((_, i) => addressError(addresses, i)) ? 'Проверьте адреса точек' : '',
    city: areaOf(t) === geo.choices[1] && (t.city ?? '').trim().length < 2 ? 'Укажите город показа' : '',
  }
}
export function submittedTargeting(t: MvpTargeting): MvpTargeting {
  const mode = modeOf(t), area = areaOf(t)
  return {
    mode, area, city: area === geo.choices[1] ? t.city?.trim() : undefined,
    online: !!t.online, addresses: t.online ? [] : t.addresses?.map(address => address.trim()),
    gender: mode === 'manual' ? t.gender : undefined, age: mode === 'manual' ? t.age : undefined,
    income: mode === 'manual' ? t.income : undefined, moment: mode === 'manual' ? t.moment : undefined,
    wishes: mode === 'manual' ? t.wishes?.trim() : undefined,
  }
}
export function audienceText(t: MvpTargeting) {
  const area = areaOf(t)
  const place = area === geo.choices[1] ? t.city?.trim() || area : area === geo.choices[0] ? 'рядом с точками' : area
  if (modeOf(t) === 'auto') return 'Автоматически · ' + place + ' · широкая аудитория · в любой момент'
  const portrait = filters.slice(0, 3).filter(({key, group}) => t[key] && t[key] !== group.choices[0])
    .map(({key, group}) => group.title + ' — ' + t[key])
  return [place, ...portrait, whenLabel(t.moment ?? moment.choices[0]), t.wishes?.trim()].filter(Boolean).join(' · ')
}

const moscowDay = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Moscow', year:'numeric', month:'2-digit', day:'2-digit'})
export const promoDay = (days = 0) => moscowDay.format(Date.now() + days * 86_400_000)

export const promoErrors = (p: Promo) => ({
  code: /^[A-ZА-ЯЁ0-9]{4,20}$/.test(p.code) ? '' : 'от 4 до 20 букв и цифр, без пробелов',
  off: /^\d{1,2}$/.test(p.off) && +p.off >= 1 && +p.off <= 90 ? '' : 'от 1 до 90 %',
  cond: p.cond.length <= 60 ? '' : 'до 60 символов',
  site: normalizeBusinessWebsite(p.site) ? '' : 'укажите сайт, где сработает код',
  till: /^\d{4}-\d{2}-\d{2}$/.test(p.till) && p.till > promoDay() && new Date(p.till).toJSON()?.slice(0, 10) === p.till ? '' : 'дата в будущем',
  fee: p.fee === undefined || typeof p.fee === 'string' && /^\d{1,2}$/.test(p.fee) && +p.fee >= 3 && +p.fee <= 50 ? '' : 'от 3 до 50 %',
  check: p.check === undefined || typeof p.check === 'string' && /^\d{1,7}$/.test(p.check) && +p.check > 0 ? '' : 'сумма в рублях',
  ...targetingErrors(p),
})

export function validPromo(value: unknown): value is Promo {
  if (!value || typeof value !== 'object') return false
  const p = value as Promo
  return [p.code, p.off, p.cond, p.site, p.till].every(v => typeof v === 'string')
    && (p.via === undefined || VIA.includes(p.via)) && designs.some(d => d.file === p.design)
    && typeof p.online === 'boolean' && ['auto', 'manual'].includes(p.mode ?? '')
    && Array.isArray(p.addresses) && p.addresses.length <= 10 && p.addresses.every(a => typeof a === 'string' && a.length <= 200)
    && geo.choices.includes(p.area ?? '') && (!p.online || p.area !== geo.choices[0])
    && (p.city === undefined || (typeof p.city === 'string' && p.city.length <= 80))
    && (p.wishes === undefined || (typeof p.wishes === 'string' && p.wishes.length <= 400))
    && filters.every(({key, group}) => p[key] === undefined || group.choices.includes(p[key]!))
    && Object.values(promoErrors(p)).every(message => !message)
}
