import { useCurrentPartnerId } from '@/hooks/useCurrentPartnerId'
import { usePartner, useCheckRequests } from '@/hooks/usePartners'
import { Card } from '@/components/Card'
import { StatusPill } from '@/components/StatusPill'
import { EmptyState } from '@/components/EmptyState'

const STATUS_TONE = { pending: 'wait', needs_info: 'bad', approved: 'good', rejected: 'bad' } as const
const STATUS_LABEL = {
  pending: 'На проверке',
  needs_info: 'Нужны уточнения',
  approved: 'Проверка пройдена',
  rejected: 'Отклонено',
} as const

export function VerificationPage() {
  const partnerId = useCurrentPartnerId()
  const { data: partner } = usePartner(partnerId)
  const { data: checks, isLoading } = useCheckRequests(partnerId)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-sm font-medium text-bee-content-primary">Проверка</h1>
        <p className="mt-1 text-body-sm text-bee-content-secondary">
          Уровень риска: {partner?.riskStatus ?? 'не определён'}. Партнёр не подтверждает риск самостоятельно.
        </p>
      </div>

      <Card className="p-0">
        {isLoading ? (
          <div className="p-6 text-body-sm text-bee-content-tertiary">Загрузка…</div>
        ) : !checks || checks.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Заявок на проверку ещё не было" />
          </div>
        ) : (
          <ul>
            {checks.map((c) => (
              <li key={c.id} className="border-b border-bee-border-secondary p-4 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="text-body-sm text-bee-content-primary">
                    {new Date(c.createdAt).toLocaleString('ru-RU')}
                  </span>
                  <StatusPill tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</StatusPill>
                </div>
                {c.reason && <p className="mt-1 text-caption text-bee-content-tertiary">{c.reason}</p>}
                {c.reviewerLabel && (
                  <p className="mt-1 text-caption text-bee-content-tertiary">Решение: {c.reviewerLabel}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
