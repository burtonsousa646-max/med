import clsx from 'clsx'
import { Check, Clock } from 'lucide-react'
import { INTEGRATION_LEVELS, type IntegrationLevelValue } from '@/content/integrationLevels'
import { FIT_LABEL, modelsForLevel } from '@/content/offerModels'
import { FIT_STYLE } from '@/components/offers/OfferModelPicker'

/** Выбор уровня интеграции карточками: для каждого — как работает, для каких офферов
 *  подходит, что нужно от партнёра и за какой срок запускается. */
export function IntegrationLevelPicker({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: IntegrationLevelValue
  onChange: (value: IntegrationLevelValue) => void
  disabled?: boolean
  /** Короткие карточки без подробностей — для онбординга. */
  compact?: boolean
}) {
  if (compact) return <CompactPicker value={value} onChange={onChange} disabled={disabled} />
  return (
    <div className="flex flex-col gap-2">
      <div
        role="radiogroup"
        aria-label="Уровень интеграции"
        className="grid grid-cols-1 gap-3 md:grid-cols-2"
      >
        {INTEGRATION_LEVELS.map((level) => {
          const selected = level.value === value
          return (
            <button
              key={level.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(level.value)}
              className={clsx(
                'flex flex-col gap-2 rounded-bee-lg border p-4 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bee-brand-tertiary',
                selected
                  ? 'border-bee-brand-primary bg-bee-surface-yellow/30 ring-1 ring-bee-brand-primary'
                  : 'border-bee-border-secondary bg-bee-bg-secondary hover:border-bee-brand-primary/60',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-bee-pill bg-bee-el-active px-2 py-0.5 text-caption font-medium text-bee-light">
                    {level.value}
                  </span>
                  <span className="text-body-accent-sm font-medium text-bee-content-primary">{level.title}</span>
                </div>
                {selected && <Check size={18} className="shrink-0 text-bee-content-primary" />}
              </div>

              <p className="text-caption text-bee-content-secondary">{level.how}</p>

              <div>
                <p className="text-caption font-medium text-bee-content-primary">Подходит для:</p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {level.suits.map((item) => (
                    <li key={item} className="flex gap-1.5 text-caption text-bee-content-secondary">
                      <span aria-hidden="true">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-caption font-medium text-bee-content-primary">Модели офферов:</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {modelsForLevel(level.value).map(({ model, fit }) => (
                    <span
                      key={model.id}
                      className={clsx('rounded-bee-pill px-2 py-0.5 text-caption', FIT_STYLE[fit])}
                    >
                      {model.title}: {FIT_LABEL[fit]}
                    </span>
                  ))}
                </div>
              </div>

              <p className="text-caption text-bee-content-tertiary">
                <span className="font-medium">Не подходит:</span> {level.notFor}
              </p>
              <p className="text-caption text-bee-content-tertiary">
                <span className="font-medium">Нужно от вас:</span> {level.needs}
              </p>

              <span className="mt-auto inline-flex w-fit items-center gap-1 rounded-bee-pill bg-bee-el-secondary px-2 py-0.5 text-caption font-medium text-bee-content-secondary">
                <Clock size={12} /> Запуск: {level.launch}
              </span>
            </button>
          )
        })}
      </div>
      <p className="text-caption text-bee-content-tertiary">
        Не уверены — начните с L0: он запускается за день, а перейти на другой уровень можно в любой момент.
      </p>
    </div>
  )
}

function CompactPicker({
  value,
  onChange,
  disabled,
}: {
  value: IntegrationLevelValue
  onChange: (value: IntegrationLevelValue) => void
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label="Уровень интеграции" className="flex flex-col gap-2">
      {INTEGRATION_LEVELS.map((level) => {
        const selected = level.value === value
        return (
          <button
            key={level.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(level.value)}
            className={clsx(
              'flex items-start justify-between gap-3 rounded-bee-lg border p-4 text-left transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bee-brand-tertiary',
              selected
                ? 'border-bee-brand-primary bg-bee-surface-yellow/30 ring-1 ring-bee-brand-primary'
                : 'border-bee-border-secondary bg-bee-bg-secondary hover:border-bee-brand-primary/60',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-bee-pill bg-bee-el-active px-2 py-0.5 text-caption font-medium text-bee-light">
                  {level.value}
                </span>
                <span className="text-body-accent-sm font-medium text-bee-content-primary">{level.compactTitle}</span>
              </div>
              <p className="mt-1 text-caption text-bee-content-secondary">{level.short}</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-bee-pill bg-bee-el-secondary px-2 py-0.5 text-caption font-medium text-bee-content-secondary">
              <Clock size={12} /> Запуск: {level.launch}
            </span>
          </button>
        )
      })}
    </div>
  )
}
