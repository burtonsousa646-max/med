import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  integrationQuestionnaireSchema,
  type IntegrationQuestionnaireValues,
} from '@/utils/validation/onboarding'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { useSessionStore } from '@/stores/sessionStore'
import { usePartner } from '@/hooks/usePartners'
import { useConfigureIntegration } from '@/hooks/useIntegration'
import { useOfferModels } from '@/hooks/useOffers'
import * as membershipsApi from '@/mock-api/resources/memberships'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { TextareaField, TextField } from '@/components/form/Field'
import { EmptyState } from '@/components/EmptyState'
import { IntegrationLevelPicker } from '@/components/integration/IntegrationLevelPicker'
import { OfferFitSummary } from '@/components/integration/OfferFitSummary'
import { INTEGRATION_LEVELS, type IntegrationLevelValue } from '@/content/integrationLevels'
import { recommendedLevels } from '@/content/offerModels'

const DEFAULT_CONNECTOR: Record<IntegrationLevelValue, string> = {
  L0: 'Ручное подтверждение в ЛК',
  L1: 'Postback и файл статусов',
  L2: 'Коннектор к CRM, ERP или кассе',
  L3: 'API с webhooks и sandbox',
}

/** Последний шаг подключения: уровень интеграции подбирается под модели уже созданных офферов,
 *  после него партнёр попадает в кабинет. */
export function IntegrationPage() {
  const navigate = useNavigate()
  const draftPartnerId = useOnboardingStore((s) => s.draftPartnerId)
  const contact = useOnboardingStore((s) => s.contact)
  const onboardingReset = useOnboardingStore((s) => s.reset)
  const signInAsCustom = useSessionStore((s) => s.signInAsCustom)
  const { data: partner } = usePartner(draftPartnerId ?? undefined)
  const { data: models } = useOfferModels(draftPartnerId ?? undefined)
  const configureIntegration = useConfigureIntegration()
  const [levelTouched, setLevelTouched] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<IntegrationQuestionnaireValues>({
    resolver: zodResolver(integrationQuestionnaireSchema),
    defaultValues: { level: 'L0', connector: DEFAULT_CONNECTOR.L0, notes: '' },
  })
  const level = watch('level')

  // Самый нижний «рекомендуемый» уровень, который подходит сразу всем созданным офферам.
  const recommended: IntegrationLevelValue | null = (() => {
    const ids = [...new Set(Object.values(models ?? {}))]
    if (ids.length === 0) return null
    const order = INTEGRATION_LEVELS.map((l) => l.value)
    const lowest = ids.map((id) => Math.min(...recommendedLevels(id).map((l) => order.indexOf(l))))
    return order[Math.max(...lowest)]
  })()

  function applyLevel(next: IntegrationLevelValue) {
    const connector = getValues('connector')
    setValue('level', next, { shouldDirty: true })
    if (!connector || Object.values(DEFAULT_CONNECTOR).includes(connector)) {
      setValue('connector', DEFAULT_CONNECTOR[next])
    }
  }

  useEffect(() => {
    if (recommended && !levelTouched) applyLevel(recommended)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommended])

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

  async function onSubmit(values: IntegrationQuestionnaireValues) {
    setFinishing(true)
    try {
      await configureIntegration.mutateAsync({ partnerId: draftPartnerId!, ...values })
      if (!contact || !partner) return
      const userId = `u-${draftPartnerId}`
      await membershipsApi.createMembership({
        partnerId: partner.id,
        userId,
        displayName: `${contact.lastName} ${contact.firstName}`,
        email: contact.email,
        scope: 'partner',
        role: 'owner',
      })
      signInAsCustom({
        id: userId,
        displayName: `${contact.lastName} ${contact.firstName} — владелец`,
        scope: 'partner',
        role: 'owner',
        partnerId: partner.id,
      })
      onboardingReset()
      navigate('/dashboard')
    } finally {
      setFinishing(false)
    }
  }

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-sm font-medium text-bee-content-primary">Интеграция</h1>
        <p className="mt-1 text-body-sm text-bee-content-secondary">
          Мы свяжемся с вами для интеграции сервиса и сопроводим на всех этапах — до первых покупок. Уровень зависит от
          модели оффера, мы подобрали его по созданному предложению.
        </p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {recommended && (
          <div className="rounded-bee-md bg-bee-surface-green/50 p-3 text-caption text-bee-success-tertiary">
            Рекомендуем уровень {recommended} — он подходит моделям ваших офферов.
          </div>
        )}
        <div className="flex flex-col gap-2">
          <p className="text-body-sm font-medium text-bee-content-primary">Как будете исполнять заказы?</p>
          <IntegrationLevelPicker
            compact
            value={level}
            onChange={(v) => {
              setLevelTouched(true)
              applyLevel(v)
            }}
          />
        </div>
        <OfferFitSummary partnerId={draftPartnerId} level={level} />
        <TextField
          label="Способ обмена данными"
          hint="Например: ручное подтверждение, CRM «Мой склад», собственное API"
          error={errors.connector?.message}
          {...register('connector')}
        />
        <TextareaField label="Комментарий (необязательно)" {...register('notes')} />
        <p className="text-caption text-bee-content-tertiary">Способ можно изменить позже</p>

        <div className="mt-2 flex justify-end">
          <Button type="submit" loading={finishing || configureIntegration.isPending}>
            Завершить подключение
          </Button>
        </div>
      </form>
    </Card>
  )
}
