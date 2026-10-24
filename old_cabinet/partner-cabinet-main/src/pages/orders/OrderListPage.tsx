import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useCurrentPartnerId } from '@/hooks/useCurrentPartnerId'
import { useOrders } from '@/hooks/useOrders'
import { Card, MetricTile } from '@/components/Card'
import { StatusPill } from '@/components/StatusPill'
import { EmptyState } from '@/components/EmptyState'
import { formatMoney } from '@/utils/money'
import {
  ORDER_LIFECYCLE_LABEL,
  ORDER_LIFECYCLE_TONE,
  ORDER_PAYMENT_LABEL,
  ORDER_PAYMENT_TONE,
  ORDER_DISPUTE_TONE,
} from '@/utils/statusLabels'

const FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'open', label: 'Открытые' },
  { value: 'created', label: 'Новые' },
  { value: 'confirmed', label: 'Подтверждённые' },
  { value: 'fulfilled', label: 'Исполненные' },
  { value: 'dispute', label: 'Со спором' },
] as const

export function OrderListPage() {
  const partnerId = useCurrentPartnerId()
  const { data: orders, isLoading } = useOrders(partnerId)
  const [search, setSearch] = useState('')
  const [searchParams] = useSearchParams()
  const initialFilter = FILTERS.find((f) => f.value === searchParams.get('filter'))?.value ?? 'all'
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>(initialFilter)

  const filtered = useMemo(() => {
    return (orders ?? []).filter((o) => {
      if (filter === 'dispute' && o.disputeStatus !== 'open') return false
      else if (filter === 'open' && o.lifecycleStatus !== 'created' && o.lifecycleStatus !== 'confirmed') return false
      else if (filter !== 'all' && filter !== 'dispute' && filter !== 'open' && o.lifecycleStatus !== filter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!o.displayId.toLowerCase().includes(q) && !o.offerTitle.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [orders, search, filter])

  const counters = useMemo(
    () => ({
      total: orders?.length ?? 0,
      created: orders?.filter((o) => o.lifecycleStatus === 'created').length ?? 0,
      disputed: orders?.filter((o) => o.disputeStatus === 'open').length ?? 0,
      sandbox: orders?.filter((o) => o.environment === 'sandbox').length ?? 0,
    }),
    [orders],
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-sm font-medium text-bee-content-primary">Заказы</h1>
        <p className="mt-1 text-body-sm text-bee-content-secondary">
          Единый заказ с независимыми статусами lifecycle, оплаты и спора.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricTile label="Всего заказов" value={counters.total} />
        <MetricTile label="Новые" value={counters.created} />
        <MetricTile label="Со спором" value={counters.disputed} />
        <MetricTile label="В sandbox" value={counters.sandbox} />
      </div>

      <Card className="p-0">
        <div className="flex flex-col gap-3 border-b border-bee-border-secondary p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-bee-content-tertiary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по ID или офферу"
              className="h-10 w-full rounded-bee-pill border border-bee-border-secondary bg-bee-bg-secondary pr-3 pl-9 text-body-sm focus:outline-none focus:ring-2 focus:ring-bee-brand-tertiary"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`rounded-bee-pill px-3 py-1.5 text-caption font-medium transition-colors ${
                  filter === f.value
                    ? 'bg-bee-brand-primary text-bee-content-primary'
                    : 'bg-bee-el-secondary text-bee-content-secondary hover:bg-bee-el-tertiary'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 text-body-sm text-bee-content-tertiary">Загрузка…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Заказы не найдены" description="Измените фильтр или создайте тестовый заказ в Sandbox." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-bee-border-secondary text-caption text-bee-content-tertiary">
                  <th className="px-4 py-2 text-left font-normal">Заказ</th>
                  <th className="px-4 py-2 text-left font-normal">Оффер</th>
                  <th className="px-4 py-2 text-left font-normal">Сумма</th>
                  <th className="px-4 py-2 text-left font-normal">Lifecycle</th>
                  <th className="px-4 py-2 text-left font-normal">Оплата</th>
                  <th className="px-4 py-2 text-left font-normal">Спор</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr key={order.id} className="border-b border-bee-border-secondary last:border-0 hover:bg-bee-el-secondary">
                    <td className="px-4 py-3">
                      <Link to={`/orders/${order.id}`} className="font-medium text-bee-content-primary hover:underline">
                        {order.displayId}
                      </Link>
                      {order.environment === 'sandbox' && (
                        <span className="ml-2 text-caption text-bee-content-tertiary">sandbox</span>
                      )}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-bee-content-secondary">{order.offerTitle}</td>
                    <td className="px-4 py-3 text-bee-content-primary">{formatMoney(order.amount)}</td>
                    <td className="px-4 py-3">
                      <StatusPill tone={ORDER_LIFECYCLE_TONE[order.lifecycleStatus]}>
                        {ORDER_LIFECYCLE_LABEL[order.lifecycleStatus]}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone={ORDER_PAYMENT_TONE[order.paymentStatus]}>
                        {ORDER_PAYMENT_LABEL[order.paymentStatus]}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-3">
                      {order.disputeStatus !== 'none' && (
                        <StatusPill tone={ORDER_DISPUTE_TONE[order.disputeStatus]}>
                          {order.disputeStatus === 'open' ? 'Спор' : 'Решён'}
                        </StatusPill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
