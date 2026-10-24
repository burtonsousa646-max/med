import { useNavigate, useParams } from 'react-router-dom'
import { useCurrentPartnerId } from '@/hooks/useCurrentPartnerId'
import { usePartner } from '@/hooks/usePartners'
import { useIntegration } from '@/hooks/useIntegration'
import { deriveOfferModel } from '@/content/offerModels'
import { useOffer, useOfferVersions } from '@/hooks/useOffers'
import { useCreateOutlet, useOutlets } from '@/hooks/useOutlets'
import * as offersApi from '@/mock-api/resources/offers'
import { useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/Card'
import { OfferForm, offerFormDefaults } from '@/components/offers/OfferForm'
import { useUiStore } from '@/stores/uiStore'
import { useState } from 'react'
import type { OfferDraftFormValues } from '@/utils/validation/onboarding'

export function OfferConstructorPage() {
  const { offerId } = useParams<{ offerId: string }>()
  const navigate = useNavigate()
  const partnerId = useCurrentPartnerId()
  const pushToast = useUiStore((s) => s.pushToast)
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)

  const { data: offer } = useOffer(offerId)
  const { data: versions } = useOfferVersions(offerId)
  const { data: partner } = usePartner(partnerId)
  const { data: integration } = useIntegration(partnerId)
  const { data: outlets } = useOutlets(partnerId)
  const createOutlet = useCreateOutlet()

  const latestVersion = versions?.[0]
  const isEdit = !!offerId

  async function onSubmit(values: OfferDraftFormValues) {
    if (!partnerId) return
    setSaving(true)
    try {
      let outletId = latestVersion?.outletIds[0] ?? outlets?.[0]?.id
      if (!outletId) {
        const outlet = await createOutlet.mutateAsync({
          partnerId,
          name: 'Онлайн-точка',
          address: 'Онлайн',
          online: true,
          timezone: 'Europe/Moscow',
          hours: 'Круглосуточно',
        })
        outletId = outlet.id
      }

      const input = {
        partnerId,
        title: values.title,
        mechanic: values.mechanic,
        monetizationModel: values.model,
        benefit: values.benefit,
        description: values.description,
        couponPriceMinor: Math.round(Number(values.couponPrice) * 100),
        servicePriceMinor: Math.round(Number(values.servicePrice) * 100),
        region: values.region,
        startDate: new Date(values.startDate).toISOString(),
        endDate: new Date(values.endDate).toISOString(),
        usageRules: values.usageRules,
        refundRules: values.refundRules,
        supportContact: values.supportContact,
        commissionModel: values.commissionModel,
        outletIds: [outletId],
        iconDataUrl: values.iconDataUrl,
      }

      if (isEdit && offerId) {
        await offersApi.createNewDraftVersion(offerId, input)
        pushToast({ tone: 'success', title: 'Новая версия сохранена как черновик' })
        await qc.invalidateQueries({ queryKey: ['offers'] })
        navigate(`/offers/${offerId}`)
      } else {
        const { offer: created } = await offersApi.createOfferDraft(input)
        pushToast({ tone: 'success', title: 'Черновик оффера создан' })
        await qc.invalidateQueries({ queryKey: ['offers', partnerId] })
        navigate(`/offers/${created.id}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const defaultValues = latestVersion
    ? offerFormDefaults({
        title: offer?.title,
        model: latestVersion.monetizationModel ?? deriveOfferModel(latestVersion.mechanic, latestVersion.commissionModel),
        mechanic: latestVersion.mechanic,
        benefit: latestVersion.benefit,
        description: latestVersion.description,
        couponPrice: String(latestVersion.couponPrice.amountMinor / 100),
        servicePrice: String(latestVersion.servicePrice.amountMinor / 100),
        region: latestVersion.region,
        startDate: latestVersion.startDate.slice(0, 10),
        endDate: latestVersion.endDate.slice(0, 10),
        usageRules: latestVersion.usageRules,
        refundRules: latestVersion.refundRules,
        supportContact: latestVersion.supportContact,
        commissionModel: latestVersion.commissionModel,
        iconDataUrl: latestVersion.iconDataUrl ?? undefined,
      })
    : offerFormDefaults({ iconDataUrl: partner?.brandAssetDataUrl })

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-sm font-medium text-bee-content-primary">
          {isEdit ? `Новая версия: ${offer?.title ?? ''}` : 'Новый оффер'}
        </h1>
        <p className="mt-1 text-body-sm text-bee-content-secondary">
          {isEdit
            ? 'Опубликованная версия остаётся неизменной — сохранение создаёт новую версию на модерацию.'
            : 'Заполните карточку оффера. После сохранения черновика можно отправить его на модерацию.'}
        </p>
      </div>
      <OfferForm
        key={latestVersion?.id ?? 'new'}
        defaultValues={defaultValues}
        onSubmit={onSubmit}
        submitLabel={isEdit ? 'Сохранить новую версию' : 'Сохранить черновик'}
        loading={saving || createOutlet.isPending}
        partnerName={partner?.legalName}
        brandAssetDataUrl={partner?.brandAssetDataUrl}
        integrationLevel={integration && integration.lifecycleStatus !== 'not_configured' ? integration.level : undefined}
      />
    </Card>
  )
}
