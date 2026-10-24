import { useState, type ReactNode } from 'react'
import { ImageIcon, Info, User, FileText, Briefcase, ChevronDown } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { formatMoneyMinor } from '@/utils/money'

export interface OfferPreviewValues {
  title: string
  benefit: string
  description: string
  couponPrice: number
  servicePrice: number
  region: string
  startDate: string
  endDate: string
  usageRules: string
  refundRules: string
  supportContact: string
  partnerName: string
  mechanic: string
  model?: string
  iconDataUrl?: string
}

const CTA_BY_MODEL: Record<string, string> = {
  voucher: 'Получить купон',
  cpa: 'Оставить заявку',
  cps: 'Перейти к покупке',
  subscription: 'Оформить подписку',
}
const CTA_BY_MECHANIC: Record<string, string> = {
  coupon: 'Получить купон',
  promocode: 'Получить промокод',
  subscription: 'Оформить подписку',
  service: 'Записаться',
}

function InfoRow({
  icon: Icon,
  label,
  open,
  onToggle,
  children,
}: {
  icon: typeof Info
  label: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="rounded-bee-lg bg-bee-el-secondary">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <Icon size={16} className="shrink-0 text-bee-content-primary" />
        <span className="flex-1 text-body-sm text-bee-content-primary">{label}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-bee-content-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="px-4 pb-3 pl-11 text-caption leading-relaxed text-bee-content-secondary">{children}</div>}
    </div>
  )
}

/** Макет карточки оффера «глазами клиента» по образцу экрана партнёрского предложения в
 *  приложении Билайн: обложка целиком, под ней заголовок и подпись, сворачиваемые блоки
 *  условий и цена с кнопкой. Партнёр пишет текст вслепую — даже приблизительное превью
 *  резко поднимает качество контента с первой попытки. */
export function OfferCustomerPreviewModal({
  open,
  onClose,
  values,
}: {
  open: boolean
  onClose: () => void
  values: OfferPreviewValues
}) {
  const [openRow, setOpenRow] = useState<string | null>(null)
  const toggle = (key: string) => setOpenRow((cur) => (cur === key ? null : key))
  const period =
    values.startDate && values.endDate
      ? `${new Date(values.startDate).toLocaleDateString('ru-RU')} – ${new Date(values.endDate).toLocaleDateString('ru-RU')}`
      : '—'
  const hasDiscount = values.servicePrice > values.couponPrice
  const perMonth = values.model === 'subscription' ? ' в месяц' : ''

  return (
    <Modal open={open} onClose={onClose} title="Превью для клиента">
      <div className="mx-auto flex w-full max-w-[340px] flex-col gap-3 rounded-[28px] bg-bee-bg-primary p-2.5 shadow-sm ring-1 ring-bee-border-secondary">
        <div className="overflow-hidden rounded-[22px]">
          {values.iconDataUrl ? (
            <img src={values.iconDataUrl} alt="" className="aspect-square w-full object-cover" />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center bg-bee-el-active">
              <div className="flex size-16 items-center justify-center rounded-bee-lg bg-bee-bg-secondary shadow-lg">
                <ImageIcon size={24} className="text-bee-content-tertiary" />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-[22px] bg-bee-bg-secondary px-4 pt-5 pb-4">
          <div className="flex flex-col gap-1.5">
            <h3 className="text-headline-sm leading-tight font-medium text-bee-content-primary">
              {values.title || 'Название оффера'}
            </h3>
            <p className="text-body-sm text-bee-content-tertiary">{values.benefit || 'Выгода для клиента'}</p>
          </div>

          <div className="flex flex-col gap-2">
            <InfoRow icon={Info} label="Что входит" open={openRow === 'included'} onToggle={() => toggle('included')}>
              {values.description || 'Описание оффера появится здесь.'}
            </InfoRow>
            <InfoRow icon={User} label="Как воспользоваться" open={openRow === 'howto'} onToggle={() => toggle('howto')}>
              {values.usageRules || 'Условия использования появятся здесь.'}
            </InfoRow>
            <InfoRow icon={FileText} label="Условия" open={openRow === 'terms'} onToggle={() => toggle('terms')}>
              {values.refundRules || 'Условия возврата появятся здесь.'}
              <br />
              {values.region || 'Регион не указан'} · действует {period}
            </InfoRow>
            <InfoRow icon={Briefcase} label="О партнёре" open={openRow === 'partner'} onToggle={() => toggle('partner')}>
              {values.partnerName || 'Партнёр платформы МЁД'}
              {values.supportContact ? ` · ${values.supportContact}` : ''}
            </InfoRow>
          </div>

          <div className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-headline-md leading-tight font-medium text-bee-content-primary">
                {values.couponPrice === 0
                  ? 'Бесплатно'
                  : `${formatMoneyMinor(Math.round(values.couponPrice * 100))}${perMonth}`}
              </span>
              {hasDiscount && (
                <span className="text-body-sm text-bee-content-tertiary line-through">
                  {formatMoneyMinor(Math.round(values.servicePrice * 100))}
                </span>
              )}
            </div>
            {hasDiscount && values.couponPrice > 0 && (
              <span className="text-caption text-bee-success-tertiary">
                Выгода {formatMoneyMinor(Math.round((values.servicePrice - values.couponPrice) * 100))}
              </span>
            )}
          </div>

          <Button fullWidth className="!opacity-100 shadow-sm" tabIndex={-1} aria-disabled="true">
            {(values.model && CTA_BY_MODEL[values.model]) || CTA_BY_MECHANIC[values.mechanic] || 'Купить'}
          </Button>
        </div>
      </div>
      <p className="mt-3 text-center text-caption text-bee-content-tertiary">
        Приблизительный макет — реальное оформление в приложении Билайн может отличаться.
      </p>
    </Modal>
  )
}
