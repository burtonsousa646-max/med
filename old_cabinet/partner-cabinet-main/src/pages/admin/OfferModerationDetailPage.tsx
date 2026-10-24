import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useOffer, useOfferVersions, useModerateOfferVersion } from '@/hooks/useOffers'
import { useSessionStore } from '@/stores/sessionStore'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { StatusPill } from '@/components/StatusPill'
import { TextareaField } from '@/components/form/Field'
import { EmptyState } from '@/components/EmptyState'
import { OFFER_STATUS_LABEL, OFFER_STATUS_TONE } from '@/utils/statusLabels'
import { formatMoney } from '@/utils/money'
import { useUiStore } from '@/stores/uiStore'
import { deriveOfferModel, getOfferModel } from '@/content/offerModels'
import type { ModerationDecision } from '@/mock-api/resources/offers'

export function OfferModerationDetailPage() {
  const { offerId } = useParams<{ offerId: string }>()
  const identity = useSessionStore((s) => s.identity)
  const { data: offer } = useOffer(offerId)
  const { data: versions } = useOfferVersions(offerId)
  const moderate = useModerateOfferVersion()
  const pushToast = useUiStore((s) => s.pushToast)
  const [note, setNote] = useState('')

  if (!offer) return <EmptyState title="Оффер не найден" />

  const current = versions?.find((v) => v.moderationStatus === 'in_review') ?? versions?.[0]
  const canDecide = current?.moderationStatus === 'in_review'

  async function onDecide(decision: ModerationDecision) {
    if (!current || !identity) return
    if (decision !== 'approve' && !note.trim()) return
    await moderate.mutateAsync({
      versionId: current.id,
      decision,
      note: note.trim() || null,
      moderatorLabel: identity.displayName,
    })
    pushToast({
      tone: decision === 'reject' ? 'error' : 'success',
      title:
        decision === 'approve' ? 'Оффер опубликован' : decision === 'reject' ? 'Оффер отклонён' : 'Отправлено на доработку',
    })
    setNote('')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-sm font-medium text-bee-content-primary">{offer.title}</h1>
          <p className="text-caption text-bee-content-tertiary">
            {offer.id} · версия {current?.revision}
          </p>
        </div>
        {current && <StatusPill tone={OFFER_STATUS_TONE[current.moderationStatus]}>{OFFER_STATUS_LABEL[current.moderationStatus]}</StatusPill>}
      </div>

      {current && (
        <Card className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 text-body-sm sm:grid-cols-2">
            <Detail label="Выгода" value={current.benefit} />
            <Detail label="Механика" value={current.mechanic} />
            <Detail label="Цена купона" value={formatMoney(current.couponPrice)} />
            <Detail label="Цена услуги" value={formatMoney(current.servicePrice)} />
            <Detail label="Регион" value={current.region} />
            <Detail
              label="Модель и комиссия"
              value={`${getOfferModel(current.monetizationModel ?? deriveOfferModel(current.mechanic, current.commissionModel)).title} · ${current.commissionModel}`}
            />
            <Detail label="Действует" value={`${new Date(current.startDate).toLocaleDateString('ru-RU')} — ${new Date(current.endDate).toLocaleDateString('ru-RU')}`} />
            <Detail label="Поддержка" value={current.supportContact} />
          </div>
          <Detail label="Описание" value={current.description} />
          <Detail label="Условия использования" value={current.usageRules} />
          <Detail label="Условия возврата" value={current.refundRules} />
        </Card>
      )}

      {current && current.moderationNotes.length > 0 && (
        <Card>
          <h2 className="mb-2 text-body-accent-sm font-medium text-bee-content-primary">История замечаний</h2>
          <ul className="flex flex-col gap-2">
            {current.moderationNotes.map((n) => (
              <li key={n.id} className="text-body-sm text-bee-content-secondary">
                «{n.message}» — {n.authorLabel}, {new Date(n.createdAt).toLocaleDateString('ru-RU')}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {canDecide && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-body-accent-sm font-medium text-bee-content-primary">Решение по модерации</h2>
          <TextareaField
            label="Комментарий (обязателен для отказа или правок)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-3">
            <Button loading={moderate.isPending} onClick={() => onDecide('approve')}>
              Утвердить и опубликовать
            </Button>
            <Button
              priority="secondary-on-primary"
              disabled={!note.trim()}
              loading={moderate.isPending}
              onClick={() => onDecide('request_changes')}
            >
              Запросить правки
            </Button>
            <Button
              priority="destructive"
              disabled={!note.trim()}
              loading={moderate.isPending}
              onClick={() => onDecide('reject')}
            >
              Отклонить
            </Button>
          </div>
        </Card>
      )}
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
