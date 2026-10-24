import { Link } from 'react-router-dom'
import { useCurrentPartnerId } from '@/hooks/useCurrentPartnerId'
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/hooks/useNotifications'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { StatusPill } from '@/components/StatusPill'
import { EmptyState } from '@/components/EmptyState'
import { ENTITY_ROUTE } from '@/utils/entityRoutes'
import clsx from 'clsx'

export function NotificationsPage() {
  const partnerId = useCurrentPartnerId()
  const { data: notifications, isLoading } = useNotifications(partnerId)
  const markRead = useMarkNotificationRead(partnerId)
  const markAllRead = useMarkAllNotificationsRead(partnerId)

  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-sm font-medium text-bee-content-primary">Уведомления</h1>
          <p className="mt-1 text-body-sm text-bee-content-secondary">Непрочитанных: {unreadCount}</p>
        </div>
        {unreadCount > 0 && (
          <Button priority="secondary-on-primary" size="m" onClick={() => markAllRead.mutate()}>
            Отметить все прочитанными
          </Button>
        )}
      </div>

      <Card className="p-0">
        {isLoading ? (
          <div className="p-6 text-body-sm text-bee-content-tertiary">Загрузка…</div>
        ) : !notifications || notifications.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Уведомлений пока нет" />
          </div>
        ) : (
          <ul>
            {notifications.map((n) => {
              const to = ENTITY_ROUTE[n.entityType]?.(n.entityId)
              const content = (
                <div
                  className={clsx(
                    'flex items-center justify-between gap-4 p-4',
                    to && 'hover:bg-bee-el-secondary',
                    !n.readAt && 'bg-bee-surface-yellow/20',
                  )}
                >
                  <div className="flex items-center gap-3">
                    {!n.readAt && <span className="size-2 shrink-0 rounded-full bg-bee-brand-tertiary" />}
                    <div>
                      <p className="text-body-sm text-bee-content-primary">{n.title}</p>
                      <p className="text-caption text-bee-content-tertiary">
                        {new Date(n.createdAt).toLocaleString('ru-RU')}
                      </p>
                    </div>
                  </div>
                  {n.severity === 'critical' && <StatusPill tone="bad">Критично</StatusPill>}
                </div>
              )
              return (
                <li
                  key={n.id}
                  className="border-b border-bee-border-secondary last:border-0"
                  onClick={() => !n.readAt && markRead.mutate(n.id)}
                >
                  {to ? (
                    <Link to={to}>{content}</Link>
                  ) : (
                    content
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
