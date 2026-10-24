import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Sparkles, ImagePlus, Loader2, RefreshCw, Eye } from 'lucide-react'
import { offerDraftSchema, type OfferDraftFormValues } from '@/utils/validation/onboarding'
import { generateOfferCopy, generateOfferIcon, AiClientError } from '@/lib/aiClient'
import { Button } from '@/components/Button'
import { TextField, TextareaField } from '@/components/form/Field'
import { OfferModelPicker } from './OfferModelPicker'
import { ModelEconomicsCalculator } from './ModelEconomicsCalculator'
import { OfferCustomerPreviewModal } from './OfferCustomerPreviewModal'
import {
  DEFAULT_OFFER_MODEL,
  OFFER_MODELS,
  fitOf,
  getOfferModel,
  normalizeForModel,
  recommendedLevels,
} from '@/content/offerModels'
import type { IntegrationLevelValue } from '@/content/integrationLevels'
import type { OfferModel } from '@/mock-api/types'

type ImageBrief = { imagePrompt?: string; badge?: string }

export function todayPlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function offerFormDefaults(overrides?: Partial<OfferDraftFormValues>): OfferDraftFormValues {
  return {
    title: '',
    model: DEFAULT_OFFER_MODEL,
    mechanic: 'coupon',
    benefit: '',
    description: '',
    couponPrice: '300',
    servicePrice: '900',
    region: 'РФ, все регионы',
    startDate: todayPlus(0),
    endDate: todayPlus(90),
    usageRules: 'Один купон на клиента.',
    refundRules: 'Возврат возможен до момента исполнения услуги.',
    supportContact: '',
    commissionModel: 'CPS',
    iconDataUrl: undefined,
    ...overrides,
  }
}

