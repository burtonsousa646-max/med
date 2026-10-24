import { CheckCircle2, Circle, Lightbulb, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSessionStore } from '@/stores/sessionStore'
import { useCurrentPartnerId } from '@/hooks/useCurrentPartnerId'
import { useDashboardSummary } from '@/hooks/useDashboard'
import { useGeneratePartnerInsights } from '@/hooks/useInsights'
import { useNotifications } from '@/hooks/useNotifications'
import { Card, MetricTile } from '@/components/Card'
import { LinkButton } from '@/components/LinkButton'
import { StatusPill } from '@/components/StatusPill'
import { formatMoneyMinor } from '@/utils/money'
import { ENTITY_ROUTE } from '@/utils/entityRoutes'
import clsx from 'clsx'

const CHECKLIST: Array<{ key: keyof ReturnType<typeof stepsOf>; label: string; to: string }> = [
  { key: 'organizationSaved', label: 'Организация заполнена', to: '/organization' },
  { key: 'checkApproved', label: 'Проверка пройдена', to: '/verification' },
  { key: 'agreementAccepted', label: 'Оферта принята', to: '/documents' },
  { key: 'firstOfferPublished', label: 'Первый оффер опубликован', to: '/offers' },
  { key: 'integrationConfigured', label: 'Интеграция настроена', to: '/integration' },
]

function stepsOf<T>(v: T) {
  return v as { organizationSaved: boolean; checkApproved: boolean; agreementAccepted: boolean; integrationConfigured: boolean; firstOfferPublished: boolean }
}

export function DashboardPage() {
  const identity = useSessionStore((s) => s.identity)
  const partnerId = useCurrentPartnerId()
  const { data: summary, isLoading } = useDashboardSummary(partnerId)
  useGeneratePartnerInsights(partnerId)
  const { data: notifications } = useNotifications(partnerId)

  const allDone = summary ? Object.values(summary.onboarding).every(Boolean) : false
  const recommendations = notifications
    ?.filter((n) => !n.readAt && ['offer', 'conversion_drop', 'integration_upgrade'].includes(n.entityType))
    .slice(0, 3)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-sm font-medium text-bee-content-primary">
          Здравствуйте, {identity?.displayName.split(' — ')[0]}
        </h1>
        <p className="mt-1 text-body-sm text-bee-content-secondary">Обзор кабинета партнёра.</p>
      </div>

      {isLoading || !summary ? (
        <p className="text-body-sm text-bee-content-tertiary">Загрузка…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricTile label="Активные офферы" value={summary.activeOffers} to="/offers?filter=published" />
            <MetricTile label="Открытые заказы" value={summary.openOrders} to="/orders?filter=open" />
            <MetricTile
              label="Открытые споры"
              value={summary.openDisputes}
              to="/orders?filter=dispute"
              trend={summary.openDisputes > 0 ? { direction: 'down', label: 'требует внимания' } : undefined}
            />
            <MetricTile label="К выплате" value={formatMoneyMinor(summary.payableMinor)} to="/settlements" />
          </div>

          {recommendations && recommendations.length > 0 && (
            <Card className="flex flex-col gap-3 border-bee-brand-tertiary/40 bg-bee-surface-yellow/15">
              <div className="flex items-center gap-2">
                <Lightbulb size={18} className="text-bee-brand-tertiary" />
                <h2 className="text-body-accent-sm font-medium text-bee-content-primary">Рекомендации для роста</h2>
              </div>
              <ul className="flex flex-col gap-2">
                {recommendations.map((n) => {
                  const to = ENTITY_ROUTE[n.entityType]?.(n.entityId)
                  const content = (
                    <span className="flex items-start gap-2 text-body-sm text-bee-content-primary">
                      {n.severity === 'critical' && <StatusPill tone="bad">Срочно</StatusPill>}
                      {n.title}
                    </span>
                  )
                  return (
                    <li key={n.id}>
                      {to ? (
                        <Link to={to} className="hover:underline">
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </li>
                  )
                })}
              </ul>
              <Link to="/notifications" className="text-caption font-medium text-bee-link-primary hover:underline">
                Все уведомления →
              </Link>
            </Card>
          )}

          {!allDone && (
            <Card>
              <h2 className="mb-3 text-body-accent-sm font-medium text-bee-content-primary">Прогресс подключения</h2>
              <ul className="flex flex-col gap-2">
                {CHECKLIST.map((item) => {
                  const done = summary.onboarding[item.key]
                  return (
                    <li key={item.key}>
                      <Link
                        to={item.to}
                        className="flex items-center gap-2.5 rounded-bee-md p-1.5 text-body-sm hover:bg-bee-el-secondary"
                      >
                        {done ? (
                          <CheckCircle2 size={18} className="shrink-0 text-bee-success-primary" />
                        ) : (
                          <Circle size={18} className="shrink-0 text-bee-content-tertiary" />
                        )}
                        <span className={clsx(done ? 'text-bee-content-secondary line-through' : 'text-bee-content-primary')}>
                          {item.label}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="flex flex-col gap-3">
              <h2 className="text-body-accent-sm font-medium text-bee-content-primary">Быстрые действия</h2>
              <div className="flex flex-wrap gap-3">
                <LinkButton to="/offers/new" size="m">
                  Создать оффер
                </LinkButton>
                <LinkButton to="/integration/sandbox" priority="secondary-on-primary" size="m">
                  Тестовый заказ
                </LinkButton>
                <LinkButton to="/support" priority="secondary-on-primary" size="m">
                  Обратиться в поддержку
                </LinkButton>
              </div>
            </Card>

            {summary.kam && (
              <Card className="flex items-center gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-bee-el-secondary text-bee-content-secondary">
                  <UserRound size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-caption text-bee-content-tertiary">Ваш менеджер (КАМ)</p>
                  <p className="truncate text-body-accent-sm font-medium text-bee-content-primary">
                    {summary.kam.displayName}
                  </p>
                  <p className="truncate text-caption text-bee-content-tertiary">{summary.kam.email}</p>
                </div>
                <LinkButton to="/support" priority="secondary-on-primary" size="m">
                  Написать
                </LinkButton>
              </Card>
            )}
          </div>

          <Card>
            <h2 className="mb-3 text-body-accent-sm font-medium text-bee-content-primary">Последние события</h2>
            {summary.recentEvents.length === 0 ? (
              <p className="text-body-sm text-bee-content-tertiary">Событий пока нет.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {summary.recentEvents.map((e) => {
                  const to = ENTITY_ROUTE[e.entityType]?.(e.entityId)
                  const text = (
                    <>
                      <span className="text-bee-content-tertiary">
                        {new Date(e.occurredAt).toLocaleDateString('ru-RU')}
                      </span>{' '}
                      · {e.summary}
                    </>
                  )
                  return (
                    <li key={e.id} className="text-body-sm text-bee-content-secondary">
                      {to ? (
                        <Link to={to} className="rounded-bee-sm hover:text-bee-content-primary hover:underline">
                          {text}
                        </Link>
                      ) : (
                        text
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
