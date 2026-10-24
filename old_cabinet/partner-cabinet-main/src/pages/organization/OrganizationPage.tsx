import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { organizationSchema, type OrganizationFormValues } from '@/utils/validation/onboarding'
import { innLabelFor } from '@/utils/validation/inn'
import { useCurrentPartnerId } from '@/hooks/useCurrentPartnerId'
import { usePartner, usePatchPartner } from '@/hooks/usePartners'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { LinkButton } from '@/components/LinkButton'
import { StatusPill } from '@/components/StatusPill'
import { TextField, SelectField } from '@/components/form/Field'
import { useUiStore } from '@/stores/uiStore'

const LEGAL_FORM_OPTIONS = [
  { value: 'ООО', label: 'ООО' },
  { value: 'АО', label: 'АО' },
  { value: 'ИП', label: 'ИП' },
]

const PARTNER_STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  submitted: 'Отправлено',
  checking: 'На проверке',
  needs_info: 'Нужны уточнения',
  approved: 'Проверка пройдена',
  active: 'Активен',
  suspended: 'Приостановлен',
  terminating: 'Завершение',
  terminated: 'Завершено',
  rejected: 'Отклонён',
}

export function OrganizationPage() {
  const partnerId = useCurrentPartnerId()
  const { data: partner } = usePartner(partnerId)
  const patchPartner = usePatchPartner()
  const pushToast = useUiStore((s) => s.pushToast)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<OrganizationFormValues>({ resolver: zodResolver(organizationSchema) })

  useEffect(() => {
    if (partner) reset(partner)
  }, [partner, reset])

  if (!partner) return <p className="text-body-sm text-bee-content-tertiary">Загрузка…</p>

  const legalForm = watch('legalForm') || partner.legalForm
  const criticalChanged = (v: OrganizationFormValues) => v.taxId !== partner.taxId || v.legalName !== partner.legalName

  async function onSubmit(values: OrganizationFormValues) {
    const willRecheck = criticalChanged(values)
    await patchPartner.mutateAsync({ partnerId: partner!.id, patch: values, expectedVersion: partner!.version })
    pushToast({
      tone: 'success',
      title: 'Профиль сохранён',
      description: willRecheck ? 'Изменение реквизитов ИНН/названия в реальной системе потребует повторной проверки' : undefined,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-sm font-medium text-bee-content-primary">Организация</h1>
          <p className="mt-1 text-body-sm text-bee-content-secondary">Реквизиты юридического лица.</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill tone={partner.lifecycleStatus === 'active' ? 'good' : 'wait'}>
            {PARTNER_STATUS_LABEL[partner.lifecycleStatus] ?? partner.lifecycleStatus}
          </StatusPill>
          <LinkButton to="/organization/outlets" priority="secondary-on-primary" size="m">
            Точки
          </LinkButton>
        </div>
      </div>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <SelectField label="Форма" options={LEGAL_FORM_OPTIONS} {...register('legalForm')} />
          <TextField label="Полное наименование" error={errors.legalName?.message} {...register('legalName')} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label={innLabelFor(legalForm)} error={errors.taxId?.message} {...register('taxId')} />
            <TextField label={legalForm === 'ИП' ? 'ОГРНИП' : 'ОГРН'} error={errors.ogrn?.message} {...register('ogrn')} />
          </div>
          {legalForm !== 'ИП' && <TextField label="КПП" error={errors.kpp?.message} {...register('kpp')} />}
          <TextField label="Юридический адрес" error={errors.address?.message} {...register('address')} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="ФИО подписанта" error={errors.signatoryName?.message} {...register('signatoryName')} />
            <TextField label="Основание полномочий" error={errors.signatoryBasis?.message} {...register('signatoryBasis')} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Email для связи" error={errors.contactEmail?.message} {...register('contactEmail')} />
            <TextField label="Телефон для связи" error={errors.contactPhone?.message} {...register('contactPhone')} />
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={patchPartner.isPending}>
              Сохранить
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
