import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { Link, Navigate, useLocation, useOutlet, useSearchParams } from 'react-router'
import { ArrowUp, CreditCard, LayoutGrid, MonitorSmartphone, Shapes, ShoppingBag, Map as MapIcon, Sparkles, X, type LucideIcon } from 'lucide-react'
import { Brand, Chip, Segmented } from '../ui'
import { CATS } from '../creative'
import { analytics } from '../analytics'
import { useReducedMotion } from 'motion/react'
import { AnimatedReply, DistrictMap, Thinking, useQuestionHint } from './MarketDiscovery'
import { distanceText, districtPoint, refineQuestion } from './market-nearby'
import { partnerDemo } from './mvp-demo'
import { marketRequest } from './market-request'
import { OfferExposureScope } from './OfferExposure'
import { BenefitCard } from './BenefitCard'
import { PartnerCall } from './partner-call/PartnerCall'
import { marketOfferPath } from '../../shared/market'
import type { operations } from '../api.gen'

type Page = operations['listMarketOffers']['responses'][200]['content']['application/json']
const catalogCategories: Record<string,[string,LucideIcon]> = {
  shopping:['Покупки и подарки',ShoppingBag], ...CATS, finance:['Финансы и страхование',CreditCard],
  digital:['Цифровые сервисы',MonitorSmartphone], other:['Другие',Shapes],
}
const countFormat = new Intl.PluralRules('ru-RU')
function offerCount(total:number) {
  const form = countFormat.select(total)
  return total+' '+(form==='one' ? 'предложение' : form==='few' ? 'предложения' : 'предложений')
}
export default function Market() {
  const [category,setCategory] = useState(''), [input,setInput] = useState(''), [search,setSearch] = useState('')
  const [params,setParams] = useSearchParams()
  const [turn,setTurn] = useState<{text:string; key:number} | null>(null)
  const [animating,setAnimating] = useState(false)
  const reduced = useReducedMotion()
  const hint = useQuestionHint(partnerDemo && !turn && !input)
  const mapOpen = partnerDemo && params.get('view') === 'map'
  const radiusParam=Number(params.get('radius'))
  const radius=partnerDemo && [500,1000,3000].includes(radiusParam) ? radiusParam : mapOpen ? 1000 : 0
  function changeArea(value:number, map:boolean) {
    const next=new URLSearchParams(params)
    if (value) next.set('radius',String(value))
    else next.delete('radius')
    if (map && value) next.set('view','map')
    else next.delete('view')
    setParams(next,{replace:true,preventScrollReset:true})
  }
  function resetSearch() {
    setTurn(null); setAnimating(false); setInput(''); setSearch('')
  }
  useEffect(()=>{
    if (!turn || reduced) { setAnimating(false); return }
    const timer=setTimeout(()=>setAnimating(false),1750)
    return ()=>clearTimeout(timer)
  },[turn,reduced])
  const legacyId = params.get('offer')
  const detail = useOutlet()
  const isOfferPage = !!detail
  const {pathname} = useLocation()
  const position = useRef<{id:string;top:number} | null>(null)
  useLayoutEffect(()=>{
    const last = position.current
    if (!isOfferPage && last) {
      document.getElementById('market-card-'+last.id)?.focus({preventScroll:true})
      window.scrollTo(0,last.top)
      position.current = null
    } else window.scrollTo(0,0)
  },[pathname,isOfferPage])
  const feed = useInfiniteQuery({queryKey:['market',category,radius],initialPageParam:0,placeholderData:keepPreviousData,enabled:!detail && !legacyId,
    queryFn:({pageParam,signal})=>marketRequest<Page>('/offers?category='+encodeURIComponent(category)+'&radius='+radius+'&offset='+pageParam,signal),
    getNextPageParam:(last,_all,offset)=>last.more ? offset+last.items.length : undefined,refetchInterval:15_000,staleTime:0})
  const results = useInfiniteQuery({queryKey:['market-search',search,radius],initialPageParam:0,enabled:!!search && !detail && !legacyId,
    queryFn:({pageParam,signal})=>marketRequest<operations['searchMarketOffers']['responses'][200]['content']['application/json']>('/search',signal,{query:search,offset:pageParam,...(radius ? {radius} : {})}),
    getNextPageParam:(last,_all,offset)=>last.more ? offset+last.items.length : undefined, refetchInterval:15_000,gcTime:0,retry:false,refetchOnWindowFocus:false})
  useEffect(()=>{
    const q=input.trim()
    if (turn || q===search || detail) return
    const timer=setTimeout(()=>{setSearch(q);if(q) {setCategory('');analytics.event('market_search')}},280)
    return ()=>clearTimeout(timer)
  },[input,search,isOfferPage,turn])
  function ask(value:string) {
    const text=value.trim()
    if (!text) return
    if (partnerDemo) {
      const nearest=/^(?:поближе|ближе|сначала ближайшие|рядом)$/i.test(text)
      if (nearest) changeArea(radius || 1000,true)
      setSearch(nearest ? (turn ? search : '') : refineQuestion(turn ? search : '',text))
      setInput('')
    } else setSearch(text)
    setAnimating(!reduced)
    setTurn(last=>({text,key:(last?.key ?? 0)+1}))
    setCategory(''); analytics.event('market_search')
  }
  const items = (search ? results.data?.pages : feed.data?.pages)?.flatMap(p=>p.items)
  const current = search ? results : feed
  const pages = feed.data?.pages
  const counts: Record<string,number> = pages?.[0].categories ?? {}
  // A previously deployed feed may not include category totals yet.
  if (pages && !pages[0].categories) {
    for (const page of pages) for (const offer of page.items) counts[offer.group] = (counts[offer.group] ?? 0)+1
  }
  const sections = Object.entries(catalogCategories).filter(([key])=>counts[key] || category===key)
    .map(([key,[name,Icon]])=>({key,label:name.charAt(0).toUpperCase()+name.slice(1),Icon}))
  const rememberCard = (id:string)=>{position.current={id,top:window.scrollY}}
  if (!detail && legacyId) {
    const rest = new URLSearchParams(params)
    rest.delete('offer')
    return <Navigate replace to={{pathname:marketOfferPath(legacyId),search:rest.toString()}}/>
  }
  return <div className="bl-page near">
    <header className="bl-header market-header">
      <Brand to="/market/" onClick={event=>{
        if (event.button!==0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
        position.current=null
        setCategory(''); resetSearch()
        window.scrollTo(0,0)
      }}/>
      <nav className="market-header__nav" aria-label="Меню маркета">
        <Link className="bl-btn bl-btn--ghost" to="/" onClick={()=>analytics.event('market_signup_click')}>Стать партнёром</Link>
        <Link className="bl-btn bl-btn--s" to="/app/" onClick={()=>analytics.event('market_signup_click')}>Личный кабинет</Link>
      </nav>
    </header>
    <OfferExposureScope>{detail ?? <>
      <main className="near-main">
        <section className="near-hero"><div className="bl-stack"><h1 className="bl-h1">Лучшее рядом</h1><p className="bl-h4">Скидки, кешбэк и подарки от партнёров</p></div>
          <section className="near-ask" aria-label="Поиск по предложениям">
            <span className="near-ai__label"><Sparkles size={14} aria-hidden="true"/>Умный поиск</span>
            <form className={'near-ask__bar near-ai ym-disable-keys'+(animating ? ' is-busy' : '')} onSubmit={e=>{e.preventDefault();ask(input)}}>
              <Sparkles size={20} aria-hidden="true" className="near-ai__icon"/>
              <input type="search" aria-label="Поиск предложений" maxLength={500} value={input}
                placeholder={turn ? 'Задайте новый вопрос' : partnerDemo ? hint : 'Бренд, товар или услуга'} onChange={e=>{
                  setInput(e.target.value)
                  if (!partnerDemo && turn) { setTurn(null); setAnimating(false) }
                }}/>
              {(search || turn) && <button type="button" className="bl-icon-btn" aria-label="Сбросить поиск" onClick={resetSearch}><X size={16}/></button>}
              <button className="bl-btn bl-btn--primary near-ask__send" disabled={!input.trim()} aria-label={partnerDemo ? 'Спросить' : 'Найти'}><ArrowUp size={18}/></button>
            </form>
            {turn && <div className={'bl-section near-ask__panel'+(animating ? ' is-busy' : '')}>
              {partnerDemo && <div className="near-ask__head"><p className="near-ask__me">{turn.text}</p>
                <button className="bl-btn bl-btn--s bl-btn--ghost" onClick={resetSearch}>Новый вопрос</button></div>}
              {animating || current.isPending ? <Thinking key={turn.key} offers={items ?? []}/> : items && !current.error && <>
                <AnimatedReply key={turn.key} text={items.length ? 'В подборке '+offerCount(results.data?.pages[0].total ?? items.length)+'. '+(items[0].catalog?.brand ?? items[0].name)+' — '+(items[0].catalog?.condition || items[0].offer.title)+'.' : 'По этим условиям предложений нет. Попробуйте другой запрос.'}/>
                {partnerDemo && <div className="near-ask__foot">{['До 300 ₽','Поближе'].map(q=><button className="bl-btn bl-btn--s" key={q} onClick={()=>ask(q)}>{q}</button>)}</div>}
              </>}
            </div>}
          </section>
        </section>
        {partnerDemo && !input.trim() && !turn && !category && <PartnerCall />}
        <div className="near-scroller market-filters" role="group" aria-label="Категории">
          {[{key:'',label:'Всё',Icon:LayoutGrid},...sections].map(({key,label,Icon})=>
            <Chip key={key} on={!search && category===key} onClick={()=>{resetSearch();setCategory(key);analytics.event('market_filter')}}>
              <Icon size={18} aria-hidden="true"/>{label}
            </Chip>)}
        </div>
        {partnerDemo && <div className="market-map-tools" aria-label="Предложения рядом">
          <button className="bl-btn near-mapbtn" aria-pressed={mapOpen} onClick={()=>changeArea(radius || 1000,!mapOpen)}><MapIcon size={18}/>{mapOpen ? 'Скрыть карту' : 'На карте'}</button>
          <Segmented label="Радиус" value={radius} options={[[0,'Везде'],[500,'500 м'],[1000,'1 км'],[3000,'3 км']]} onChange={v=>changeArea(v,mapOpen)}/>
          {radius>0 && <span className="bl-caption">Хамовники · сначала ближайшие</span>}
        </div>}
        {(current.isPending || current.isPlaceholderData) && <p role="status">Загружаем предложения…</p>}
        {current.error ? <p role="alert">{current.error.message} <button className="bl-btn" onClick={()=>void current.refetch()}>Повторить</button></p> :
          items && !animating && !current.isPlaceholderData && <>
            {mapOpen && <DistrictMap items={items} radius={radius} onNavigate={rememberCard}/>}
            {search && !turn && results.data && <p aria-live="polite">{results.data.pages[0].reply}</p>}
            {!items.length && !search && <p className="near-empty" role="status">{radius ? 'В этом радиусе мест нет. Увеличьте радиус или выберите «Везде».' : category ? 'В этой категории пока нет предложений.' : 'Пока нет действующих предложений.'}</p>}
            {search || radius ? <div key={turn?.key} className="market-catalog">{items.map((o,i)=>
              <div key={o.id} className={turn ? 'market-result' : undefined} style={turn ? {animationDelay:Math.min(i,6)*70+'ms'} : undefined}>
                {radius>0 && districtPoint(o.id) && <span className="bl-caption">{distanceText(districtPoint(o.id)!.distance)}</span>}
                <BenefitCard offer={o} onNavigate={rememberCard}/>
              </div>)}</div> :
              <div className="market-sections">{sections.map(({key,label})=>{
                const offers = items.filter(o=>o.group===key)
                if (!offers.length) return null
                return <section className="market-section" data-single={counts[key]===1} key={key} aria-labelledby={'market-section-'+key}>
                  <header className="market-section__heading"><h2 id={'market-section-'+key}>{label}</h2><span>{offerCount(counts[key])}</span></header>
                  <div className="market-catalog">{offers.map(o=><BenefitCard grouped key={o.id} offer={o} onNavigate={rememberCard}/>)}</div>
                </section>
              })}</div>}
            {current.hasNextPage && <button className="bl-btn" disabled={current.isFetchingNextPage} onClick={()=>{analytics.event('market_more');void current.fetchNextPage()}}>Показать ещё</button>}
        </>}
    </main>
    <footer className="near-foot bl-caption"><span>Реклама. Условия предложений предоставляют партнёры.</span><Link to="/app/?start=campaign" onClick={()=>analytics.event('market_signup_click')}>Разместить предложение</Link></footer>
    </>}</OfferExposureScope>
  </div>
}
