import { useState } from 'react'
import { useCurrentPartnerId } from '@/hooks/useCurrentPartnerId'
import { useOffers, useOfferVersions } from '@/hooks/useOffers'
import { useCampaignRequests, useCreateCampaignRequest, useCancelCampaignRequest } from '@/hooks/useCampaignRequests'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { StatusPill } from '@/components/StatusPill'
import { SelectField, TextField, TextareaField } from '@/components/form/Field'
import { EmptyState } from '@/components/EmptyState'

const STATUS_TONE = { requested: 'wait', approved: 'good', scheduled: 'info', rejected: 'bad', cancelled: 'neutral' } as const
const STATUS_LABEL = {
  requested: 'Заявка отправлена',
  approved: 'Одобрено CVM',
  scheduled: 'Запланировано',
  rejected: 'Отклонено',
  cancelled: 'Отменено',
} as const

export function PromotionPage() {
  const partnerId = useCurrentPartnerId()
  const { data: offers } = useOffers(partnerId)
  const publishedOffers = offers?.filter((o) => o.lifecycleStatus === 'published') ?? []
  const { data: requests, isLoading } = useCampaignRequests(partnerId)
  const createRequest = useCreateCampaignRequest()
  const cancelRequest = useCancelCampaignRequest(partnerId)

  const [modalOpen, setModalOpen] = useState(false)
  const [offerId, setOfferId] = useState('')
  const { data: versions } = useOfferVersions(offerId || undefined)
  const [criteria, setCriteria] = useState('')
  const [channels, setChannels] = useState('Приложение Билайн, Сайт Билайн')
  const [dates, setDates] = useState('')

  async function onCreate() {
    if (!partnerId || !offerId || !criteria.trim()) return
    const liveVersion = versions?.[0]
    const offer = publishedOffers.find((o) => o.id === offerId)
    if (!liveVersion || !offer) return
    await createRequest.mutateAsync({
      partnerId,
      offerVersionId: liveVersion.id,
      offerTitle: offer.title,
      criteria: criteria.trim(),
      desiredChannels: channels.split(',').map((c) => c.trim()).filter(Boolean),
      desiredDates: dates.trim() || 'Ближайшие 30 дней',
    })
    setModalOpen(false)
    setCriteria('')
    setDates('')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-sm font-medium text-bee-content-primary">Продвижение</h1>
          <p className="mt-1 text-body-sm text-bee-content-secondary">
            Заявка не гарантирует объём — итоговую аудиторию и канал определяет CVM Билайна.
          </p>
        </div>
        <Button disabled={publishedOffers.length === 0} onClick={() => setModalOpen(true)}>
          Новая заявка
        </Button>
      </div>

      <Card className="p-0">
        {isLoading ? (
          <div className="p-6 text-body-sm text-bee-content-tertiary">Загрузка…</div>
        ) : !requests || requests.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Заявок пока нет"
              description={publishedOffers.length === 0 ? 'Сначала опубликуйте хотя бы один оффер.' : undefined}
            />
          </div>
        ) : (
          <ul>
            {requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 border-b border-bee-border-secondary p-4 last:border-0">
                <div>
                  <p className="text-body-sm font-medium text-bee-content-primary">{r.criteria}</p>
                  <p className="text-caption text-bee-content-tertiary">
                    {r.desiredChannels.join(', ')} · {r.desiredDates}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill>
                  {r.status === 'requested' && (
                    <Button priority="secondary-on-primary" size="m" onClick={() => cancelRequest.mutate(r.id)}>
                      Отменить
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Заявка на продвижение"
        footer={
          <>
            <Button priority="secondary-on-primary" onClick={() => setModalOpen(false)}>
              Отмена
            </Button>
            <Button disabled={!offerId || !criteria.trim()} loading={createRequest.isPending} onClick={onCreate}>
              Отправить
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <SelectField
            label="Оффер"
            value={offerId}
            onChange={(e) => setOfferId(e.target.value)}
            options={[{ value: '', label: 'Выберите оффер' }, ...publishedOffers.map((o) => ({ value: o.id, label: o.title }))]}
          />
          <TextareaField
            label="Гео / аудитория / триггер"
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            placeholder="Например: Москва и МО, интерес к путешествиям"
          />
          <TextField label="Желаемые каналы" value={channels} onChange={(e) => setChannels(e.target.value)} />
          <TextField label="Желаемые даты" value={dates} onChange={(e) => setDates(e.target.value)} placeholder="Ближайшие 30 дней" />
        </div>
      </Modal>
    </div>
  )
}
