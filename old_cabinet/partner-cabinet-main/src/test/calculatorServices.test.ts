import { describe, expect, it } from 'vitest'
import { CALC_SERVICES, serviceWord, type CalcServiceId } from '@/content/calculatorServices'
import { isLookupReady, lookupCompanyByInn } from '@/content/companyDirectory'

function result(id: CalcServiceId) {
  const service = CALC_SERVICES.find((s) => s.id === id)!
  return service.calculate(service.defaults)
}

describe('калькулятор-корзина — формулы по умолчанию', () => {
  it('купон: комиссия 25% с оборота 1 500 × 100', () => {
    expect(result('coupon').amount).toBe(37_500)
  })

  it('CPA: фикс 850 × 100 действий, 25 клиентов', () => {
    const r = result('cpa')
    expect(r.amount).toBe(85_000)
    expect(r.detail).toContain('25 клиентов из 100')
  })

  it('CPS: 12% с оборота 2 500 × 120', () => {
    expect(result('cps').amount).toBe(36_000)
  })

  it('подписка: 25% с платежей 499 × 500', () => {
    expect(result('subscription').amount).toBe(62_375)
  })

  it('виджет: доход партнёра 5% от оборота переходов (20 000 × 2% × 2 500 ₽)', () => {
    expect(result('widget').amount).toBe(50_000)
  })

  it('нулевые вводные не дают отрицательных сумм', () => {
    for (const service of CALC_SERVICES) {
      const zero = Object.fromEntries(Object.keys(service.defaults).map((k) => [k, 0]))
      expect(service.calculate(zero).amount).toBe(0)
    }
  })

  it('склонение «услуга/услуги/услуг»', () => {
    expect(serviceWord(0)).toBe('0 услуг')
    expect(serviceWord(1)).toBe('1 услуга')
    expect(serviceWord(3)).toBe('3 услуги')
    expect(serviceWord(5)).toBe('5 услуг')
  })
})

describe('поиск организации по ИНН (демо)', () => {
  it('срабатывает только на 10 или 12 цифр', () => {
    expect(isLookupReady('770708389')).toBe(false)
    expect(isLookupReady('7707083893')).toBe(true)
    expect(isLookupReady('500100732259')).toBe(true)
    expect(isLookupReady('77070838930')).toBe(false)
  })

  it('один и тот же ИНН всегда возвращает одну организацию, ОГРН — 13 цифр', () => {
    const a = lookupCompanyByInn('7707083893')
    const b = lookupCompanyByInn('7707083893')
    expect(a.legalName).toBe(b.legalName)
    expect(a.legalForm).toBe('ООО')
    expect(a.ogrn).toMatch(/^\d{13}$/)
  })

  it('12-значный ИНН даёт ИП с 15-значным ОГРНИП', () => {
    const ip = lookupCompanyByInn('500100732259')
    expect(ip.legalForm).toBe('ИП')
    expect(ip.ogrn).toMatch(/^\d{15}$/)
  })
})
