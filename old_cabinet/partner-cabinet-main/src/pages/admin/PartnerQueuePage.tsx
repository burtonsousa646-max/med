import { Link } from 'react-router-dom'
import { useCheckRequests, usePartners } from '@/hooks/usePartners'
import { Card } from '@/components/Card'
import { StatusPill } from '@/components/StatusPill'
import { EmptyState } from '@/components/EmptyState'

const STATUS_TONE = { pending: 'wait', needs_info: 'bad', approved: 'good', rejected: 'bad' } as const
const STATUS_LABEL = {
  pending: 'На проверке',
  needs_info: 'Нужны уточнения',
  approved: 'Одобрено',
  rejected: 'Отклонено',
} as const

export function PartnerQueuePage() {
  const { data: checks, isLoading } = useCheckRequests()
  const { data: partners } = usePartners()

  const openChecks = (checks ?? []).filter((c) => c.status === 'pending' || c.status === 'needs_info')
  const decidedChecks = (checks ?? []).filter((c) => c.status === 'approved' || c.status === 'rejected')

  function partnerOf(partnerId: string) {
    return partners?.find((p) => p.id === partnerId)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-sm font-medium text-bee-content-primary">Партнёры</h1>
        <p className="mt-1 text-body-sm text-bee-content-secondary">
          Очередь проверки организаций. Партнёр не может одобрить проверку самостоятельно.
        </p>
      </div>

      <Card className="p-0">
        <div className="border-b border-bee-border-secondary p-4">
          <h2 className="text-body-accent-sm font-medium text-bee-content-primary">
            Требуют решения ({openChecks.length})
          </h2>
        </div>
        {isLoading ? (
          <div className="p-6 text-body-sm text-bee-content-tertiary">Загрузка…</div>
        ) : openChecks.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Очередь пуста" description="Новые заявки появятся здесь автоматически." />
          </div>
        ) : (
          <ul>
            {openChecks.map((check) => {
              const partner = partnerOf(check.partnerId)
              return (
                <li key={check.id} className="border-b border-bee-border-secondary last:border-0">
                  <Link
                    to={`/admin/partners/${check.partnerId}`}
                    className="flex items-center justify-between gap-4 p-4 hover:bg-bee-el-secondary"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-body-accent-sm font-medium text-bee-content-primary">
                        {partner?.legalName ?? check.partnerId}
                      </p>
                      <p className="text-caption text-bee-content-tertiary">
                        Заявка от {new Date(check.createdAt).toLocaleDateString('ru-RU')}
                        {check.reason ? ` · ${check.reason}` : ''}
                      </p>
                    </div>
                    <StatusPill tone={STATUS_TONE[check.status]}>{STATUS_LABEL[check.status]}</StatusPill>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {decidedChecks.length > 0 && (
        <Card className="p-0">
          <div className="border-b border-bee-border-secondary p-4">
            <h2 className="text-body-accent-sm font-medium text-bee-content-primary">Решено недавно</h2>
          </div>
          <ul>
            {decidedChecks.slice(0, 10).map((check) => {
              const partner = partnerOf(check.partnerId)
              return (
                <li key={check.id} className="border-b border-bee-border-secondary last:border-0">
                  <Link
                    to={`/admin/partners/${check.partnerId}`}
                    className="flex items-center justify-between gap-4 p-4 hover:bg-bee-el-secondary"
                  >
                    <span className="text-body-sm text-bee-content-primary">
                      {partner?.legalName ?? check.partnerId}
                    </span>
                    <StatusPill tone={STATUS_TONE[check.status]}>{STATUS_LABEL[check.status]}</StatusPill>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
