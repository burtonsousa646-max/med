import type { components } from '../src/api.gen.ts'
export type Business = { name: string; inn: string; phone: string; category: string; website: string; city: string }
export type BusinessProfile = components['schemas']['BusinessProfile']

export function innError(value: string): string {
  if (!value) return 'Укажите ИНН бизнеса'
  if (!/^\d{10}$|^\d{12}$/.test(value)) return 'Введите 10 или 12 цифр ИНН'
  const n = [...value].map(Number)
  const sum = (weights: number[]) => weights.reduce((total, weight, i) => total + weight * n[i], 0) % 11 % 10
  const valid = n.length === 10 ? sum([2,4,10,3,5,9,4,6,8]) === n[9] : sum([7,2,4,10,3,5,9,4,6,8]) === n[10] && sum([3,7,2,4,10,3,5,9,4,6,8]) === n[11]
  return valid && !/^0+$/.test(value) ? '' : 'Проверьте цифры ИНН'
}
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.length === 11 && digits[0] === '8' ? '+7' + digits.slice(1) : '+' + digits
}
export function phoneError(value: string): string {
  if (!value.trim()) return 'Укажите контактный телефон'
  return /^[+\d\s()−-]+$/.test(value) && /^\+7[3489]\d{9}$/.test(normalizePhone(value)) && !/^(\d)\1{9}$/.test(normalizePhone(value).slice(2)) ? '' : 'Введите российский номер: +7 и ещё 10 цифр'
}
export function formatPhone(value: string): string {
  if (phoneError(value)) return value
  const n = normalizePhone(value).slice(2)
  return `+7 (${n.slice(0,3)}) ${n.slice(3,6)}-${n.slice(6,8)}-${n.slice(8)}`
}
export const textError = (value: string, label = 'Это поле', min = 2) => value.trim().length >= min ? '' : `${label}: не менее ${min} символов`
export const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
export function normalizeBusinessWebsite(value: string): string {
  const input = value.trim()
  if (!input || input.length > 250 || /\s/.test(input)) return ''
  try {
    const url = new URL(input.includes('://') ? input : `https://${input}`)
    return ['https:', 'http:'].includes(url.protocol) && url.hostname.includes('.') && !url.username && !url.password && url.href.length <= 250
      ? url.href : ''
  } catch { return '' }
}

export const websiteError = (value: string) => value.trim() && !normalizeBusinessWebsite(value) ? 'Укажите сайт, например example.ru' : ''

export function offerTheme(value: string) {
  const category = value.trim().toLowerCase()
  if (/кофейн|^кофе$|кофе и завтрак/.test(category)) return { cat: 'food', title: 'Меню кофейни', illustration: 'own-0' } as const
  if (/^еда$|общепит|кафе|ресторан|общественного питания|доставк.*(?:ед|пицц)/.test(category)) return { cat: 'food', title: 'Познакомьтесь с нашим меню' } as const
  if (/шиномонтаж/.test(category)) return { cat: 'auto', title: 'Шиномонтаж', illustration: 'koleso' } as const
  if (/автосервис|ремонт авт|техобслуживание/.test(category)) return { cat: 'auto', title: 'Услуги автосервиса' } as const
  if (/^авто$|автобизнес|автомобил|автотовар/.test(category)) return { cat: 'auto', title: 'Предложения для автомобилистов' } as const
  if (/маникюр|ногтев/.test(category)) return { cat: 'beauty', title: 'Услуги маникюра', illustration: 'nogti' } as const
  if (/красот|космет|парикмахер|барбершоп/.test(category)) return { cat: 'beauty', title: 'Познакомьтесь с нашими услугами' } as const
  if (/продуктовый|магазин продуктов|торговля продуктами/.test(category)) return { cat: 'grocery', title: 'Посмотрите наш ассортимент', illustration: 'p5-new' } as const
  if (/рознич|магазин|маркетплейс|торговл/.test(category)) return { cat: 'grocery', title: 'Посмотрите наш ассортимент' } as const
  if (/спорт|фитнес/.test(category)) return { cat: 'sport', title: 'Найдите время для спорта' } as const
  if (/обучен|образован|языков.*школ|курсы/.test(category)) return { cat: 'fun', title: 'Познакомьтесь с программами обучения' } as const
  if (/медицин|клиник|стоматолог/.test(category)) return { cat: 'health', title: 'Узнайте больше о наших услугах' } as const
  if (/клининг|уборк/.test(category)) return { cat: 'home', title: 'Услуги уборки', illustration: 'chisto' } as const
  if (/домашн|ремонт|бытов/.test(category)) return { cat: 'home', title: 'Узнайте о наших услугах' } as const
  if (/кино|развлечен|квест|театр/.test(category)) return { cat: 'fun', title: 'Выберите, куда сходить' } as const
  return { cat: 'fun', title: '' } as const
}

export function offerSuggestion(business: Pick<Business, 'name' | 'category'>) {
  return offerTheme(business.category).title || `Познакомьтесь с нами: ${business.name.trim()}`.slice(0, 90)
}
