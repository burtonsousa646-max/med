import type { components } from '../src/api.gen.ts'
export type Business = { name: string; inn: string; phone: string; category: string; website: string; city: string }
export type BusinessProfile = components['schemas']['BusinessProfile']

export function innError(value: string): string {
  if (!value) return 'Укажите ИНН бизнеса.'
  if (!/^\d{10}$|^\d{12}$/.test(value)) return 'В ИНН должно быть 10 или 12 цифр.'
  const n = [...value].map(Number)
  const sum = (weights: number[]) => weights.reduce((total, weight, i) => total + weight * n[i], 0) % 11 % 10
  const valid = n.length === 10 ? sum([2,4,10,3,5,9,4,6,8]) === n[9] : sum([7,2,4,10,3,5,9,4,6,8]) === n[10] && sum([3,7,2,4,10,3,5,9,4,6,8]) === n[11]
  return valid && !/^0+$/.test(value) ? '' : 'Проверьте ИНН — контрольные цифры не совпадают.'
}
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.length === 11 && digits[0] === '8' ? '+7' + digits.slice(1) : '+' + digits
}
export function phoneError(value: string): string {
  if (!value.trim()) return 'Укажите контактный телефон.'
  return /^[+\d\s()−-]+$/.test(value) && /^\+7[3489]\d{9}$/.test(normalizePhone(value)) && !/^(\d)\1{9}$/.test(normalizePhone(value).slice(2)) ? '' : 'Введите российский номер целиком: +7 и ещё 10 цифр.'
}
export function formatPhone(value: string): string {
  if (phoneError(value)) return value
  const n = normalizePhone(value).slice(2)
  return `+7 (${n.slice(0,3)}) ${n.slice(3,6)}-${n.slice(6,8)}-${n.slice(8)}`
}
export const textError = (value: string, label = 'Это поле', min = 2) => value.trim().length >= min ? '' : `${label}: не менее ${min} символов.`
export const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
export function offerSuggestion(business: Pick<Business, 'name' | 'category'>) {
  const category = business.category.toLowerCase()
  const topic = /коф|кафе|ресторан|питан/.test(category) ? 'загляните на кофе и завтрак' : /авто|ремонт/.test(category) ? 'познакомьтесь с вашим новым сервисом' : /красот|салон|парикмах/.test(category) ? 'время для себя — рядом с вами' : /магаз|торгов/.test(category) ? 'откройте для себя любимые покупки' : 'познакомьтесь с нами поближе'
  return `${business.name.trim()}: ${topic}`.slice(0,90)
}
