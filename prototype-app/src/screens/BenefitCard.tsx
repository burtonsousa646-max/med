import { beelineCatalogSummary } from '../../shared/beeline-benefits'
import { ArrowUpRight } from 'lucide-react'
import { catalogFields } from '../../shared/market-catalog'
import { marketOfferPath, type MarketOffer } from '../../shared/market'
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

export function BenefitCard({offer,onNavigate,grouped=false}:{offer:MarketOffer; onNavigate:(id:string)=>void; grouped?:boolean}) {
  const {brand,benefit,condition} = summaryFor(offer)
  const Heading = grouped ? 'h3' : 'h2'
  const badgeId = offer.source ? 'market-subscribers-'+offer.id : undefined
  return <article className={'catalog-offer near-card' + (offer.source ? ' market-source' : '')}>
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
      {offer.image && <div className="catalog-offer__art"><img src={offer.image} alt="" loading="lazy"/></div>}
    </div>
    <div className="catalog-offer__foot">
      <span>Реклама{offer.erid && ' · erid ' + offer.erid}</span>
      <Link id={'market-card-'+offer.id} to={marketOfferPath(offer.id)} state={{fromCatalog:true}} onClick={()=>onNavigate(offer.id)} aria-label={'Подробнее: '+brand+' — '+benefit} aria-describedby={badgeId}>
        <ArrowUpRight size={18} aria-hidden="true"/>
      </Link>
    </div>
  </article>
}
