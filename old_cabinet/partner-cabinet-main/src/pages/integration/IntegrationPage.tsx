import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  integrationQuestionnaireSchema,
  type IntegrationQuestionnaireValues,
} from '@/utils/validation/onboarding'
import { useCurrentPartnerId } from '@/hooks/useCurrentPartnerId'
import { useIntegration, useConfigureIntegration } from '@/hooks/useIntegration'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { LinkButton } from '@/components/LinkButton'
import { StatusPill } from '@/components/StatusPill'
import { TextField, TextareaField } from '@/components/form/Field'
import { IntegrationLevelPicker } from '@/components/integration/IntegrationLevelPicker'
import { OfferFitSummary } from '@/components/integration/OfferFitSummary'
import { useUiStore } from '@/stores/uiStore'

export function IntegrationPage() {
  const partnerId = useCurrentPartnerId()
  const { data: integration } = useIntegration(partnerId)
  const configure = useConfigureIntegration()
  const pushToast = useUiStore((s) => s.pushToast)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<IntegrationQuestionnaireValues>({
    resolver: zodResolver(integrationQuestionnaireSchema),
    defaultValues: { level: 'L0', connector: '', notes: '' },
  })

  useEffect(() => {
    if (integration) reset({ level: integration.level, connector: integration.connector, notes: integration.notes })
  }, [integration, reset])

  async function onSubmit(values: IntegrationQuestionnaireValues) {
    if (!partnerId) return
    await configure.mutateAsync({ partnerId, ...values })
    pushToast({ tone: 'success', title: 'Настройки интеграции сохранены' })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-sm font-medium text-bee-content-primary">Интеграция</h1>
          <p className="mt-1 text-body-sm text-bee-content-secondary">
            Уровень, коннектор и состояние подключения. Точный контракт — RFC, согласуется отдельно.
          </p>
        </div>
        {integration && (
          <div className="flex items-center gap-3">
            <StatusPill tone={integration.lifecycleStatus === 'active' ? 'good' : 'wait'}>
              {integration.lifecycleStatus}
            </StatusPill>
            <LinkButton to="/integration/sandbox" priority="secondary-on-primary" size="m">
              Sandbox
            </LinkButton>
          </div>
        )}
      </div>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-body-sm font-medium text-bee-content-primary">Уровень интеграции</p>
            <IntegrationLevelPicker
              value={watch('level')}
              onChange={(v) => setValue('level', v, { shouldDirty: true })}
            />
          </div>
          <OfferFitSummary partnerId={partnerId} level={watch('level')} offersHref="/offers/new" />
          <TextField label="Способ обмена данными" error={errors.connector?.message} {...register('connector')} />
          <TextareaField label="Комментарий" {...register('notes')} />
          <div className="flex justify-end">
            <Button type="submit" loading={configure.isPending}>
              Сохранить
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
