import { Link } from 'react-router-dom'
import { useModerationQueue } from '@/hooks/useOffers'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { StatusPill } from '@/components/StatusPill'
import { formatMoney } from '@/utils/money'
import { moderationWait } from '@/utils/sla'

export function OfferModerationQueuePage() {
  const { data: queue, isLoading } = useModerationQueue()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-sm font-medium text-bee-content-primary">Модерация офферов</h1>
        <p className="mt-1 text-body-sm text-bee-content-secondary">
          Версии офферов, ожидающие решения. Одобрение публикует версию как immutable snapshot.
        </p>
      </div>

      <Card className="p-0">
        {isLoading ? (
          <div className="p-6 text-body-sm text-bee-content-tertiary">Загрузка…</div>
        ) : !queue || queue.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Очередь пуста" description="Новые заявки появятся здесь автоматически." />
          </div>
        ) : (
          <ul>
            {queue.map(({ version, offer, partnerName }) => {
              const wait = moderationWait(version.submittedForReviewAt ?? version.createdAt)
              return (
                <li key={version.id} className="border-b border-bee-border-secondary last:border-0">
                  <Link
                    to={`/admin/offers/${offer.id}`}
                    className="flex items-center justify-between gap-4 p-4 hover:bg-bee-el-secondary"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-body-accent-sm font-medium text-bee-content-primary">
                        {offer.title}
                      </p>
                      <p className="text-caption text-bee-content-tertiary">
                        {partnerName} · версия {version.revision} · {formatMoney(version.couponPrice)}
                      </p>
                    </div>
                    <StatusPill tone={wait.overdue ? 'bad' : 'neutral'}>Ждёт {wait.label}</StatusPill>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
