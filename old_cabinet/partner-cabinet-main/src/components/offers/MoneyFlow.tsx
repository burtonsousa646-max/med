import clsx from 'clsx'
import { ArrowRight } from 'lucide-react'
import { PARTY_LABEL, type MoneyStep, type Party } from '@/content/offerModels'

const PARTY_STYLE: Record<Party, string> = {
  client: 'bg-bee-el-secondary text-bee-content-primary',
  platform: 'bg-bee-brand-primary text-bee-content-primary',
  partner: 'bg-bee-el-active text-bee-light',
}

function Node({ party }: { party: Party }) {
  return (
    <span className={clsx('rounded-bee-pill px-2.5 py-0.5 text-caption font-medium', PARTY_STYLE[party])}>
      {PARTY_LABEL[party]}
    </span>
  )
}

/** Схема «кто кому платит» — по строке на каждый денежный поток. */
export function MoneyFlow({ steps }: { steps: MoneyStep[] }) {
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Кто кому платит">
      {steps.map((step) => (
        <li key={`${step.from}-${step.to}`} className="flex flex-wrap items-center gap-1.5">
          <Node party={step.from} />
          <ArrowRight size={14} aria-hidden="true" className="shrink-0 text-bee-content-tertiary" />
          <Node party={step.to} />
          <span className="text-caption text-bee-content-secondary">{step.label}</span>
        </li>
      ))}
    </ul>
  )
}
