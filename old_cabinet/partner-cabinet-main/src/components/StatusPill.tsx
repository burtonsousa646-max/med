import type { ReactNode } from 'react'
import clsx from 'clsx'

export type PillTone = 'good' | 'wait' | 'bad' | 'info' | 'neutral'

const toneClasses: Record<PillTone, string> = {
  good: 'bg-bee-surface-green text-bee-success-tertiary',
  wait: 'bg-bee-surface-yellow text-bee-brand-tertiary',
  bad: 'bg-bee-surface-red text-bee-error-tertiary',
  info: 'bg-bee-surface-blue text-bee-link-tertiary',
  neutral: 'bg-bee-el-secondary text-bee-content-secondary',
}

export function StatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-bee-pill px-3 py-1 text-caption font-medium whitespace-nowrap',
        toneClasses[tone],
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  )
}
