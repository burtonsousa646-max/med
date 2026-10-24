/**
 * Услуги калькулятора-корзины: партнёр добавляет нужные модели (и виджет МЁД) и видит итог за месяц.
 * Формулы — в целых рублях, без float-накоплений: проценты считаются от оборота.
 */

export type CalcServiceId = 'coupon' | 'cpa' | 'cps' | 'subscription' | 'widget'

export interface CalcField {
  key: string
  label: string
}

export interface CalcResult {
  /** Сумма по услуге за месяц: комиссия МЁД, а для виджета — доход партнёра. */
  amount: number
  detail: string
}

export interface CalcServiceConfig {
  id: CalcServiceId
  title: string
  subtitle: string
  flow: string
  fields: CalcField[]
  defaults: Record<string, number>
  calculate: (values: Record<string, number>) => CalcResult
}

export const rub = (value: number): string =>
  `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.max(0, Math.round(value)))} ₽`

/** Ставка дохода партнёра с оборота покупок, пришедших через виджет МЁД. */
export const WIDGET_INCOME_RATE = 0.05

export const CALC_SERVICES: CalcServiceConfig[] = [
  {
    id: 'coupon',
    title: 'Купон',
    subtitle: 'Комиссия с погашенного купона',
    flow: 'Клиент → МЁД → Вы',
    fields: [
      { key: 'price', label: 'Цена купона, ₽' },
      { key: 'count', label: 'Погашений в месяц, шт.' },
      { key: 'rate', label: 'Комиссия МЁД, %' },
    ],
    defaults: { price: 1500, count: 100, rate: 25 },
    calculate: (v) => {
      const turnover = v.price * v.count
      const fee = (turnover * v.rate) / 100
      return { amount: fee, detail: `Партнёру к выплате ${rub(turnover - fee)}` }
    },
  },
  {
    id: 'cpa',
    title: 'Оплата за действие',
    subtitle: 'Фикс за подтверждённое действие',
    flow: 'Клиент → Вы · Вы → МЁД',
    fields: [
      { key: 'fee', label: 'Ставка за действие, ₽' },
      { key: 'actions', label: 'Действий в месяц, шт.' },
      { key: 'conversion', label: 'Станут клиентами, %' },
    ],
    defaults: { fee: 850, actions: 100, conversion: 25 },
    calculate: (v) => {
      const clients = Math.round((v.actions * v.conversion) / 100)
      return { amount: v.fee * v.actions, detail: `${clients} клиентов из ${v.actions} действий` }
    },
  },
  {
    id: 'cps',
    title: 'Процент с продаж',
    subtitle: 'Процент с подтверждённой покупки',
    flow: 'Клиент → Вы → МЁД',
    fields: [
      { key: 'check', label: 'Средний чек, ₽' },
      { key: 'purchases', label: 'Покупок в месяц, шт.' },
      { key: 'rate', label: 'Ставка МЁД, %' },
    ],
    defaults: { check: 2500, purchases: 120, rate: 12 },
    calculate: (v) => {
      const turnover = v.check * v.purchases
      return { amount: (turnover * v.rate) / 100, detail: `Оборот ${rub(turnover)}` }
    },
  },
  {
    id: 'subscription',
    title: 'Подписка',
    subtitle: 'Доля регулярного платежа',
    flow: 'Клиент → МЁД → Вы',
    fields: [
      { key: 'price', label: 'Цена подписки, ₽' },
      { key: 'subscribers', label: 'Активных подписчиков' },
      { key: 'rate', label: 'Доля МЁД, %' },
    ],
    defaults: { price: 499, subscribers: 500, rate: 25 },
    calculate: (v) => {
      const turnover = v.price * v.subscribers
      return { amount: (turnover * v.rate) / 100, detail: `Платежи ${rub(turnover)}` }
    },
  },
  {
    id: 'widget',
    title: 'Виджет МЁД',
    subtitle: 'Доход 5% от оборота переходов',
    flow: 'Переход → Покупка → 5% вам',
    fields: [
      { key: 'transitions', label: 'Переходов в месяц' },
      { key: 'conversion', label: 'Конверсия в покупку, %' },
      { key: 'check', label: 'Средний чек, ₽' },
    ],
    defaults: { transitions: 20000, conversion: 2, check: 2500 },
    calculate: (v) => {
      const turnover = ((v.transitions * v.conversion) / 100) * v.check
      return { amount: turnover * WIDGET_INCOME_RATE, detail: `Ваш доход 5% · оборот ${rub(turnover)}` }
    },
  },
]

export function serviceWord(count: number): string {
  const tail = count % 10
  const tail100 = count % 100
  const word =
    tail === 1 && tail100 !== 11 ? 'услуга' : tail >= 2 && tail <= 4 && (tail100 < 12 || tail100 > 14) ? 'услуги' : 'услуг'
  return `${count} ${word}`
}
