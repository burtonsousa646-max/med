import { useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { offerCreativeCopy, resolveOfferLayout, type OfferDraft } from '../../shared/campaign-offer.ts'
import './campaign-creative.css'

export function CampaignCreative({ name, offer, image, illustration, logo, disabled }: {
  name: string; offer: OfferDraft; image: string; illustration: string; logo: string; disabled: boolean
}) {
  const [failedLogo, setFailedLogo] = useState('')
  const [failedImage, setFailedImage] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const [revealed, setRevealed] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const source = image || illustration
  const layout = resolveOfferLayout(offer.layout, Boolean(source && source !== failedImage))
  const brand = name.replace(/^.*«(.+)»$/, '$1')
  const { benefit, title } = offerCreativeCopy(offer)
  return <><article className={'campaign-creative cr--' + offer.tone} aria-label="Креатив оффера">
    <div className="campaign-creative__layout" data-layout={layout} data-zoom={offer.zoom}>
      <div className="campaign-creative__copy">
        {logo && logo !== failedLogo
          ? <img className="campaign-creative__logo" src={logo} alt={brand} onError={() => setFailedLogo(logo)} />
          : <span className="campaign-creative__brand">{brand}</span>}
        <div className="campaign-creative__message">
          {benefit && <strong className="campaign-creative__benefit" data-wide={benefit.length > 6}>{benefit}</strong>}
          {title && <span className="campaign-creative__title" data-benefit={Boolean(benefit)}>{title}</span>}
        </div>
      </div>
      {layout !== 'text' && <div className="campaign-creative__media">
        <img src={source} alt="" onError={() => setFailedImage(source)} />
      </div>}
      <div className="campaign-creative__terms">
        {offer.promo && <button type="button" className="campaign-creative__open" disabled={disabled}
          aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>Условия акции</button>}
        {offer.until && <time dateTime={offer.until}>до {offer.until.split('-').reverse().join('.')}</time>}
        <span className="campaign-creative__ad">реклама</span>
      </div>
    </div>
  </article>
    {offer.promo && <dialog ref={dialog} className="bl-modal campaign-creative-dialog" aria-labelledby={headingId}
      onKeyDown={event => event.stopPropagation()} onCancel={event => event.stopPropagation()}
      onClose={event => { event.stopPropagation(); setRevealed(false); setCopyStatus('') }}>
      <div className="campaign-creative-dialog__content">
        <button type="button" className="bl-icon-btn modal-close" aria-label="Закрыть" onClick={() => dialog.current?.close()}>
          <X size={20} aria-hidden="true"/>
        </button>
        <div className="campaign-creative-dialog__heading">
          <span className="bl-caption">{brand}</span>
          <h2 id={headingId} className="bl-h3">{offer.title}</h2>
          {offer.until && <time className="bl-caption" dateTime={offer.until}>Действует до {offer.until.split('-').reverse().join('.')}</time>}
        </div>
        {revealed ? <>
          <div className="near-code" data-long={offer.promo.length > 16}>{offer.promo}</div>
          <button type="button" className="bl-btn bl-btn--block" autoFocus onClick={async () => {
            try {
              await navigator.clipboard.writeText(offer.promo)
              setCopyStatus('Промокод скопирован')
            } catch {
              setCopyStatus('Выделите и скопируйте код вручную')
            }
          }}>Скопировать</button>
          {copyStatus && <span className="bl-caption" role="status">{copyStatus}</span>}
        </> : <button type="button" className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" autoFocus
          onClick={() => setRevealed(true)}>Показать промокод</button>}
      </div>
    </dialog>}
  </>
}
