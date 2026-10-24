import { Link } from 'react-router-dom'
import { useCurrentPartnerId } from '@/hooks/useCurrentPartnerId'
import { useSettlements } from '@/hooks/useSettlements'
import { Card, MetricTile } from '@/components/Card'
import { StatusPill } from '@/components/StatusPill'
import { EmptyState } from '@/components/EmptyState'
import { formatMoneyMinor } from '@/utils/money'
import { SETTLEMENT_STATUS_LABEL, SETTLEMENT_STATUS_TONE } from '@/utils/statusLabels'

export function SettlementListPage() {
  const partnerId = useCurrentPartnerId()
  const { data: settlements, isLoading } = useSettlements(partnerId)

  const totalPayable = settlements?.reduce((sum, s) => sum + s.payableMinor, 0) ?? 0
  const pending = settlements?.filter((s) => s.status !== 'paid').length ?? 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-sm font-medium text-bee-content-primary">Расчёты</h1>
        <p className="mt-1 text-body-sm text-bee-content-secondary">
          Периоды и статусы выплат. Сумма всегда объясняется строками реестра — не общим процентом.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <MetricTile label="Выплачено/начислено, всего" value={formatMoneyMinor(totalPayable)} />
        <MetricTile label="Периодов" value={settlements?.length ?? 0} />
        <MetricTile label="В процессе" value={pending} />
      </div>

      <Card className="p-0">
        {isLoading ? (
          <div className="p-6 text-body-sm text-bee-content-tertiary">Загрузка…</div>
        ) : !settlements || settlements.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Расчётов пока нет" description="Появятся после первых оплаченных заказов." />
          </div>
        ) : (
          <ul>
            {settlements.map((s) => (
              <li key={s.id} className="border-b border-bee-border-secondary last:border-0">
                <Link
                  to={`/settlements/${s.id}`}
                  className="flex items-center justify-between gap-4 p-4 hover:bg-bee-el-secondary"
                >
                  <div>
                    <p className="text-body-accent-sm font-medium text-bee-content-primary">
                      {new Date(s.periodFrom).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
                    </p>
                    <p className="text-caption text-bee-content-tertiary">
                      Начислено {formatMoneyMinor(s.grossMinor)} · комиссия {formatMoneyMinor(s.feeMinor)} · к выплате{' '}
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
    </div>
  )
}
