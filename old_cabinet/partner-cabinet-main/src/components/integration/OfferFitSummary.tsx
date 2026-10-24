import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { useOffers, useOfferModels } from '@/hooks/useOffers'
import { FIT_LABEL, fitOf, getOfferModel, recommendedLevels } from '@/content/offerModels'
import type { IntegrationLevelValue } from '@/content/integrationLevels'
import { FIT_STYLE } from '@/components/offers/OfferModelPicker'

/** Подходит ли выбранный уровень интеграции офферам партнёра — по модели каждого оффера. */
export function OfferFitSummary({
  partnerId,
  level,
  offersHref,
}: {
  partnerId: string | undefined
  level: IntegrationLevelValue
  offersHref?: string
}) {
  const { data: offers } = useOffers(partnerId)
  const { data: models } = useOfferModels(partnerId)

  if (!offers || !models) return null
  if (offers.length === 0) {
    return (
      <div className="rounded-bee-md bg-bee-bg-primary p-3 text-caption text-bee-content-secondary">
        Офферов пока нет. Когда вы создадите оффер, мы подскажем, какой уровень интеграции ему подходит.
        {offersHref && (
          <>
            {' '}
            <Link to={offersHref} className="font-medium text-bee-link-primary hover:underline">
              Создать оффер
            </Link>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-bee-lg border border-bee-border-secondary bg-bee-bg-primary p-4">
      <p className="text-body-accent-sm font-medium text-bee-content-primary">
        Подходит ли уровень {level} вашим офферам
      </p>
      <ul className="flex flex-col gap-1.5">
        {offers.map((offer) => {
          const modelId = models[offer.id]
          if (!modelId) return null
          const model = getOfferModel(modelId)
          const fit = fitOf(modelId, level)
          return (
            <li key={offer.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption">
              <span className="font-medium text-bee-content-primary">{offer.title}</span>
              <span className="text-bee-content-tertiary">· {model.title}</span>
              <span className={clsx('rounded-bee-pill px-2 py-0.5', FIT_STYLE[fit])}>{FIT_LABEL[fit]}</span>
              {fit === 'not_recommended' && (
                <span className="text-bee-content-secondary">лучше {recommendedLevels(modelId).join(' или ')}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
