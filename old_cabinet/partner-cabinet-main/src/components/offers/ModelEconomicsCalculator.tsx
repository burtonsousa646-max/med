import { useState, type ReactNode } from 'react'
import { Calculator } from 'lucide-react'
import { formatMoneyMinor } from '@/utils/money'
import type { OfferModel } from '@/mock-api/types'

/**
 * Живой калькулятор «что если» под каждую модель оффера — снимает главный барьер входа
 * (никто не хочет заполнять анкету, не понимая экономику). Ставки — пример для ориентира:
 * итоговая комиссия фиксируется политикой оффера при публикации
 * (SOURCE: 09_BUSINESS_RULES.md — «не считать payable=amount×0.8 без policy»).
 * Все расчёты — в целых рублях; в копейки переводим только при показе.
 */

type Tone = 'in' | 'out' | 'neutral'
interface Output {
  label: string
  value: number
  tone: Tone
}

const DEFAULTS = {
  rate: { voucher: 30, cps: 10, subscription: 30, cpa: 0 } satisfies Record<OfferModel, number>,
  volume: { voucher: 30, cpa: 50, cps: 30, subscription: 20 } satisfies Record<OfferModel, number>,
}

const rub = (n: number) => formatMoneyMinor(Math.round(n) * 100)
const toneClass: Record<Tone, string> = {
  in: 'text-bee-success-tertiary',
  out: 'text-bee-error-tertiary',
  neutral: 'text-bee-content-primary',
}

function NumberInput({
  label,
  value,
  onChange,
  max,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  max?: number
}) {
  return (
    <label className="flex flex-col gap-1 text-caption text-bee-content-secondary">
      {label}
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="h-9 rounded-bee-sm border border-bee-border-secondary bg-bee-bg-secondary px-3 text-body-sm text-bee-content-primary focus:outline-none focus:ring-2 focus:ring-bee-brand-tertiary"
      />
    </label>
  )
}

