import { useCheckRequests } from '@/hooks/usePartners'
import { useModerationQueue } from '@/hooks/useOffers'
import { useAllSettlements } from '@/hooks/useSettlements'
import { useSessionStore } from '@/stores/sessionStore'
import { Card, MetricTile } from '@/components/Card'
import { LinkButton } from '@/components/LinkButton'

export function AdminHomePage() {
  const identity = useSessionStore((s) => s.identity)
  const { data: checks } = useCheckRequests()
  const { data: moderationQueue } = useModerationQueue()
  const { data: settlements } = useAllSettlements()

  const openChecks = checks?.filter((c) => c.status === 'pending' || c.status === 'needs_info').length ?? 0
  const inReview = moderationQueue?.length ?? 0
  const actionableSettlements =
    settlements?.filter((s) => s.status !== 'paid' && s.status !== 'draft').length ?? 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-sm font-medium text-bee-content-primary">
          Здравствуйте, {identity?.displayName.split(' — ')[0]}
        </h1>
        <p className="mt-1 text-body-sm text-bee-content-secondary">Сводка очередей платформы МЁД.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="flex flex-col gap-3">
          <MetricTile label="Партнёры на проверке" value={openChecks} />
          <LinkButton to="/admin/partners" size="m" priority="secondary-on-primary">
            Открыть очередь
          </LinkButton>
        </Card>
        <Card className="flex flex-col gap-3">
          <MetricTile label="Офферы на модерации" value={inReview} />
          <LinkButton to="/admin/offers" size="m" priority="secondary-on-primary">
            Открыть очередь
          </LinkButton>
        </Card>
        <Card className="flex flex-col gap-3">
          <MetricTile label="Расчёты в процессе" value={actionableSettlements} />
          <LinkButton to="/admin/settlements" size="m" priority="secondary-on-primary">
            Открыть очередь
          </LinkButton>
        </Card>
      </div>
    </div>
  )
}
