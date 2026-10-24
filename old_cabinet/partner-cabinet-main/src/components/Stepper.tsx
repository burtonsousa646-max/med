import { Check } from 'lucide-react'
import clsx from 'clsx'

export interface StepDef {
  key: string
  label: string
}

export type StepState = 'done' | 'here' | 'upcoming'

export function Stepper({
  steps,
  activeKey,
  doneKeys,
}: {
  steps: StepDef[]
  activeKey: string
  doneKeys: string[]
}) {
  return (
    <ol className="flex flex-col gap-0 sm:flex-row sm:items-start sm:gap-0">
      {steps.map((step, index) => {
        const state: StepState = doneKeys.includes(step.key)
          ? 'done'
          : step.key === activeKey
            ? 'here'
            : 'upcoming'
        const isLast = index === steps.length - 1
        return (
          <li key={step.key} className="flex flex-1 items-start gap-3 sm:flex-col sm:items-center sm:gap-2">
            <div className="flex flex-col items-center sm:w-full sm:flex-row">
              <span
                className={clsx(
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-caption font-medium',
                  state === 'done' && 'bg-bee-success-primary text-bee-light',
                  state === 'here' && 'bg-bee-brand-primary text-bee-content-primary',
                  state === 'upcoming' && 'bg-bee-el-secondary text-bee-content-tertiary',
                )}
              >
                {state === 'done' ? <Check size={14} /> : index + 1}
              </span>
              {!isLast && (
                <span
                  className={clsx(
                    'w-0.5 flex-1 self-stretch sm:h-0.5 sm:w-full sm:self-auto',
                    state === 'done' ? 'bg-bee-success-primary' : 'bg-bee-border-secondary',
                  )}
                />
              )}
            </div>
            <span
              className={clsx(
                'pt-0.5 text-caption whitespace-nowrap sm:pt-1 sm:text-center',
                state === 'here'
                  ? 'font-medium text-bee-content-primary'
                  : 'text-bee-content-tertiary',
              )}
            >
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
