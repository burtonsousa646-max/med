import type { HTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import clsx from 'clsx'

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'rounded-bee-xl border border-bee-border-secondary bg-bee-bg-secondary p-6 shadow-[0_1px_2px_rgba(20,20,20,0.03)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

export function MetricTile({
  label,
  value,
  footnote,
  trend,
  to,
}: {
  label: string
  value: ReactNode
  footnote?: ReactNode
  trend?: { direction: 'up' | 'down' | 'flat'; label: string }
  /** Если задан — плашка становится ссылкой на соответствующий раздел. */
  to?: string
}) {
  const trendTone =
    trend?.direction === 'up'
      ? 'text-bee-success-tertiary'
      : trend?.direction === 'down'
        ? 'text-bee-error-tertiary'
        : 'text-bee-content-secondary'
  const tile = (
    <Card
      className={clsx(
        'flex h-full flex-col gap-2 p-5',
        to && 'transition-colors group-hover:border-bee-brand-primary group-hover:bg-bee-surface-yellow/20',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-caption font-medium text-bee-content-secondary">{label}</span>
        {to && (
          <ArrowUpRight
            size={14}
            aria-hidden="true"
            className="shrink-0 text-bee-content-tertiary transition-colors group-hover:text-bee-content-primary"
          />
        )}
      </div>
      <span className="text-headline-sm font-medium text-bee-content-primary">{value}</span>
      <div className="flex items-center gap-2">
        {trend && <span className={clsx('text-caption font-medium', trendTone)}>{trend.label}</span>}
        {footnote && <span className="text-caption text-bee-content-tertiary">{footnote}</span>}
      </div>
    </Card>
  )
  if (!to) return tile
  return (
    <Link
      to={to}
      className="group block rounded-bee-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bee-brand-tertiary focus-visible:ring-offset-2"
    >
      {tile}
    </Link>
  )
}
