import { type CSSProperties, useRef, useState } from 'react'
import { OfferTermsDialog } from './OfferTermsDialog'
import { offerTextColor, offerCreativeCopy, resolveOfferLayout, type OfferDraft } from '../../shared/campaign-offer.ts'
import './campaign-creative.css'

export function CampaignCreative({ name, brandName, offer, image, illustration, logo, disabled, onEdit, onTitleChange, onTerms, erid, legalNameBelow }: {
  name: string; brandName?:string; offer: OfferDraft; image: string; illustration: string; logo: string; disabled: boolean;
  onTerms?: () => void; erid?: string; legalNameBelow?: boolean;
  onEdit?: (panel: 'text' | 'media' | 'terms') => void; onTitleChange?: (title: string) => void;
}) {
  const [failedLogo, setFailedLogo] = useState('')
  const [failedImage, setFailedImage] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const source = offer.layout === 'artwork' ? image : image || illustration
  const layout = resolveOfferLayout(offer.layout, Boolean(source && source !== failedImage))
  const brand = brandName || name.replace(/^.*«(.+)»$/, '$1')
  const { benefit, title } = offerCreativeCopy(offer)
  const logoMark = logo && logo !== failedLogo && <img className="campaign-creative__logo" src={logo} alt={brandName?'':brand} onError={() => setFailedLogo(logo)} />
  const brandMark = brandName ? <span className="campaign-creative__identity">{logoMark}<span className="campaign-creative__brand">{brandName}</span></span>
    : logoMark || (legalNameBelow ? null : <span className="campaign-creative__brand">{brand}</span>)
  return <><article className={'campaign-creative cr--' + offer.tone} style={offer.background ? { '--cr-bg': offer.background, '--cr-fg': offerTextColor(offer.background) } as CSSProperties : undefined} aria-label="Креатив оффера" data-editable={Boolean(onEdit)}>
    <div className="campaign-creative__layout" data-layout={layout} data-zoom={offer.zoom}>
      {layout !== 'artwork' && <div className="campaign-creative__copy">
        {onEdit ? <button type="button" className="campaign-creative__edit-brand" aria-label="Изменить логотип" disabled={disabled} onClick={() => onEdit('media')}>{brandMark}</button> : brandMark}
        <div className="campaign-creative__message">
          {benefit && (onEdit ? <button type="button" className="campaign-creative__benefit campaign-creative__edit-benefit" data-wide={benefit.length > 6} aria-label="Изменить выгоду и условия" disabled={disabled} onClick={() => onEdit('terms')}>{benefit}</button> : <strong className="campaign-creative__benefit" data-wide={benefit.length > 6}>{benefit}</strong>)}
          {onTitleChange ? <textarea className="campaign-creative__title campaign-creative__edit-title" aria-label="Текст прямо в оффере" data-benefit={Boolean(benefit)} value={offer.title} rows={2} minLength={5} maxLength={90} required disabled={disabled} onChange={event => onTitleChange(event.target.value)}/>
            : title && <span className="campaign-creative__title" data-benefit={Boolean(benefit)}>{title}</span>}
        </div>
      </div>}
      {layout !== 'text' && <div className="campaign-creative__media">
        <img src={source} alt={layout === 'artwork' ? offer.title : ''} onError={() => setFailedImage(source)} />
        {onEdit && layout !== 'artwork' && <button type="button" className="campaign-creative__edit-media" disabled={disabled} onClick={() => onEdit('media')}>Заменить фото</button>}
      </div>}
      <div className="campaign-creative__terms">
        {offer.promo && <button type="button" className="campaign-creative__open" disabled={disabled}
          aria-haspopup="dialog" onClick={onTerms ?? (() => dialog.current?.showModal())}>Условия акции</button>}
        {offer.until && <time dateTime={offer.until}>до {offer.until.split('-').reverse().join('.')}</time>}
        <span className="campaign-creative__ad">{erid ? 'Реклама · erid ' + erid : 'реклама'}</span>
      </div>
    </div>
  </article>
    {legalNameBelow && name && <p className="campaign-creative__advertiser">{name}</p>}
    {offer.promo && !onTerms && <OfferTermsDialog dialog={dialog} brand={brand} offer={offer}/>}
  </>
}
