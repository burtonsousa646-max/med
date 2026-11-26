import { beelineCatalogSummary } from '../../shared/beeline-benefits'
import { ArrowUpRight } from 'lucide-react'
import { catalogFields } from '../../shared/market-catalog'
import { marketOfferPath, type MarketOffer } from '../../shared/market'
import { useOfferExposure } from './OfferExposure'
import { Link } from 'react-router'
import { SubscriberBadge } from '../ui'
import './benefit-card.css'

type Summary = {brand:string; benefit:string; condition:string}
// Keep grouped digits and currency together on narrow cards.
export const priceText = (text:string) => text.replace(/(\d) (?=\d{3}(?:\D|$)|₽)/g,'$1\u00a0')
export function summaryFor(card: MarketOffer): Summary {
  if (!card.catalog && card.source) {
    const snapshot = beelineCatalogSummary(card)
    if (snapshot) return snapshot
  }
  return catalogFields(card)
}

export function BenefitCard({offer,onNavigate,onPreview,grouped=false}:{
  offer:MarketOffer; onNavigate?:(id:string)=>void; onPreview?:()=>void; grouped?:boolean
}) {
  const {brand,benefit,condition} = summaryFor(offer)
  const exposure=useOfferExposure(offer.id,!!onNavigate && !offer.source && !offer.id.startsWith('near-'))
  const Heading = grouped ? 'h3' : 'h2'
  const badgeId = offer.source ? 'market-subscribers-'+offer.id : undefined
  return <article ref={exposure.ref} className={'catalog-offer near-card' + (offer.source ? ' market-source' : '')}>
    <div className="catalog-offer__identity">
      <div className="catalog-offer__brand">
        {offer.logo && <img src={offer.logo} alt="" width="28" height="28"/>}
        <span>{brand}</span>
      </div>
      {badgeId && <SubscriberBadge id={badgeId}/>}
    </div>
    <div className="catalog-offer__main">
      <div>
        <Heading className={'catalog-offer__benefit' + (benefit.length > 15 ? ' catalog-offer__benefit--text' : '')}>{priceText(benefit)}</Heading>
        {condition && <p>{priceText(condition)}</p>}
      </div>
      {offer.image && <div className="catalog-offer__art" data-layout={offer.offer.layout}><img src={offer.image} alt="" loading="lazy"/></div>}
    </div>
    <div className="catalog-offer__foot">
      <span>{offer.id.startsWith('near-') ? 'Демо · Хамовники' : 'Реклама'}{offer.erid && ' · erid ' + offer.erid}</span>
      {onNavigate ? <Link id={'market-card-'+offer.id} to={marketOfferPath(offer.id)+exposure.fragment} state={{fromCatalog:true}} onClick={()=>{exposure.click();onNavigate(offer.id)}} onAuxClick={event=>{if(event.button===1)exposure.click()}} aria-label={'Подробнее: '+brand+' — '+benefit} aria-describedby={badgeId}>
        <ArrowUpRight size={18} aria-hidden="true"/>
      </Link> : onPreview ? <button type="button" className="catalog-offer__preview-arrow" aria-label={'Условия акции · '+brand} aria-haspopup="dialog" onClick={onPreview}>
        <ArrowUpRight size={18} aria-hidden="true"/>
      </button> : <span className="catalog-offer__preview-arrow" aria-hidden="true"><ArrowUpRight size={18}/></span>}
    </div>
  </article>
}

export function MarketCardPreview({offer,advertiser,onPreview}:{offer:MarketOffer;advertiser?:string;onPreview?:()=>void}) {
  return <figure className="market-card-preview">
    <BenefitCard offer={offer} onPreview={onPreview}/>
    {advertiser && <figcaption>Рекламодатель · {advertiser}</figcaption>}
  </figure>
}
