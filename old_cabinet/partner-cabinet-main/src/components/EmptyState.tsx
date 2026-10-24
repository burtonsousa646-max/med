import type { ReactNode } from 'react'
import { Inbox, ShieldAlert, TriangleAlert } from 'lucide-react'

function StateShell({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-bee-xl border border-dashed border-bee-border-secondary px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-bee-el-secondary text-bee-content-tertiary">
        {icon}
      </div>
      <p className="text-body-accent-sm font-medium text-bee-content-primary">{title}</p>
      {description && (
        <p className="max-w-sm text-body-sm text-bee-content-secondary">{description}</p>
      )}
      {action}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return <StateShell icon={<Inbox size={22} />} title={title} description={description} action={action} />
}

export function ErrorState({
  title = 'Не удалось загрузить данные',
  description,
  action,
}: {
  title?: string
  description?: string
  action?: ReactNode
}) {
  return (
    <StateShell icon={<TriangleAlert size={22} />} title={title} description={description} action={action} />
  )
}

export function ForbiddenState({
  title = 'Недостаточно прав',
  description,
}: {
  title?: string
  description?: string
}) {
  return <StateShell icon={<ShieldAlert size={22} />} title={title} description={description} />
}
