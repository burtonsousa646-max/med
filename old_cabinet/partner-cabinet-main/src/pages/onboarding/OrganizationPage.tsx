import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { organizationSchema, type OrganizationFormValues } from '@/utils/validation/onboarding'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { usePartner, useCreateDraftPartner, usePatchPartner, useSubmitPartnerForCheck } from '@/hooks/usePartners'
import { isLookupReady, lookupCompanyByInn } from '@/content/companyDirectory'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { TextField, SelectField } from '@/components/form/Field'
import { useUiStore } from '@/stores/uiStore'

const LEGAL_FORM_OPTIONS = [
  { value: 'ООО', label: 'ООО' },
  { value: 'АО', label: 'АО' },
  { value: 'ИП', label: 'ИП' },
]

const EXAMPLE_INN = '7707083893'

/** Шаг «Организация» начинается с ИНН: реквизиты подставляются автоматически (в демо — из
 *  справочника), остальное можно отредактировать. */
export function OrganizationPage() {
  const navigate = useNavigate()
  const contact = useOnboardingStore((s) => s.contact)
  const draftPartnerId = useOnboardingStore((s) => s.draftPartnerId)
  const setDraftPartnerId = useOnboardingStore((s) => s.setDraftPartnerId)
  const pushToast = useUiStore((s) => s.pushToast)

  const { data: existingPartner } = usePartner(draftPartnerId ?? undefined)
  const createDraft = useCreateDraftPartner()
  const patchDraft = usePatchPartner()
  const submitForCheck = useSubmitPartnerForCheck()
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'found'>('idle')
  const lookedUpInn = useRef<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      legalForm: 'ООО',
      legalName: '',
      taxId: '',
      kpp: '',
      ogrn: '',
      address: '',
      signatoryName: contact ? `${contact.lastName} ${contact.firstName}` : '',
      signatoryBasis: 'Устав',
      contactEmail: contact?.email ?? '',
      contactPhone: contact?.phone ?? '',
    },
  })

  useEffect(() => {
    if (existingPartner) reset({ ...existingPartner, kpp: existingPartner.kpp ?? '' })
  }, [existingPartner, reset])

  useEffect(() => {
    if (!contact) navigate('/onboarding/registration', { replace: true })
  }, [contact, navigate])

  const taxId = watch('taxId')

  useEffect(() => {
    if (!isLookupReady(taxId)) {
      if (!existingPartner) setLookup('idle')
      return
    }
    if (existingPartner && existingPartner.taxId === taxId) {
      setLookup('found')
      return
    }
    if (lookedUpInn.current === taxId) return
    setLookup('loading')
    const timer = window.setTimeout(() => {
      const company = lookupCompanyByInn(taxId)
      lookedUpInn.current = taxId
      setValue('legalForm', company.legalForm, { shouldValidate: true })
      setValue('legalName', company.legalName, { shouldValidate: true })
      setValue('kpp', company.kpp)
      setValue('ogrn', company.ogrn, { shouldValidate: true })
      setValue('address', company.address, { shouldValidate: true })
      setValue('signatoryName', company.signatoryName, { shouldValidate: true })
      setValue('signatoryBasis', company.signatoryBasis, { shouldValidate: true })
      setValue('contactEmail', contact?.email || company.contactEmail, { shouldValidate: true })
      setValue('contactPhone', /^\+7\d{10}$/.test(contact?.phone ?? '') ? contact!.phone : company.contactPhone, {
        shouldValidate: true,
      })
      setLookup('found')
    }, 650)
    return () => window.clearTimeout(timer)
  }, [taxId, existingPartner, contact, setValue])

  const showFields = lookup === 'found'
  const legalForm = watch('legalForm')
  const taxReg = register('taxId')

  async function saveDraft(values: OrganizationFormValues) {
    const partner = existingPartner
      ? await patchDraft.mutateAsync({
          partnerId: existingPartner.id,
          patch: values,
          expectedVersion: existingPartner.version,
        })
      : await createDraft.mutateAsync(values)
    setDraftPartnerId(partner.id)
    pushToast({ tone: 'success', title: 'Черновик сохранён' })
    return partner
  }

  async function onSaveDraft(values: OrganizationFormValues) {
    await saveDraft(values)
  }

  async function onSubmitForCheck(values: OrganizationFormValues) {
    const partner = await saveDraft(values)
    await submitForCheck.mutateAsync(partner.id)
    navigate('/onboarding/verification')
  }

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-sm font-medium text-bee-content-primary">Организация</h1>
        <p className="mt-1 text-body-sm text-bee-content-secondary">
          Реквизиты юридического лица. Черновик можно сохранить и вернуться к нему позже.
        </p>
      </div>
      <form className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <TextField
            label="ИНН юридического лица"
            inputMode="numeric"
            maxLength={12}
            autoComplete="off"
            placeholder="10 цифр"
            error={errors.taxId?.message}
            {...taxReg}
            onChange={(e) => {
              e.target.value = e.target.value.replace(/\D/g, '').slice(0, 12)
              void taxReg.onChange(e)
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-bee-content-tertiary">
            <span>Для демо подойдёт любой 10-значный ИНН</span>
            <button
              type="button"
              className="font-medium text-bee-link-primary hover:underline"
              onClick={() => setValue('taxId', EXAMPLE_INN, { shouldValidate: true })}
            >
              Подставить пример
            </button>
          </div>
          {lookup === 'loading' && (
            <p className="flex items-center gap-2 text-caption text-bee-content-secondary" role="status">
              <Loader2 size={14} className="animate-spin" /> Ищем организацию
            </p>
          )}
        </div>

        {showFields && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2 rounded-bee-md bg-bee-surface-green/60 p-3 text-caption text-bee-success-tertiary" role="status">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <span>
                <b className="font-medium">Организация найдена.</b> Демонстрационные данные можно отредактировать.
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField label="Форма" options={LEGAL_FORM_OPTIONS} {...register('legalForm')} />
              <TextField label="Полное наименование" error={errors.legalName?.message} {...register('legalName')} />
              {legalForm !== 'ИП' && <TextField label="КПП" error={errors.kpp?.message} {...register('kpp')} />}
              <TextField
                label={legalForm === 'ИП' ? 'ОГРНИП' : 'ОГРН'}
                error={errors.ogrn?.message}
                {...register('ogrn')}
              />
              <div className="sm:col-span-2">
                <TextField label="Юридический адрес" error={errors.address?.message} {...register('address')} />
              </div>
              <TextField label="ФИО подписанта" error={errors.signatoryName?.message} {...register('signatoryName')} />
              <TextField
                label="Основание полномочий"
                hint="Например: Устав, доверенность №…"
                error={errors.signatoryBasis?.message}
                {...register('signatoryBasis')}
              />
              <TextField label="Email для связи" error={errors.contactEmail?.message} {...register('contactEmail')} />
              <TextField label="Телефон для связи" error={errors.contactPhone?.message} {...register('contactPhone')} />
            </div>
          </div>
        )}

        <div className="mt-2 flex flex-col-reverse justify-end gap-3 sm:flex-row">
          <Button
            type="button"
            priority="secondary-on-primary"
            disabled={!showFields}
            loading={(createDraft.isPending || patchDraft.isPending) && !submitForCheck.isPending}
            onClick={handleSubmit(onSaveDraft)}
          >
            Сохранить черновик
          </Button>
          <Button
            type="button"
            disabled={!showFields}
            loading={submitForCheck.isPending}
            onClick={handleSubmit(onSubmitForCheck)}
          >
            Отправить на проверку
          </Button>
        </div>
      </form>
    </Card>
  )
}
