import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useCurrentPartnerId } from '@/hooks/useCurrentPartnerId'
import { useFunnel } from '@/hooks/useReports'
import { Card, MetricTile } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { formatMoneyMinor } from '@/utils/money'

const PERIODS = [
  { value: 7, label: '7 дней' },
  { value: 30, label: '30 дней' },
  { value: 90, label: '90 дней' },
] as const

export function AnalyticsPage() {
  const partnerId = useCurrentPartnerId()
  const [period, setPeriod] = useState<7 | 30 | 90>(30)
  const { data: funnel, isLoading } = useFunnel(partnerId, period)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-sm font-medium text-bee-content-primary">Аналитика</h1>
          <p className="mt-1 text-body-sm text-bee-content-secondary">
            Считается по фактическим заказам за выбранный период — период реально меняет цифры.
          </p>
        </div>
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`rounded-bee-pill px-3 py-1.5 text-caption font-medium transition-colors ${
                period === p.value
                  ? 'bg-bee-brand-primary text-bee-content-primary'
                  : 'bg-bee-el-secondary text-bee-content-secondary hover:bg-bee-el-tertiary'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading || !funnel ? (
        <p className="text-body-sm text-bee-content-tertiary">Загрузка…</p>
      ) : funnel.totalOrders === 0 ? (
        <EmptyState title="За этот период заказов нет" description="Попробуйте увеличить период." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <MetricTile label="Заказы" value={funnel.totalOrders} />
            <MetricTile label="Подтверждены" value={funnel.confirmed} />
            <MetricTile label="Исполнены" value={funnel.fulfilled} />
            <MetricTile
              label="Конверсия в подтверждение"
              value={`${(funnel.conversionConfirmed * 100).toFixed(1)}%`}
              trend={
                funnel.platformAvgConversion !== null
                  ? {
                      direction: funnel.conversionConfirmed >= funnel.platformAvgConversion ? 'up' : 'down',
                      label:
                        funnel.conversionConfirmed >= funnel.platformAvgConversion
                          ? 'выше среднего'
                          : 'ниже среднего',
                    }
                  : undefined
              }
              footnote={
                funnel.platformAvgConversion !== null
                  ? `по платформе: ${(funnel.platformAvgConversion * 100).toFixed(1)}%`
                  : undefined
              }
            />
            <MetricTile label="GMV" value={formatMoneyMinor(funnel.gmvMinor)} />
          </div>

          <Card>
            <h2 className="mb-4 text-body-accent-sm font-medium text-bee-content-primary">Доля по каналам</h2>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnel.byChannel} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3e6e8" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="channel" tick={{ fontSize: 12 }} width={110} />
                  <Tooltip formatter={(v) => [`${v} заказов`, '']} />
                  <Bar dataKey="orders" fill="#ffc800" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-0">
            <div className="border-b border-bee-border-secondary p-4">
              <h2 className="text-body-accent-sm font-medium text-bee-content-primary">Эффективность офферов</h2>
            </div>
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-bee-border-secondary text-caption text-bee-content-tertiary">
                  <th className="px-4 py-2 text-left font-normal">Оффер</th>
                  <th className="px-4 py-2 text-right font-normal">Заказы</th>
                  <th className="px-4 py-2 text-right font-normal">GMV</th>
                </tr>
              </thead>
              <tbody>
                {funnel.byOffer.map((o) => (
                  <tr key={o.offerId} className="border-b border-bee-border-secondary last:border-0">
                    <td className="px-4 py-3 text-bee-content-primary">{o.offerTitle}</td>
                    <td className="px-4 py-3 text-right">{o.orders}</td>
                    <td className="px-4 py-3 text-right">{formatMoneyMinor(o.gmvMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  )
}
