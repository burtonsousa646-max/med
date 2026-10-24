import clsx from 'clsx'
import { Check } from 'lucide-react'
import {
  FIT_LABEL,
  OFFER_MODELS,
  getOfferModel,
  type FitLevel,
} from '@/content/offerModels'
import { INTEGRATION_LEVELS } from '@/content/integrationLevels'
import type { OfferModel } from '@/mock-api/types'
import { MoneyFlow } from './MoneyFlow'

export const FIT_STYLE: Record<FitLevel, string> = {
  recommended: 'bg-bee-surface-green text-bee-success-tertiary',
  possible: 'bg-bee-el-secondary text-bee-content-secondary',
  not_recommended: 'bg-bee-surface-yellow text-bee-content-secondary',
}

/** Выбор модели оффера: четыре карточки со схемой денег и подробности по выбранной модели. */
export function OfferModelPicker({
  value,
  onChange,
  disabled,
}: {
  value: OfferModel
  onChange: (value: OfferModel) => void
  disabled?: boolean
}) {
  const selected = getOfferModel(value)
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Модель оффера" className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {OFFER_MODELS.map((model) => {
          const isSelected = model.id === value
          return (
            <button
              key={model.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onChange(model.id)}
              className={clsx(
                'flex flex-col gap-2 rounded-bee-lg border p-4 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bee-brand-tertiary',
                isSelected
                  ? 'border-bee-brand-primary bg-bee-surface-yellow/30 ring-1 ring-bee-brand-primary'
                  : 'border-bee-border-secondary bg-bee-bg-secondary hover:border-bee-brand-primary/60',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-body-accent-sm font-medium text-bee-content-primary">{model.title}</p>
                  <p className="text-caption text-bee-content-secondary">{model.headline}</p>
                </div>
                {isSelected && <Check size={18} className="shrink-0 text-bee-content-primary" />}
              </div>
              <MoneyFlow steps={model.flow} />
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-bee-lg border border-bee-border-secondary bg-bee-bg-primary p-4">
        <p className="text-body-sm text-bee-content-primary">{selected.how}</p>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <Detail label="Когда деньги движутся" value={selected.payTrigger} />
          <Detail label="Какая ставка" value={selected.rateHint} />
          <Detail label="Подходит для" value={selected.suits.join(' · ')} />
          <Detail label="Примеры на рынке" value={selected.examples} />
        </dl>
        <div className="flex flex-col gap-1.5 border-t border-bee-border-secondary pt-3">
          <p className="text-caption font-medium text-bee-content-primary">Какая интеграция нужна</p>
          <div className="flex flex-wrap gap-1.5">
            {INTEGRATION_LEVELS.map((level) => {
              const fit = selected.integration.fit[level.value]
              return (
                <span
                  key={level.value}
                  className={clsx('rounded-bee-pill px-2 py-0.5 text-caption', FIT_STYLE[fit])}
                  title={`${level.value} — ${level.title}`}
                >
                  {level.value}: {FIT_LABEL[fit]}
                </span>
              )
            })}
          </div>
          <p className="text-caption text-bee-content-secondary">{selected.integration.why}</p>
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-bee-content-tertiary">{label}</dt>
      <dd className="text-caption text-bee-content-secondary">{value}</dd>
    </div>
  )
}
