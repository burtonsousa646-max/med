// Калькулятор лендинга: средние по сферам. Лендинг — маркетинг, живёт без API.
export const NICHES = [
  { id: 'coffee', t: 'кофейня', cpc: 9, conv: 0.26, unit: 'гостей' },
  { id: 'auto', t: 'автосервис', cpc: 14, conv: 0.18, unit: 'клиентов' },
  { id: 'beauty', t: 'салон красоты', cpc: 11, conv: 0.22, unit: 'клиентов' },
  { id: 'fitness', t: 'фитнес-клуб', cpc: 12, conv: 0.15, unit: 'визитов' },
  { id: 'dev', t: 'застройщик', cpc: 35, conv: 0.05, unit: 'визитов в офис' },
]

export const n = (v: number) => Math.round(v).toLocaleString('ru-RU')
export const rub = (v: number) => `${n(v)} ₽`
