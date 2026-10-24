import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { usePartner } from '@/hooks/usePartners'
import { useCreateOfferDraft } from '@/hooks/useOffers'
import { useCreateOutlet, useOutlets } from '@/hooks/useOutlets'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { OfferForm, offerFormDefaults } from '@/components/offers/OfferForm'
import type { OfferDraftFormValues } from '@/utils/validation/onboarding'

export function FirstOfferPage() {
  const navigate = useNavigate()
  const draftPartnerId = useOnboardingStore((s) => s.draftPartnerId)
  const contact = useOnboardingStore((s) => s.contact)
  const { data: partner } = usePartner(draftPartnerId ?? undefined)
  const { data: outlets } = useOutlets(draftPartnerId ?? undefined)
  const createOutlet = useCreateOutlet()
  const createOfferDraft = useCreateOfferDraft()
  const [createdTitle, setCreatedTitle] = useState<string | null>(null)

  if (!draftPartnerId || !partner) {
    return (
      <Card>
        <EmptyState
          title="Сначала заполните организацию"
          action={<Button onClick={() => navigate('/onboarding/organization')}>Перейти к организации</Button>}
        />
      </Card>
    )
  }

  async function onSubmit(values: OfferDraftFormValues) {
    let outletId = outlets?.[0]?.id
    if (!outletId) {
      const outlet = await createOutlet.mutateAsync({
        partnerId: draftPartnerId!,
        name: 'Онлайн-точка',
        address: 'Онлайн',
        online: true,
        timezone: 'Europe/Moscow',
        hours: 'Круглосуточно',
      })
      outletId = outlet.id
    }

    await createOfferDraft.mutateAsync({
      partnerId: draftPartnerId!,
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
    })
    setCreatedTitle(values.title)
  }

  if (createdTitle) {
    return (
      <Card className="flex flex-col items-center gap-4 py-10 text-center">
        <CheckCircle2 size={40} className="text-bee-success-primary" />
        <div>
          <h1 className="text-headline-sm font-medium text-bee-content-primary">Черновик оффера создан</h1>
          <p className="mt-1 max-w-md text-body-sm text-bee-content-secondary">
            «{createdTitle}» сохранён как черновик. Остался последний шаг — интеграция: мы подберём уровень под модель
            вашего оффера. Отправить оффер на модерацию можно будет из раздела «Офферы».
          </p>
        </div>
        <Button onClick={() => navigate('/onboarding/integration')}>Перейти к интеграции</Button>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-sm font-medium text-bee-content-primary">Создание предложения</h1>
        <p className="mt-1 text-body-sm text-bee-content-secondary">
          Опишите оффер и выберите модель — кто кому платит. После сохранения черновика подберём подходящий уровень
          интеграции.
        </p>
      </div>
      <OfferForm
        defaultValues={offerFormDefaults({ supportContact: contact?.email ?? '', iconDataUrl: partner.brandAssetDataUrl })}
        brandAssetDataUrl={partner.brandAssetDataUrl}
        onSubmit={onSubmit}
        submitLabel="Сохранить черновик и продолжить"
        loading={createOfferDraft.isPending || createOutlet.isPending}
        partnerName={partner.legalName}
      />
    </Card>
  )
}
