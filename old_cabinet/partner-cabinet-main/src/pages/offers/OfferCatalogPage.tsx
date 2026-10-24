import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { useCurrentPartnerId } from '@/hooks/useCurrentPartnerId'
import { useOffers, useOfferModels } from '@/hooks/useOffers'
import { getOfferModel } from '@/content/offerModels'
import { Card, MetricTile } from '@/components/Card'
import { LinkButton } from '@/components/LinkButton'
import { StatusPill } from '@/components/StatusPill'
import { EmptyState } from '@/components/EmptyState'
import { OFFER_STATUS_LABEL, OFFER_STATUS_TONE } from '@/utils/statusLabels'
import type { OfferLifecycleStatus } from '@/mock-api/types'

const FILTERS: Array<{ value: OfferLifecycleStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'published', label: 'Опубликованные' },
  { value: 'in_review', label: 'На модерации' },
  { value: 'draft', label: 'Черновики' },
  { value: 'paused', label: 'На паузе' },
]

export function OfferCatalogPage() {
  const partnerId = useCurrentPartnerId()
  const { data: offers, isLoading } = useOffers(partnerId)
  const { data: models } = useOfferModels(partnerId)
  const [search, setSearch] = useState('')
  const [searchParams] = useSearchParams()
  const initialFilter = FILTERS.find((f) => f.value === searchParams.get('filter'))?.value ?? 'all'
  const [filter, setFilter] = useState<OfferLifecycleStatus | 'all'>(initialFilter)

  const filtered = useMemo(() => {
    return (offers ?? []).filter((o) => {
      if (filter !== 'all' && o.lifecycleStatus !== filter) return false
      if (search && !o.title.toLowerCase().includes(search.toLowerCase()) && !o.id.includes(search)) return false
      return true
    })
  }, [offers, search, filter])

  const counters = useMemo(
    () => ({
      total: offers?.length ?? 0,
      published: offers?.filter((o) => o.lifecycleStatus === 'published').length ?? 0,
      inReview: offers?.filter((o) => o.lifecycleStatus === 'in_review').length ?? 0,
    }),
    [offers],
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-sm font-medium text-bee-content-primary">Офферы</h1>
          <p className="mt-1 text-body-sm text-bee-content-secondary">
            Каталог предложений партнёра — от черновика до публикации в каналах.
          </p>
        </div>
        <LinkButton to="/offers/new" className="gap-2">
          <Plus size={18} /> Новый оффер
        </LinkButton>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-bee-lg bg-bee-surface-yellow/40 px-4 py-3 text-caption text-bee-content-secondary">
        <span>
          У каждого оффера своя модель денег: <b className="font-medium text-bee-content-primary">купон, CPA, CPS или подписка</b>.
          Она задаётся при создании оффера и определяет расчёт и нужный уровень интеграции.
        </span>
        <Link to="/calculator" className="font-medium text-bee-link-primary hover:underline">
          Сравнить модели
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <MetricTile label="Всего офферов" value={counters.total} />
        <MetricTile label="Опубликовано" value={counters.published} />
        <MetricTile label="На модерации" value={counters.inReview} />
      </div>

      <Card className="p-0">
        <div className="flex flex-col gap-3 border-b border-bee-border-secondary p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-bee-content-tertiary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию или ID"
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
            <EmptyState
              title="Офферы не найдены"
              description="Измените фильтр или создайте новый оффер."
              action={<LinkButton to="/offers/new">Создать оффер</LinkButton>}
            />
          </div>
        ) : (
          <ul>
            {filtered.map((offer) => (
              <li key={offer.id} className="border-b border-bee-border-secondary last:border-0">
                <Link
                  to={`/offers/${offer.id}`}
                  className="flex items-center justify-between gap-4 p-4 hover:bg-bee-el-secondary"
                >
                  <div className="min-w-0">
                    <p className="truncate text-body-accent-sm font-medium text-bee-content-primary">
                      {offer.title}
                    </p>
                    <p className="text-caption text-bee-content-tertiary">
                      {offer.id} · версия {offer.currentLiveVersion ?? '—'}
                    </p>
                  </div>
                  {models?.[offer.id] && (
                    <span className="ml-auto hidden rounded-bee-pill bg-bee-el-secondary px-2.5 py-0.5 text-caption font-medium text-bee-content-secondary sm:inline">
                      {getOfferModel(models[offer.id]).title}
                    </span>
                  )}
                  <StatusPill tone={OFFER_STATUS_TONE[offer.lifecycleStatus]}>
                    {OFFER_STATUS_LABEL[offer.lifecycleStatus]}
                  </StatusPill>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