export function OfferForm({
  defaultValues,
  onSubmit,
  submitLabel,
  loading,
  disabled,
  partnerName,
  brandAssetDataUrl,
  integrationLevel,
  integrationHref = '/integration',
}: {
  defaultValues: OfferDraftFormValues
  onSubmit: (values: OfferDraftFormValues) => void | Promise<void>
  submitLabel: string
  loading?: boolean
  disabled?: boolean
  partnerName?: string
  /** Логотип или фото товара из шага «Бренд»: служит обложкой, пока партнёр не выберет другую. */
  brandAssetDataUrl?: string
  /** Текущий уровень интеграции партнёра — для подсказки, подходит ли он выбранной модели. */
  integrationLevel?: IntegrationLevelValue
  integrationHref?: string
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<OfferDraftFormValues>({
    resolver: zodResolver(offerDraftSchema),
    defaultValues,
  })

  const [rawIdea, setRawIdea] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [iconPending, setIconPending] = useState(false)
  const [iconError, setIconError] = useState<string | null>(null)
  const [imageBrief, setImageBrief] = useState<ImageBrief>({})
  const iconDataUrl = watch('iconDataUrl')
  const hasGenerated = !!watch('title')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [modelTouched, setModelTouched] = useState(false)
  const model = watch('model')
  const modelInfo = getOfferModel(model)

  function applyModel(next: OfferModel) {
    const normalized = normalizeForModel(next, getValues('mechanic'), getValues('commissionModel'))
    setValue('model', next, { shouldDirty: true })
    setValue('mechanic', normalized.mechanic, { shouldDirty: true })
    setValue('commissionModel', normalized.commissionModel, { shouldDirty: true })
  }

  async function onGenerate() {
    if (!rawIdea.trim()) {
      setGenerateError('Опишите в двух словах, что партнёр хочет предложить')
      return
    }
    setGenerating(true)
    setGenerateError(null)
    setIconError(null)
    const mechanic = getValues('mechanic')

    // Сначала текст: он же возвращает «режиссуру» обложки (imagePrompt + плашка скидки),
    // по которой рисуется картинка. Если текст не получился — рисуем по исходной идее.
    let brief: ImageBrief = {}
    try {
      const r = await generateOfferCopy({ mechanic, rawIdea })
      if (!modelTouched && OFFER_MODELS.some((m) => m.id === r.model)) applyModel(r.model)
      setValue('title', r.title, { shouldValidate: true, shouldDirty: true })
      setValue('benefit', r.benefit, { shouldValidate: true, shouldDirty: true })
      setValue('description', r.description, { shouldValidate: true, shouldDirty: true })
      setValue('usageRules', r.usageRules, { shouldValidate: true, shouldDirty: true })
      setValue('refundRules', r.refundRules, { shouldValidate: true, shouldDirty: true })
      brief = { imagePrompt: r.imagePrompt, badge: r.badge }
    } catch (e) {
      setGenerateError(e instanceof AiClientError ? e.message : 'Не удалось сгенерировать текст оффера')
    }
    setImageBrief(brief)

    // Обложка из шага «Бренд» остаётся основой карточки: AI дорисовывает её только по явной кнопке.
    const brandCoverInUse = !!brandAssetDataUrl && getValues('iconDataUrl') === brandAssetDataUrl
    if (!brandCoverInUse) {
      try {
        const { dataUrl } = await generateOfferIcon({ idea: rawIdea, ...brief })
        setValue('iconDataUrl', dataUrl, { shouldDirty: true })
      } catch (e) {
        setIconError(e instanceof AiClientError ? e.message : 'Не удалось сгенерировать обложку')
      }
    }

    setGenerating(false)
  }

  async function onRegenerateIcon() {
    if (!rawIdea.trim()) {
      setIconError('Опишите идею оффера выше, чтобы сгенерировать обложку')
      return
    }
    setIconPending(true)
    setIconError(null)
    try {
      const { dataUrl } = await generateOfferIcon({ idea: rawIdea, ...imageBrief })
      setValue('iconDataUrl', dataUrl, { shouldDirty: true })
    } catch (e) {
      setIconError(e instanceof AiClientError ? e.message : 'Не удалось сгенерировать обложку')
    } finally {
      setIconPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      {/* Шаг 1: партнёр описывает идею одной фразой — AI генерирует название, тексты и обложку */}
      <div className="flex flex-col gap-3 rounded-bee-lg border border-dashed border-bee-border-secondary bg-bee-surface-yellow/20 p-4">
        <div>
          <p className="text-body-accent-sm font-medium text-bee-content-primary">
            Что партнёр хочет предложить?
          </p>
          <p className="text-caption text-bee-content-secondary">
            Опишите идею в одну-две фразы — AI сам придумает название, описание, условия и яркую обложку оффера.
            Поля ниже можно будет поправить вручную.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-bee-lg border border-bee-border-secondary bg-bee-bg-secondary">
            {iconDataUrl ? (
              <img src={iconDataUrl} alt="Обложка оффера" className="size-full object-cover" />
            ) : (
              <ImagePlus size={22} className="text-bee-content-tertiary" />
            )}
          </div>
          <div className="flex-1">
            <TextareaField
              label=""
              rows={2}
              value={rawIdea}
              onChange={(e) => setRawIdea(e.target.value)}
              placeholder="Например: скидка 20% на первую доставку для новых клиентов страхования путешествий"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" loading={generating} onClick={onGenerate}>
            {generating ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : <Sparkles size={16} className="mr-1.5" />}
            {hasGenerated ? 'Сгенерировать заново' : 'Сгенерировать оффер с помощью AI'}
          </Button>
          {iconDataUrl && (hasGenerated || !!brandAssetDataUrl) && (
            <Button type="button" priority="tertiary" size="m" loading={iconPending} onClick={onRegenerateIcon}>
              <RefreshCw size={14} className="mr-1.5" />{' '}
              {brandAssetDataUrl && iconDataUrl === brandAssetDataUrl ? 'Обложка от AI' : 'Другая обложка'}
            </Button>
          )}
        </div>
        {generateError && <p className="text-caption text-bee-error-tertiary">{generateError}</p>}
        {iconError && <p className="text-caption text-bee-error-tertiary">{iconError}</p>}
      </div>

      {/* Шаг 2: модель оффера — кто кому платит. От неё зависят расчёт и нужный уровень интеграции */}
      <fieldset disabled={disabled} className="flex flex-col gap-3 disabled:opacity-60">
        <div>
          <p className="text-body-accent-sm font-medium text-bee-content-primary">Как устроены деньги по этому офферу?</p>
          <p className="text-caption text-bee-content-secondary">
            Выберите модель — от неё зависят расчёт экономики и подходящий уровень интеграции.
            {!modelTouched && hasGenerated ? ' AI подобрал модель по вашему описанию, её можно изменить.' : ''}
          </p>
        </div>
        <OfferModelPicker
          value={model}
          onChange={(next) => {
            setModelTouched(true)
            applyModel(next)
          }}
          disabled={disabled}
        />
        {integrationLevel && <IntegrationFitNotice model={model} level={integrationLevel} href={integrationHref} />}
      </fieldset>

      {/* Шаг 3: остальные поля — уже заполнены AI, при необходимости скорректируйте */}
      <fieldset disabled={disabled} className="flex flex-col gap-3 disabled:opacity-60">
        <TextField label="Название оффера" error={errors.title?.message} {...register('title')} />
        <TextField label="Выгода для клиента" error={errors.benefit?.message} {...register('benefit')} />
        <TextareaField label="Описание" rows={2} error={errors.description?.message} {...register('description')} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label={modelInfo.priceLabel}
            type="number"
            step="1"
            error={errors.couponPrice?.message}
            {...register('couponPrice')}
          />
          <TextField
            label={modelInfo.regularPriceLabel}
            type="number"
            step="1"
            error={errors.servicePrice?.message}
            {...register('servicePrice')}
          />
        </div>

        <ModelEconomicsCalculator key={model} model={model} price={Number(watch('couponPrice')) || 0} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextField label="Регион действия" error={errors.region?.message} {...register('region')} />
          <TextField label="Дата начала" type="date" error={errors.startDate?.message} {...register('startDate')} />
          <TextField label="Дата окончания" type="date" error={errors.endDate?.message} {...register('endDate')} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextareaField label="Условия использования" rows={2} error={errors.usageRules?.message} {...register('usageRules')} />
          <TextareaField label="Условия возврата" rows={2} error={errors.refundRules?.message} {...register('refundRules')} />
        </div>
        <TextField
          label="Email поддержки клиентов"
          error={errors.supportContact?.message}
          {...register('supportContact')}
        />
      </fieldset>

      {/* Шаг 4: перед сохранением — посмотреть итог глазами клиента */}
      <div className="flex flex-col items-center gap-2 rounded-bee-lg border border-dashed border-bee-border-secondary bg-bee-bg-secondary p-4 text-center">
        <p className="text-body-accent-sm font-medium text-bee-content-primary">Готово? Посмотрите глазами клиента</p>
        <p className="max-w-sm text-caption text-bee-content-secondary">
          Так карточка оффера будет выглядеть в приложении Билайн — перед тем как отправить на модерацию.
        </p>
        <Button type="button" priority="secondary-on-primary" onClick={() => setPreviewOpen(true)}>
          <Eye size={16} className="mr-1.5" /> Посмотреть, как будет выглядеть для клиента
        </Button>
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={loading || isSubmitting} disabled={disabled}>
          {submitLabel}
        </Button>
      </div>

      <OfferCustomerPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        values={{
          title: watch('title'),
          benefit: watch('benefit'),
          description: watch('description'),
          couponPrice: Number(watch('couponPrice')) || 0,
          servicePrice: Number(watch('servicePrice')) || 0,
          region: watch('region'),
          startDate: watch('startDate'),
          endDate: watch('endDate'),
          usageRules: watch('usageRules'),
          refundRules: watch('refundRules'),
          supportContact: watch('supportContact'),
          partnerName: partnerName ?? 'Партнёр платформы МЁД',
          mechanic: watch('mechanic'),
          model,
          iconDataUrl: watch('iconDataUrl'),
        }}
      />
    </form>
  )
}

function IntegrationFitNotice({ model, level, href }: { model: OfferModel; level: IntegrationLevelValue; href: string }) {
  const fit = fitOf(model, level)
  const info = getOfferModel(model)
  const recommended = recommendedLevels(model).join(' или ')
  if (fit === 'not_recommended') {
    return (
      <div className="rounded-bee-md bg-bee-surface-yellow/50 p-3 text-caption text-bee-content-secondary">
        Для модели «{info.title}» у вас сейчас неподходящий уровень интеграции ({level}). Рекомендуем {recommended}.{' '}
        <Link to={href} className="font-medium text-bee-link-primary hover:underline">
          Изменить уровень интеграции
        </Link>
      </div>
    )
  }
  return (
    <div className="rounded-bee-md bg-bee-surface-green/50 p-3 text-caption text-bee-success-tertiary">
      Ваш уровень интеграции ({level}) подходит для модели «{info.title}».
    </div>
  )
}
