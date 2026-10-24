import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download } from 'lucide-react'
import { useSettlement, useSettlementLines, useDiscrepancies, useRaiseDiscrepancy } from '@/hooks/useSettlements'
import { Card, MetricTile } from '@/components/Card'
import { Button } from '@/components/Button'
import { StatusPill } from '@/components/StatusPill'
import { Modal } from '@/components/Modal'
import { TextareaField } from '@/components/form/Field'
import { EmptyState } from '@/components/EmptyState'
import { formatMoneyMinor } from '@/utils/money'
import { SETTLEMENT_STATUS_LABEL, SETTLEMENT_STATUS_TONE } from '@/utils/statusLabels'
import { downloadCsv } from '@/utils/csv'
import { useUiStore } from '@/stores/uiStore'

export function SettlementDetailPage() {
  const { settlementId } = useParams<{ settlementId: string }>()
  const { data: settlement } = useSettlement(settlementId)
  const { data: lines } = useSettlementLines(settlementId)
  const { data: discrepancies } = useDiscrepancies(settlementId)
  const raiseDiscrepancy = useRaiseDiscrepancy()
  const pushToast = useUiStore((s) => s.pushToast)
  const [disputingLineId, setDisputingLineId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  if (!settlement) return <EmptyState title="Период не найден" />

  const sumPayable = lines?.reduce((sum, l) => sum + l.payableMinor, 0) ?? 0

  function onExport() {
    if (!lines) return
    downloadCsv(
      `settlement-${settlementId}.csv`,
      ['order_id', 'gross_minor', 'fee_minor', 'hold_minor', 'adjustment_minor', 'payable_minor', 'note'],
      lines.map((l) => [l.orderDisplayId, l.grossMinor, l.feeMinor, l.holdMinor, l.adjustmentMinor, l.payableMinor, l.note ?? '']),
    )
  }

  async function onSubmitDiscrepancy() {
    if (!disputingLineId || !settlementId || !message.trim()) return
    await raiseDiscrepancy.mutateAsync({ settlementId, settlementLineId: disputingLineId, message: message.trim() })
    pushToast({ tone: 'success', title: 'Расхождение зафиксировано' })
    setDisputingLineId(null)
    setMessage('')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-sm font-medium text-bee-content-primary">
            {new Date(settlement.periodFrom).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
          </h1>
          <p className="text-caption text-bee-content-tertiary">{settlement.id}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill tone={SETTLEMENT_STATUS_TONE[settlement.status]}>
            {SETTLEMENT_STATUS_LABEL[settlement.status]}
          </StatusPill>
          <Button priority="secondary-on-primary" size="m" onClick={onExport}>
            <Download size={16} className="mr-1.5" /> CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricTile label="Начислено (gross)" value={formatMoneyMinor(settlement.grossMinor)} />
        <MetricTile label="Комиссия" value={formatMoneyMinor(settlement.feeMinor)} />
        <MetricTile label="Удержано" value={formatMoneyMinor(settlement.holdMinor)} />
        <MetricTile label="К выплате" value={formatMoneyMinor(settlement.payableMinor)} />
      </div>

      {sumPayable !== settlement.payableMinor && (
        <div className="rounded-bee-md bg-bee-surface-red/60 p-3 text-caption text-bee-error-tertiary">
          Внимание: сумма строк ({formatMoneyMinor(sumPayable)}) не совпадает с итогом периода — требуется сверка.
        </div>
      )}

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-bee-border-secondary text-caption text-bee-content-tertiary">
                <th className="px-4 py-2 text-left font-normal">Заказ</th>
                <th className="px-4 py-2 text-right font-normal">Gross</th>
                <th className="px-4 py-2 text-right font-normal">Комиссия</th>
                <th className="px-4 py-2 text-right font-normal">Удержано</th>
                <th className="px-4 py-2 text-right font-normal">Корректировка</th>
                <th className="px-4 py-2 text-right font-normal">К выплате</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines?.map((line) => (
                <tr key={line.id} className="border-b border-bee-border-secondary last:border-0">
                  <td className="px-4 py-3 font-medium text-bee-content-primary">{line.orderDisplayId}</td>
                  <td className="px-4 py-3 text-right">{formatMoneyMinor(line.grossMinor)}</td>
                  <td className="px-4 py-3 text-right text-bee-content-secondary">−{formatMoneyMinor(line.feeMinor)}</td>
                  <td className="px-4 py-3 text-right text-bee-error-tertiary">
                    {line.holdMinor > 0 ? `−${formatMoneyMinor(line.holdMinor)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-bee-content-secondary">
                    {line.adjustmentMinor !== 0 ? formatMoneyMinor(line.adjustmentMinor) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-bee-content-primary">
                    {formatMoneyMinor(line.payableMinor)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="text-caption text-bee-link-primary hover:underline"
                      onClick={() => setDisputingLineId(line.id)}
                    >
                      Оспорить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {discrepancies && discrepancies.length > 0 && (
        <Card>
          <h2 className="mb-2 text-body-accent-sm font-medium text-bee-content-primary">Расхождения</h2>
          <ul className="flex flex-col gap-2">
            {discrepancies.map((d) => (
              <li key={d.id} className="text-body-sm text-bee-content-secondary">
                {d.message} · <StatusPill tone={d.status === 'open' ? 'wait' : 'good'}>{d.status}</StatusPill>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={!!disputingLineId}
        onClose={() => setDisputingLineId(null)}
        title="Сообщить о расхождении"
        footer={
          <>
            <Button priority="secondary-on-primary" onClick={() => setDisputingLineId(null)}>
              Отмена
            </Button>
            <Button disabled={!message.trim()} loading={raiseDiscrepancy.isPending} onClick={onSubmitDiscrepancy}>
              Отправить
            </Button>
          </>
        }
      >
        <TextareaField label="Опишите расхождение" value={message} onChange={(e) => setMessage(e.target.value)} />
      </Modal>
    </div>
  )
}
