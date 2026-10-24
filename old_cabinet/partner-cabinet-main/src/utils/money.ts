import type { MinorMoney } from '@/mock-api/types'

const CURRENCY_SYMBOL: Record<string, string> = { RUB: '₽' }

/** Денежные суммы всегда хранятся как целое число minor units + валюта — форматирование
 *  только для отображения (SOURCE: MED_HANDOFF/07_DATA_MODEL.md). */
export function formatMoney(money: MinorMoney): string {
  const major = money.amountMinor / 100
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: major % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(major)
  return `${formatted} ${CURRENCY_SYMBOL[money.currency] ?? money.currency}`
}

export function formatMoneyMinor(amountMinor: number, currency = 'RUB'): string {
  return formatMoney({ amountMinor, currency: currency as MinorMoney['currency'] })
}
