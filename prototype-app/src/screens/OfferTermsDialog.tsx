import { useId, useState, type RefObject } from 'react'
import { X } from 'lucide-react'
import type { OfferDraft } from '../../shared/campaign-offer'
import './campaign-creative.css'

export function OfferTermsDialog({dialog,brand,offer}:{
  dialog:RefObject<HTMLDialogElement|null>; brand:string; offer:Pick<OfferDraft,'title'|'promo'|'until'>
}) {
  const headingId = useId()
  const [revealed, setRevealed] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  return <dialog ref={dialog} className="bl-modal campaign-creative-dialog" aria-labelledby={headingId}
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
        {offer.promo && (revealed ? <>
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
          onClick={() => setRevealed(true)}>Показать промокод</button>)}
      </div>
    </dialog>
}