/** `price` — цена для клиента в рублях (для CPA не используется). */
export function ModelEconomicsCalculator({ model, price }: { model: OfferModel; price: number }) {
  const [rate, setRate] = useState(DEFAULTS.rate[model])
  const [volume, setVolume] = useState(DEFAULTS.volume[model])
  const [redemption, setRedemption] = useState(85)
  const [returns, setReturns] = useState(5)
  const [fee, setFee] = useState(150)
  const [conversion, setConversion] = useState(30)
  const [avgCheck, setAvgCheck] = useState(2000)
  const [lifetime, setLifetime] = useState(6)

  let inputs: ReactNode
  let outputs: Output[]
  let footnote: string
  let flowNote: string

  if (model === 'voucher') {
    const redeemed = (volume * redemption) / 100
    const perCoupon = price - (price * rate) / 100
    inputs = (
      <>
        <NumberInput label="Комиссия МЁД (пример), % от цены купона" value={rate} onChange={setRate} max={90} />
        <NumberInput label="Купонов продаётся в месяц, шт." value={volume} onChange={setVolume} />
        <NumberInput label="Из них погашается, %" value={redemption} onChange={setRedemption} max={100} />
      </>
    )
    outputs = [
      { label: 'С одного погашенного купона', value: perCoupon, tone: 'in' },
      { label: 'Клиенты заплатят МЁД в месяц', value: price * volume, tone: 'neutral' },
      { label: 'Вам к выплате в месяц', value: perCoupon * redeemed, tone: 'in' },
    ]
    footnote = `Комиссия МЁД за месяц (пример): ${rub((price * rate * redeemed) / 100)}`
    flowNote = 'Клиент платит МЁД, мы выплачиваем вам цену купона за вычетом комиссии — только за погашенные купоны.'
  } else if (model === 'cpa') {
    const customers = (volume * conversion) / 100
    const cost = fee * volume
    outputs = [
      { label: 'Вы платите МЁД в месяц', value: cost, tone: 'out' },
      { label: 'Цена привлечённого клиента', value: conversion > 0 ? fee / (conversion / 100) : 0, tone: 'neutral' },
      { label: 'Выручка с новых клиентов', value: customers * avgCheck, tone: 'in' },
    ]
    inputs = (
      <>
        <NumberInput label="Оплата за действие (пример), ₽" value={fee} onChange={setFee} />
        <NumberInput label="Целевых действий в месяц, шт." value={volume} onChange={setVolume} />
        <NumberInput label="Доля действий, ставших клиентами, %" value={conversion} onChange={setConversion} max={100} />
        <NumberInput label="Средний чек клиента, ₽" value={avgCheck} onChange={setAvgCheck} />
      </>
    )
    footnote =
      cost > 0
        ? `Выручка на 1 ₽ расходов: ${((customers * avgCheck) / cost).toFixed(1)} ₽`
        : 'Укажите оплату за действие, чтобы увидеть окупаемость'
    flowNote = 'Вы платите МЁД фиксированную сумму за каждое подтверждённое действие; продажа клиенту идёт напрямую у вас.'
  } else if (model === 'cps') {
    const revenue = volume * (1 - returns / 100) * price
    const commission = (revenue * rate) / 100
    inputs = (
      <>
        <NumberInput label="Комиссия МЁД (пример), % от покупки" value={rate} onChange={setRate} max={90} />
        <NumberInput label="Покупок в месяц, шт." value={volume} onChange={setVolume} />
        <NumberInput label="Доля возвратов, %" value={returns} onChange={setReturns} max={100} />
      </>
    )
    outputs = [
      { label: 'Комиссия с одной покупки', value: (price * rate) / 100, tone: 'out' },
      { label: 'Вы платите МЁД в месяц', value: commission, tone: 'out' },
      { label: 'Остаётся вам в месяц', value: revenue - commission, tone: 'in' },
    ]
    footnote = `Выручка за месяц без возвратов: ${rub(revenue)}`
    flowNote = 'Клиент платит вам напрямую; с оплаченной покупки вы отдаёте МЁД процент. Возврат уменьшает комиссию.'
  } else {
    const active = volume * lifetime
    const monthly = active * price
    inputs = (
      <>
        <NumberInput label="Доля МЁД (пример), % от платежа" value={rate} onChange={setRate} max={90} />
        <NumberInput label="Новых подписчиков в месяц, чел." value={volume} onChange={setVolume} />
        <NumberInput label="Средний срок подписки, мес." value={lifetime} onChange={setLifetime} />
      </>
    )
    outputs = [
      { label: 'Активных подписчиков в среднем', value: active, tone: 'neutral' },
      { label: 'Платежи клиентов в месяц', value: monthly, tone: 'neutral' },
      { label: 'Вам ежемесячно', value: (monthly * (100 - rate)) / 100, tone: 'in' },
    ]
    footnote = `Доля МЁД в месяц (пример): ${rub((monthly * rate) / 100)}. Первые месяцы выплаты растут по мере накопления подписчиков.`
    flowNote = 'Клиент платит за каждый период, а мы выплачиваем вам вашу долю, пока подписка активна.'
  }

  return (
    <div className="flex flex-col gap-3 rounded-bee-lg border border-bee-border-secondary bg-bee-bg-primary p-4">
      <div className="flex items-center gap-2">
        <Calculator size={16} className="text-bee-content-tertiary" />
        <p className="text-body-accent-sm font-medium text-bee-content-primary">Ориентировочная экономика</p>
      </div>
      <p className="text-caption text-bee-content-secondary">
        {flowNote} Это пример: финальные условия фиксируются политикой оффера при публикации.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{inputs}</div>

      <div className="grid grid-cols-3 gap-3 border-t border-bee-border-secondary pt-3 text-center">
        {outputs.map((o) => (
          <div key={o.label}>
            <p className="text-caption text-bee-content-tertiary">{o.label}</p>
            <p className={`text-body-accent-sm font-medium ${toneClass[o.tone]}`}>
              {o.label === 'Активных подписчиков в среднем' ? Math.round(o.value) : rub(o.value)}
            </p>
          </div>
        ))}
      </div>
      <p className="text-caption text-bee-content-tertiary">{footnote}</p>
    </div>
  )
}
