import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ArrowUpRight, CalendarDays, ChevronDown, FileText, Globe, MapPin } from 'lucide-react'
import type { MarketOffer } from '../../shared/market'
import { analytics } from '../analytics'
import { SubscriberBadge } from '../ui'
import { priceText, summaryFor } from './BenefitCard'
import { marketRequest } from './market-request'

const dateLabel = (iso:string) => new Date(iso.slice(0,10)+'T12:00:00Z').toLocaleDateString('ru-RU', {
  day:'numeric', month:'long', year:'numeric', timeZone:'UTC',
})
const capitalize = (value:string) => value.charAt(0).toUpperCase() + value.slice(1)
type Source = NonNullable<MarketOffer['source']>
type Term = Source['sections'][number]

function TermText({section}:{section:Term}) {
  return <div className="market-terms__text">
    {section.text && <p>{section.text.replace(/\n(?:[ \t]*\n)+(?=•)/g,'\n')}</p>}
    {section.links.map((link,i)=><a key={i} href={link.url} target="_blank" rel="noopener noreferrer">
      <FileText size={16} aria-hidden="true"/>{capitalize(link.name)}
    </a>)}
  </div>
}

function SourceTerms({sections}:{sections:Term[]}) {
  const order = (title:string) => /^как/i.test(title) ? 0 : /^условия/i.test(title) ? 1 : 2
  return <div className="market-terms">{sections.sort((a,b)=>order(a.title)-order(b.title)).map((s,i)=>
    <details key={s.title+i}>
      <summary>{capitalize(s.title.replace(/\?$/,''))}<ChevronDown size={18} aria-hidden="true"/></summary>
      <TermText section={s}/>
    </details>)}</div>
}

function OfferContent({offer}:{offer:MarketOffer}) {
  const [revealed,setRevealed] = useState(false)
  const [copied,setCopied] = useState('')
  const recorded = useRef('')
  const {brand,benefit,condition} = summaryFor(offer)
  useEffect(()=>{
    document.title = brand+' — '+benefit+' · Лучшее рядом'
    if (recorded.current !== offer.id) {
      analytics.event('market_offer_open')
      recorded.current = offer.id
    }
  },[offer.id,brand,benefit])
  const {source,website,online,addresses} = offer
  const intro = offer.description ?? source?.description
  const description = source?.sections.find(s=>/^описание/i.test(s.title))
  const {until,promo} = offer.offer
  const validity = until ? 'До '+dateLabel(until) : capitalize(source?.validity ?? '')
  const summaryCondition = !source && (condition==='Онлайн' || addresses.includes(condition)) ? '' : condition
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(promo)
      setCopied('Промокод скопирован')
      analytics.event('market_code_copy')
    } catch { setCopied('Выделите промокод и скопируйте вручную') }
  }
  return <article className="market-page__content">
    <header className="market-page__hero">
      <div className="market-page__intro">
        <div className="catalog-offer__brand">
          {offer.logo && <img src={offer.logo} width="32" height="32" alt=""/>}{brand}
        </div>
        <h1 className={benefit.length>15 ? 'is-long' : undefined}>{priceText(benefit)}</h1>
        {summaryCondition && <p className="market-page__condition">{priceText(summaryCondition)}</p>}
        {(validity || (!source && online)) && <div className="market-page__meta">
          {validity && <span><CalendarDays size={16} aria-hidden="true"/>{validity}</span>}
          {!source && online && <span><Globe size={16} aria-hidden="true"/>Онлайн</span>}
        </div>}
      </div>
      {offer.image && <img className="market-page__art" src={offer.image} alt=""/>}
    </header>
    <div className="market-page__body">
      {(intro || (offer.description===undefined && description) || !!description?.links.length) && <section className="market-page__description">
        <h2>Описание</h2>
        {intro && (offer.description!==undefined || !description?.text.includes(intro)) && <p>{capitalize(intro)}</p>}
        {description && <TermText section={offer.description===undefined ? description : {...description,text:''}}/>}
      </section>}
        {!source && !online && addresses.length>0 && <section className="market-page__addresses">
          <h2>Где воспользоваться</h2>
          <ul>{addresses.map(address=><li key={address}><MapPin size={16} aria-hidden="true"/>{address}</li>)}</ul>
        </section>}
      {(source || website || promo) && <div className="market-page__actions">
        {source && <SubscriberBadge id="market-subscriber-badge"/>}
        {promo && revealed && <div className="market-page__code" aria-live="polite">{promo}</div>}
        {promo && <button className="bl-btn bl-btn--primary" onClick={revealed ? copyCode : ()=>{
          setRevealed(true); analytics.event('market_code_reveal')
        }}>{revealed ? 'Скопировать промокод' : 'Показать промокод'}</button>}
        {source && <a className="bl-btn bl-btn--primary" href={source.url} target="_blank" rel="noopener noreferrer sponsored" aria-describedby="market-subscriber-badge market-login-hint"
          onClick={()=>analytics.event('market_partner_visit')}>Получить на сайте билайна<ArrowUpRight size={18} aria-hidden="true"/></a>}
        {website && <a className={'bl-btn '+(promo ? '' : 'bl-btn--primary')} href={website} target="_blank" rel="noopener noreferrer sponsored"
          onClick={()=>analytics.event('market_partner_visit')}>На сайт партнёра<ArrowUpRight size={18} aria-hidden="true"/></a>}
        {source && <p className="bl-caption" id="market-login-hint">Для получения понадобится вход на сайте билайна.</p>}
        {copied && <span className="bl-caption" role="status">{copied}</span>}
      </div>}
      {source && <SourceTerms sections={source.sections.filter(section=>section!==description)}/>}
      <div className="market-page__legal">
        <p>Реклама · {offer.name || brand}{offer.erid && ' · erid '+offer.erid}</p>
        {source && <p>{source.name} · Данные от {dateLabel(source.fetchedAt)}</p>}
      </div>
    </div>
  </article>
}

export default function MarketOfferPage() {
  const {id=''} = useParams()
  const {state} = useLocation()
  const navigate = useNavigate()
  const main = useRef<HTMLElement>(null)
  useEffect(()=>{main.current?.focus({preventScroll:true})},[id])
  const detail = useQuery({queryKey:['market-detail',id],
    queryFn:({signal})=>marketRequest<MarketOffer>('/offers/'+encodeURIComponent(id),signal),refetchInterval:15_000,staleTime:0,retry:false,gcTime:0})
  return <main className="market-page" ref={main} tabIndex={-1}>
    <Link className="market-page__back" to="/market/" onClick={event=>{
      if (state?.fromCatalog && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault(); void navigate(-1)
      }
    }}><ArrowLeft size={18} aria-hidden="true"/>В каталог</Link>
    {detail.error ? <h1 className="bl-h3" role="alert">{detail.error.message}</h1> : detail.data
      ? <OfferContent key={id} offer={detail.data}/>
      : <p role="status">Загружаем предложение…</p>}
  </main>
}
