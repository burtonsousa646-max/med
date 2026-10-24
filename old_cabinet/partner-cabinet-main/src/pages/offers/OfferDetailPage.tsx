import { useParams } from 'react-router-dom'
import { useOffer, useOfferVersions, useSubmitOfferForModeration } from '@/hooks/useOffers'
import * as offersApi from '@/mock-api/resources/offers'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, MetricTile } from '@/components/Card'
import { Button } from '@/components/Button'
import { LinkButton } from '@/components/LinkButton'
import { StatusPill } from '@/components/StatusPill'
import { EmptyState } from '@/components/EmptyState'
import { OFFER_STATUS_LABEL, OFFER_STATUS_TONE } from '@/utils/statusLabels'
import { useUiStore } from '@/stores/uiStore'
import { formatMoney } from '@/utils/money'
import { moderationWait, MODERATION_SLA_HOURS } from '@/utils/sla'
import { useCountdown } from '@/hooks/useCountdown'
import { AUTO_MODERATE_DELAY_MS } from '@/mock-api/resources/offers'
import { Clock, Loader2 } from 'lucide-react'
import { MoneyFlow } from '@/components/offers/MoneyFlow'
import { deriveOfferModel, getOfferModel, recommendedLevels } from '@/content/offerModels'

export function OfferDetailPage() {
  const { offerId } = useParams<{ offerId: string }>()
  const { data: offer, isLoading } = useOffer(offerId)
  const { data: versions } = useOfferVersions(offerId)
  const submitForModeration = useSubmitOfferForModeration()
  const latestForCountdown = versions?.[0]
  const secondsLeft = useCountdown(
    latestForCountdown?.moderationStatus === 'in_review'
      ? (latestForCountdown.submittedForReviewAt ?? latestForCountdown.createdAt)
      : undefined,
    AUTO_MODERATE_DELAY_MS,
  )
  const pushToast = useUiStore((s) => s.pushToast)
  const qc = useQueryClient()
  const [pausing, setPausing] = useState(false)

  if (isLoading) return <p className="text-body-sm text-bee-content-tertiary">Загрузка…</p>
  if (!offer) return <EmptyState title="Оффер не найден" />

  const latest = versions?.[0]
  const modelInfo = latest
    ? getOfferModel(latest.monetizationModel ?? deriveOfferModel(latest.mechanic, latest.commissionModel))
    : undefined
  const canSubmit = latest && (latest.moderationStatus === 'draft' || latest.moderationStatus === 'changes_requested')

  async function onSubmit() {
    if (!offer || !latest) return
    await submitForModeration.mutateAsync({ offerId: offer.id, versionId: latest.id })
    pushToast({ tone: 'success', title: 'Оффер отправлен на модерацию' })
  }

  async function onTogglePause() {
    if (!offer) return
    setPausing(true)
    try {
      if (offer.lifecycleStatus === 'published') await offersApi.requestOfferPause(offer.id)
      else if (offer.lifecycleStatus === 'paused') await offersApi.resumeOffer(offer.id)
      await qc.invalidateQueries({ queryKey: ['offers'] })
      pushToast({ tone: 'success', title: 'Статус оффера обновлён' })
    } finally {
      setPausing(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {latest?.iconDataUrl && (
            <img
              src={latest.iconDataUrl}
              alt=""
              className="size-12 shrink-0 rounded-bee-md border border-bee-border-secondary object-cover"
            />
          )}
          <div>
            <h1 className="text-headline-sm font-medium text-bee-content-primary">{offer.title}</h1>
            <p className="text-caption text-bee-content-tertiary">{offer.id}</p>
          </div>
        </div>
        <StatusPill tone={OFFER_STATUS_TONE[offer.lifecycleStatus]}>
          {OFFER_STATUS_LABEL[offer.lifecycleStatus]}
        </StatusPill>
      </div>

      {latest && latest.moderationStatus === 'in_review' && (
        <div className="flex flex-col gap-1 rounded-bee-md bg-bee-surface-blue/40 px-3 py-2 text-caption text-bee-link-tertiary">
          <div className="flex items-center gap-2">
            <Clock size={14} />
            На модерации {moderationWait(latest.submittedForReviewAt ?? latest.createdAt).label}. Обычно рассматриваем в течение{' '}
            {MODERATION_SLA_HOURS / 24} рабочих дней.
          </div>
          <div className="flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            {secondsLeft > 0
              ? `Автоматическая модерация низкого риска завершится примерно через ${secondsLeft} с`
              : 'Завершаем модерацию…'}
          </div>
        </div>
      )}

      {latest && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricTile label="Цена купона" value={formatMoney(latest.couponPrice)} />
          <MetricTile label="Цена услуги" value={formatMoney(latest.servicePrice)} />
          <MetricTile label="Модель" value={modelInfo?.title ?? latest.commissionModel} footnote={modelInfo?.title !== latest.commissionModel ? latest.commissionModel : undefined} />
          <MetricTile label="Действует до" value={new Date(latest.endDate).toLocaleDateString('ru-RU')} />
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {canSubmit && (
          <Button loading={submitForModeration.isPending} onClick={onSubmit}>
            Отправить на модерацию
          </Button>
        )}
        {(offer.lifecycleStatus === 'published' || offer.lifecycleStatus === 'paused') && (
          <Button priority="secondary-on-primary" loading={pausing} onClick={onTogglePause}>
            {offer.lifecycleStatus === 'published' ? 'Поставить на паузу' : 'Возобновить'}
          </Button>
        )}
        <LinkButton to={`/offers/${offer.id}/edit`} priority="secondary-on-primary">
          {offer.lifecycleStatus === 'published' ? 'Изменить (новая версия)' : 'Редактировать'}
        </LinkButton>
        <LinkButton to={`/offers/${offer.id}/codes`} priority="secondary-on-primary">
          Промокоды
        </LinkButton>
      </div>

      {modelInfo && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-body-accent-sm font-medium text-bee-content-primary">
            Как устроены деньги: {modelInfo.title}
          </h2>
          <MoneyFlow steps={modelInfo.flow} />
          <p className="text-caption text-bee-content-secondary">{modelInfo.payTrigger}</p>
          <p className="text-caption text-bee-content-tertiary">
            Рекомендуемый уровень интеграции: {recommendedLevels(modelInfo.id).join(' или ')}.
          </p>
        </Card>
      )}

      {latest && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-body-accent-sm font-medium text-bee-content-primary">Описание</h2>
          <p className="text-body-sm text-bee-content-secondary">{latest.description}</p>
          <div className="grid grid-cols-1 gap-3 text-body-sm sm:grid-cols-2">
            <Detail label="Выгода" value={latest.benefit} />
            <Detail label="Регион" value={latest.region} />
            <Detail label="Условия использования" value={latest.usageRules} />
            <Detail label="Условия возврата" value={latest.refundRules} />
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-body-accent-sm font-medium text-bee-content-primary">Версии</h2>
        <ul className="flex flex-col gap-3">
          {versions?.map((v) => (
            <li key={v.id} className="border-b border-bee-border-secondary pb-3 last:border-0 last:pb-0">
              <div className="flex items-center justify-between">
                <span className="text-body-sm font-medium text-bee-content-primary">Версия {v.revision}</span>
                <StatusPill tone={OFFER_STATUS_TONE[v.moderationStatus]}>
                  {OFFER_STATUS_LABEL[v.moderationStatus]}
                </StatusPill>
              </div>
              {v.moderationNotes.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {v.moderationNotes.map((n) => (
                    <li key={n.id} className="text-caption text-bee-content-secondary">
                      «{n.message}» — {n.authorLabel}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-caption text-bee-content-tertiary">{label}</p>
      <p className="text-bee-content-primary">{value}</p>
    </div>
  )
}
