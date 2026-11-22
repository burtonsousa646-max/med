import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { Link, Navigate, useLocation, useOutlet, useSearchParams } from 'react-router'
import { ArrowUp, CreditCard, LayoutGrid, MonitorSmartphone, Shapes, ShoppingBag, Search, X, type LucideIcon } from 'lucide-react'
import { Brand, Chip } from '../ui'
import { CATS } from '../creative'
import { analytics } from '../analytics'
import { marketRequest } from './market-request'
import { BenefitCard } from './BenefitCard'
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
  const [params] = useSearchParams()
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
  const feed = useInfiniteQuery({queryKey:['market',category],initialPageParam:0,placeholderData:keepPreviousData,enabled:!detail && !legacyId,
    queryFn:({pageParam,signal})=>marketRequest<Page>('/offers?category='+encodeURIComponent(category)+'&offset='+pageParam,signal),
    getNextPageParam:(last,_all,offset)=>last.more ? offset+last.items.length : undefined,refetchInterval:15_000,staleTime:0})
  const results = useInfiniteQuery({queryKey:['market-search',search],initialPageParam:0,enabled:!!search && !detail && !legacyId,
    queryFn:({pageParam,signal})=>marketRequest<operations['searchMarketOffers']['responses'][200]['content']['application/json']>('/search',signal,{query:search,offset:pageParam}),
    getNextPageParam:(last,_all,offset)=>last.more ? offset+last.items.length : undefined, refetchInterval:15_000,gcTime:0,retry:false,refetchOnWindowFocus:false})
  useEffect(()=>{
    const q=input.trim()
    if (q===search || detail) return
    const timer=setTimeout(()=>{setSearch(q);if(q) {setCategory('');analytics.event('market_search')}},280)
    return ()=>clearTimeout(timer)
  },[input,search,isOfferPage])
  function ask(e:FormEvent) {
    e.preventDefault()
    if (input.trim()!==search) { setCategory('');setSearch(input.trim());analytics.event('market_search') }
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
        setCategory(''); setInput(''); setSearch('')
        window.scrollTo(0,0)
      }}/>
      <nav className="market-header__nav" aria-label="Меню маркета">
        <Link className="bl-btn bl-btn--ghost" to="/" onClick={()=>analytics.event('market_signup_click')}>Стать партнёром</Link>
        <Link className="bl-btn bl-btn--s" to="/app/" onClick={()=>analytics.event('market_signup_click')}>Личный кабинет</Link>
      </nav>
    </header>
    {detail ?? <>
      <main className="near-main">
        <section className="near-hero"><div className="bl-stack"><h1 className="bl-h1">Лучшее рядом</h1><p className="bl-h4">Скидки, кешбэк и подарки от партнёров</p></div>
          <section className="near-ask" aria-label="Поиск по предложениям"><form className="near-ask__bar near-ai ym-disable-keys" onSubmit={ask}>
            <Search size={20} aria-hidden="true" className="near-ai__icon"/><input type="search" aria-label="Поиск предложений" maxLength={500} value={input} placeholder="Бренд, товар или услуга" onChange={e=>setInput(e.target.value)}/>
            {search && <button type="button" className="bl-icon-btn" aria-label="Сбросить поиск" onClick={()=>{setInput('');setSearch('')}}><X size={16}/></button>}
            <button className="bl-btn bl-btn--primary near-ask__send" disabled={!input.trim()} aria-label="Найти"><ArrowUp size={18}/></button>
          </form></section>
        </section>
        <div className="near-scroller market-filters" role="group" aria-label="Категории">
          {[{key:'',label:'Всё',Icon:LayoutGrid},...sections].map(({key,label,Icon})=>
            <Chip key={key} on={!search && category===key} onClick={()=>{setSearch('');setInput('');setCategory(key);analytics.event('market_filter')}}>
              <Icon size={18} aria-hidden="true"/>{label}
            </Chip>)}
        </div>
        {(current.isPending || current.isPlaceholderData) && <p role="status">Загружаем предложения…</p>}
        {current.error ? <p role="alert">{current.error.message} <button className="bl-btn" onClick={()=>void current.refetch()}>Повторить</button></p> :
          items && !current.isPlaceholderData && <>
            {search && results.data && <p aria-live="polite">{results.data.pages[0].reply}</p>}
            {!items.length && !search && <p className="near-empty" role="status">{category ? 'В этой категории пока нет предложений.' : 'Пока нет действующих предложений.'}</p>}
            {search ? <div className="market-catalog">{items.map(o=><BenefitCard key={o.id} offer={o} onNavigate={rememberCard}/>)}</div> :
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
    </>}
  </div>
}
