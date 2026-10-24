import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Paperclip, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { useAssistantStore } from '@/stores/assistantStore'
import { useUiStore } from '@/stores/uiStore'
import { usePartner, useSaveBrandAssets } from '@/hooks/usePartners'
import { prepareBrandImage } from '@/utils/image'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { CheckboxField } from '@/components/form/Field'
import { EmptyState } from '@/components/EmptyState'

type Kind = 'logo' | 'product'
interface Asset {
  kind: Kind
  dataUrl: string
  name: string
}

function UploadBox({
  id,
  title,
  caption,
  accept,
  selected,
  onFile,
}: {
  id: string
  title: string
  caption: string
  accept: string
  selected: boolean
  onFile: (file: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className={clsx('rounded-bee-lg border border-dashed transition-colors', selected ? 'border-bee-brand-primary bg-bee-surface-yellow/30' : 'border-bee-border-secondary bg-bee-bg-secondary hover:border-bee-brand-primary/60')}>
      <input
        ref={ref}
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
      <label htmlFor={id} className="flex cursor-pointer items-center gap-3 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-bee-md bg-bee-el-secondary text-bee-content-secondary">
          <Paperclip size={18} />
        </span>
        <span className="min-w-0">
          <b className="block text-body-accent-sm font-medium text-bee-content-primary">{title}</b>
          <span className="block truncate text-caption text-bee-content-tertiary">{caption}</span>
        </span>
      </label>
    </div>
  )
}

/** Шаг «Бренд»: согласие на использование товарного знака и логотип (или фото товара) —
 *  основа обложки будущих офферов. */
export function BrandPage() {
  const navigate = useNavigate()
  const draftPartnerId = useOnboardingStore((s) => s.draftPartnerId)
  const { data: partner } = usePartner(draftPartnerId ?? undefined)
  const saveBrand = useSaveBrandAssets()
  const pushToast = useUiStore((s) => s.pushToast)
  const [consent, setConsent] = useState(false)
  const [asset, setAsset] = useState<Asset | null>(null)
  const [busy, setBusy] = useState(false)
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    if (!partner || restored) return
    setRestored(true)
    if (partner.trademarkConsentAt) setConsent(true)
    if (partner.brandAssetDataUrl && partner.brandAssetKind) {
      setAsset({ kind: partner.brandAssetKind, dataUrl: partner.brandAssetDataUrl, name: partner.brandAssetName ?? 'Материал бренда' })
    }
  }, [partner, restored])

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

  async function onFile(kind: Kind, file: File) {
    setBusy(true)
    try {
      const dataUrl = await prepareBrandImage(file)
      setAsset({ kind, dataUrl, name: file.name })
    } catch (e) {
      pushToast({ tone: 'error', title: e instanceof Error ? e.message : 'Не удалось загрузить файл' })
    } finally {
      setBusy(false)
    }
  }

  function askAi() {
    const store = useAssistantStore.getState()
    store.setOpen(true)
    void store.ask('Помоги подготовить логотип или фото товара для карточки оффера')
  }

  async function onContinue() {
    if (!consent) return pushToast({ tone: 'error', title: 'Подтвердите право на использование материалов бренда' })
    if (!asset) return pushToast({ tone: 'error', title: 'Прикрепите логотип или фото товара' })
    await saveBrand.mutateAsync({ partnerId: draftPartnerId!, kind: asset.kind, dataUrl: asset.dataUrl, fileName: asset.name })
    navigate('/onboarding/first-offer')
  }

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-sm font-medium text-bee-content-primary">Бренд и товарный знак</h1>
        <p className="mt-1 text-body-sm text-bee-content-secondary">
          Подтвердите право использовать материалы бренда и добавьте изображение для будущих карточек.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-bee-lg bg-bee-bg-primary p-4">
        <b className="text-body-accent-sm font-medium text-bee-content-primary">Согласие на использование товарного знака</b>
        <p className="text-caption text-bee-content-secondary">
          Вы разрешаете платформе МЁД использовать загруженный товарный знак и материалы бренда только для размещения и
          продвижения согласованных офферов.
        </p>
        <CheckboxField
          id="brand-consent"
          label="Подтверждаю право передавать эти материалы и согласен(-на) на их использование в карточках офферов"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <UploadBox
          id="brand-logo"
          title="Прикрепить логотип"
          caption={asset?.kind === 'logo' ? asset.name : 'PNG, JPG, WEBP или SVG'}
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          selected={asset?.kind === 'logo'}
          onFile={(f) => onFile('logo', f)}
        />
        <UploadBox
          id="brand-product"
          title="Или добавить фото товара"
          caption={asset?.kind === 'product' ? asset.name : 'Если логотипа пока нет'}
          accept="image/png,image/jpeg,image/webp"
          selected={asset?.kind === 'product'}
          onFile={(f) => onFile('product', f)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-bee-lg border border-bee-border-secondary p-3">
        <span className="max-w-md text-caption text-bee-content-secondary">
          ИИ поможет выбрать формат, проверить качество и подготовить изображение для карточки.
        </span>
        <Button type="button" priority="secondary-on-primary" size="m" onClick={askAi}>
          <Sparkles size={16} className="mr-1.5" /> Помощь ИИ
        </Button>
      </div>

      <div className="flex items-center gap-4 rounded-bee-lg border border-bee-border-secondary p-4">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-bee-lg bg-bee-el-secondary">
          {asset ? (
            <img src={asset.dataUrl} alt="Предпросмотр материала бренда" className="size-full object-contain" />
          ) : (
            <span className="text-body-accent-md font-medium text-bee-content-tertiary">МЁД</span>
          )}
        </div>
        <div>
          <b className="block text-body-accent-sm font-medium text-bee-content-primary">
            {!asset ? 'Изображение пока не добавлено' : asset.kind === 'logo' ? 'Логотип добавлен' : 'Фото товара добавлено'}
          </b>
          <span className="text-caption text-bee-content-secondary">
            {!asset
              ? 'Прикрепите логотип или фото товара — оно станет основой карточки оффера.'
              : asset.kind === 'logo'
                ? 'Используем логотип в карточке и материалах согласованных офферов.'
                : 'Используем фото товара как главное изображение карточки.'}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-caption text-bee-content-tertiary">Материалы будут использоваться только в согласованных офферах</span>
        <div className="flex gap-3">
          <Button type="button" priority="secondary-on-primary" size="m" onClick={() => navigate('/onboarding/agreement')}>
            Назад
          </Button>
          <Button type="button" size="m" loading={busy || saveBrand.isPending} onClick={onContinue}>
            Сохранить и продолжить
          </Button>
        </div>
      </div>
    </Card>
  )
}
