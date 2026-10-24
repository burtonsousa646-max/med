import { useParams } from 'react-router-dom'
import { useSettlement, useSettlementLines, useDiscrepancies, useAdvanceSettlement } from '@/hooks/useSettlements'
import { useSessionStore } from '@/stores/sessionStore'
import { Card, MetricTile } from '@/components/Card'
import { Button } from '@/components/Button'
import { StatusPill } from '@/components/StatusPill'
import { EmptyState } from '@/components/EmptyState'
import { formatMoneyMinor } from '@/utils/money'
import { SETTLEMENT_STATUS_LABEL, SETTLEMENT_STATUS_TONE } from '@/utils/statusLabels'
import { useUiStore } from '@/stores/uiStore'
import type { SettlementAction } from '@/mock-api/state-machines/settlementLifecycle'
import type { SettlementStatus } from '@/mock-api/types'

const NEXT_ACTIONS: Partial<Record<SettlementStatus, Array<{ action: SettlementAction; label: string; destructive?: boolean }>>> = {
  reconciling: [{ action: 'reconcile', label: 'Завершить сверку' }],
  discrepancies: [{ action: 'resolve_discrepancy', label: 'Расхождения устранены' }],
  reconciled: [{ action: 'submit_for_approval', label: 'Отправить на согласование' }],
  awaiting_approval: [{ action: 'approve', label: 'Согласовать' }],
  approved: [{ action: 'initiate_payment', label: 'Инициировать выплату' }],
  payment_pending: [
    { action: 'mark_paid', label: 'Отметить выплаченным' },
    { action: 'mark_failed', label: 'Выплата не прошла', destructive: true },
  ],
  failed: [{ action: 'retry_payment', label: 'Повторить выплату' }],
}

export function PayoutDetailPage() {
  const { settlementId } = useParams<{ settlementId: string }>()
  const identity = useSessionStore((s) => s.identity)
  const { data: settlement } = useSettlement(settlementId)
  const { data: lines } = useSettlementLines(settlementId)
  const { data: discrepancies } = useDiscrepancies(settlementId)
  const advance = useAdvanceSettlement()
  const pushToast = useUiStore((s) => s.pushToast)

  if (!settlement) return <EmptyState title="Период не найден" />

  const openDiscrepancies = discrepancies?.filter((d) => d.status === 'open') ?? []
  const actions = NEXT_ACTIONS[settlement.status] ?? []

  async function onAdvance(action: SettlementAction) {
    if (!settlementId || !identity) return
    await advance.mutateAsync({ settlementId, action, actorLabel: identity.displayName })
    pushToast({ tone: 'success', title: 'Статус расчёта обновлён' })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-sm font-medium text-bee-content-primary">
            {new Date(settlement.periodFrom).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
          </h1>
          <p className="text-caption text-bee-content-tertiary">{settlement.id} · партнёр {settlement.partnerId}</p>
        </div>
        <StatusPill tone={SETTLEMENT_STATUS_TONE[settlement.status]}>
          {SETTLEMENT_STATUS_LABEL[settlement.status]}
        </StatusPill>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricTile label="Начислено (gross)" value={formatMoneyMinor(settlement.grossMinor)} />
        <MetricTile label="Комиссия" value={formatMoneyMinor(settlement.feeMinor)} />
        <MetricTile label="Удержано" value={formatMoneyMinor(settlement.holdMinor)} />
        <MetricTile label="К выплате" value={formatMoneyMinor(settlement.payableMinor)} />
      </div>

      {openDiscrepancies.length > 0 && (
        <div className="rounded-bee-md bg-bee-surface-red/60 p-3 text-caption text-bee-error-tertiary">
          Открытых расхождений: {openDiscrepancies.length}. Рекомендуется устранить перед согласованием.
        </div>
      )}

      {actions.length > 0 && (
        <Card className="flex flex-wrap gap-3">
          {actions.map((a) => (
            <Button
              key={a.action}
              priority={a.destructive ? 'destructive' : 'primary'}
              loading={advance.isPending}
              onClick={() => onAdvance(a.action)}
            >
              {a.label}
            </Button>
          ))}
        </Card>
      )}

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-bee-border-secondary text-caption text-bee-content-tertiary">
                <th className="px-4 py-2 text-left font-normal">Заказ</th>
                <th className="px-4 py-2 text-right font-normal">Gross</th>
                <th className="px-4 py-2 text-right font-normal">Комиссия</th>
                <th className="px-4 py-2 text-right font-normal">К выплате</th>
              </tr>
            </thead>
            <tbody>
              {lines?.map((line) => (
                <tr key={line.id} className="border-b border-bee-border-secondary last:border-0">
                  <td className="px-4 py-3 font-medium text-bee-content-primary">{line.orderDisplayId}</td>
                  <td className="px-4 py-3 text-right">{formatMoneyMinor(line.grossMinor)}</td>
                  <td className="px-4 py-3 text-right text-bee-content-secondary">−{formatMoneyMinor(line.feeMinor)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatMoneyMinor(line.payableMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
