import { Link } from 'react-router-dom'
import { useAllSettlements } from '@/hooks/useSettlements'
import { Card } from '@/components/Card'
import { StatusPill } from '@/components/StatusPill'
import { EmptyState } from '@/components/EmptyState'
import { formatMoneyMinor } from '@/utils/money'
import { SETTLEMENT_STATUS_LABEL, SETTLEMENT_STATUS_TONE } from '@/utils/statusLabels'

const ACTIONABLE = new Set(['reconciling', 'discrepancies', 'reconciled', 'awaiting_approval', 'approved', 'payment_pending', 'failed'])

export function PayoutQueuePage() {
  const { data: settlements, isLoading } = useAllSettlements()
  const actionable = settlements?.filter((s) => ACTIONABLE.has(s.status)) ?? []
  const paid = settlements?.filter((s) => s.status === 'paid') ?? []

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-sm font-medium text-bee-content-primary">Выплаты</h1>
        <p className="mt-1 text-body-sm text-bee-content-secondary">
          Периоды в процессе сверки и согласования по всем партнёрам.
        </p>
      </div>

      <Card className="p-0">
        <div className="border-b border-bee-border-secondary p-4">
          <h2 className="text-body-accent-sm font-medium text-bee-content-primary">В процессе ({actionable.length})</h2>
        </div>
        {isLoading ? (
          <div className="p-6 text-body-sm text-bee-content-tertiary">Загрузка…</div>
        ) : actionable.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Нет периодов, требующих действия" />
          </div>
        ) : (
          <ul>
            {actionable.map((s) => (
              <li key={s.id} className="border-b border-bee-border-secondary last:border-0">
                <Link
                  to={`/admin/settlements/${s.id}`}
                  className="flex items-center justify-between gap-4 p-4 hover:bg-bee-el-secondary"
                >
                  <div>
                    <p className="text-body-accent-sm font-medium text-bee-content-primary">{s.partnerName}</p>
                    <p className="text-caption text-bee-content-tertiary">
                      {new Date(s.periodFrom).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })} · к выплате{' '}
                      {formatMoneyMinor(s.payableMinor)}
                    </p>
                  </div>
                  <StatusPill tone={SETTLEMENT_STATUS_TONE[s.status]}>{SETTLEMENT_STATUS_LABEL[s.status]}</StatusPill>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {paid.length > 0 && (
        <Card className="p-0">
          <div className="border-b border-bee-border-secondary p-4">
            <h2 className="text-body-accent-sm font-medium text-bee-content-primary">Выплачено ({paid.length})</h2>
          </div>
          <ul>
            {paid.slice(0, 8).map((s) => (
              <li key={s.id} className="border-b border-bee-border-secondary last:border-0">
                <Link to={`/admin/settlements/${s.id}`} className="flex items-center justify-between gap-4 p-4 hover:bg-bee-el-secondary">
                  <span className="text-body-sm text-bee-content-primary">{s.partnerName}</span>
                  <span className="text-caption text-bee-content-tertiary">{formatMoneyMinor(s.payableMinor)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
