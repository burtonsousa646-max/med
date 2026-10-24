import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useCurrentPartnerId } from '@/hooks/useCurrentPartnerId'
import { useOrder, useStatusHistory, useTransitionOrder } from '@/hooks/useOrders'
import { useSessionStore } from '@/stores/sessionStore'
import { getAllowedActions } from '@/mock-api/resources/orders'
import type { OrderAction } from '@/mock-api/types'
import { Card, MetricTile } from '@/components/Card'
import { Button } from '@/components/Button'
import { StatusPill } from '@/components/StatusPill'
import { Modal } from '@/components/Modal'
import { TextareaField } from '@/components/form/Field'
import { EmptyState } from '@/components/EmptyState'
import { formatMoney } from '@/utils/money'
import {
  ORDER_LIFECYCLE_LABEL,
  ORDER_LIFECYCLE_TONE,
  ORDER_PAYMENT_LABEL,
  ORDER_PAYMENT_TONE,
  ORDER_DISPUTE_LABEL,
  ORDER_DISPUTE_TONE,
} from '@/utils/statusLabels'
import { useUiStore } from '@/stores/uiStore'

const ACTION_LABEL: Record<OrderAction, string> = {
  confirm: 'Подтвердить',
  fulfil: 'Исполнить',
  cancel: 'Отменить',
  close: 'Закрыть',
  request_refund: 'Запросить возврат',
  refund_succeeded: 'Подтвердить возврат',
  open_dispute: 'Открыть спор',
  resolve_dispute: 'Решить спор',
}

const ACTIONS_REQUIRING_REASON: OrderAction[] = ['cancel', 'request_refund', 'open_dispute', 'resolve_dispute']

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const partnerId = useCurrentPartnerId()
  const identity = useSessionStore((s) => s.identity)
  const { data: order, isLoading } = useOrder(orderId)
  const { data: history } = useStatusHistory(orderId)
  const transition = useTransitionOrder(partnerId)
  const pushToast = useUiStore((s) => s.pushToast)
  const [pendingAction, setPendingAction] = useState<OrderAction | null>(null)
  const [reason, setReason] = useState('')

  if (isLoading) return <p className="text-body-sm text-bee-content-tertiary">Загрузка…</p>
  if (!order) return <EmptyState title="Заказ не найден" />

  const allowed = getAllowedActions(order)

  function startAction(action: OrderAction) {
    if (ACTIONS_REQUIRING_REASON.includes(action)) {
      setPendingAction(action)
      setReason('')
    } else {
      runAction(action, null)
    }
  }

  async function runAction(action: OrderAction, actionReason: string | null) {
    if (!order || !identity) return
    await transition.mutateAsync({
      orderId: order.id,
      action,
      reason: actionReason,
      actorLabel: identity.displayName,
      expectedVersion: order.version,
    })
    pushToast({ tone: 'success', title: `Заказ обновлён: ${ACTION_LABEL[action]}` })
    setPendingAction(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-sm font-medium text-bee-content-primary">{order.displayId}</h1>
          <p className="text-caption text-bee-content-tertiary">
            {order.offerTitle} · {order.sourceChannel} {order.environment === 'sandbox' && '· sandbox'}
          </p>
        </div>
        <div className="flex gap-2">
          <StatusPill tone={ORDER_LIFECYCLE_TONE[order.lifecycleStatus]}>
            {ORDER_LIFECYCLE_LABEL[order.lifecycleStatus]}
          </StatusPill>
          <StatusPill tone={ORDER_PAYMENT_TONE[order.paymentStatus]}>
            {ORDER_PAYMENT_LABEL[order.paymentStatus]}
          </StatusPill>
          {order.disputeStatus !== 'none' && (
            <StatusPill tone={ORDER_DISPUTE_TONE[order.disputeStatus]}>
              {ORDER_DISPUTE_LABEL[order.disputeStatus]}
            </StatusPill>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricTile label="Сумма" value={formatMoney(order.amount)} />
        <MetricTile label="Версия" value={order.version} />
        <MetricTile label="Создан" value={new Date(order.createdAt).toLocaleDateString('ru-RU')} />
        <MetricTile label="Внешний ID" value={order.externalOrderId ?? '—'} />
      </div>

      {allowed.length > 0 && (
        <Card className="flex flex-wrap gap-3">
          {allowed.map((action) => (
            <Button
              key={action}
              priority={action === 'cancel' ? 'destructive' : 'secondary-on-primary'}
              size="m"
              loading={transition.isPending && pendingAction === null}
              onClick={() => startAction(action)}
            >
              {ACTION_LABEL[action]}
            </Button>
          ))}
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-body-accent-sm font-medium text-bee-content-primary">История статусов</h2>
        {history && history.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {history.map((h) => (
              <li key={h.id} className="border-b border-bee-border-secondary pb-3 last:border-0 last:pb-0">
                <p className="text-body-sm text-bee-content-primary">
                  {ACTION_LABEL[h.action]}: {h.fromLifecycle} → {h.toLifecycle}
                </p>
                <p className="text-caption text-bee-content-tertiary">
                  {new Date(h.occurredAt).toLocaleString('ru-RU')} · {h.actorLabel}
                  {h.reason ? ` · ${h.reason}` : ''}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-bee-content-tertiary">Переходов пока не было.</p>
        )}
      </Card>

      <Modal
        open={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        title={pendingAction ? ACTION_LABEL[pendingAction] : ''}
        footer={
          <>
            <Button priority="secondary-on-primary" onClick={() => setPendingAction(null)}>
              Отмена
            </Button>
            <Button
              disabled={!reason.trim()}
              loading={transition.isPending}
              onClick={() => pendingAction && runAction(pendingAction, reason.trim())}
            >
              Подтвердить
            </Button>
          </>
        }
      >
        <TextareaField
          label="Причина (обязательна)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Modal>
    </div>
  )
}
