import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { ArrowUp, LayoutGrid, Shapes, Sparkles, X } from 'lucide-react'
import { Brand, Chip, Modal } from '../ui'
import { CATS } from '../creative'
import { analytics } from '../analytics'
import type { MarketOffer } from '../../shared/market'
import { CampaignCreative } from './CampaignCreative'
import { mockMarketRequest, partnerDemo } from './mvp-demo'

const base = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/,'') + '/market'
type Page = {items:MarketOffer[];more:boolean}
async function request<T>(path:string,signal:AbortSignal,body?:object):Promise<T> {
  if (partnerDemo) return mockMarketRequest(path,body) as T
  const res = await fetch(base+path,{credentials:'omit',cache:'no-store',signal,...(body && {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})})
  if (!res.ok) throw new Error(res.status===404 ? 'Предложение больше недоступно' : 'Не удалось загрузить предложения. Попробуйте ещё раз.')
  return res.json()
}
function OfferDetails({offer:o}:{offer:MarketOffer}) {
  const [revealed,setRevealed] = useState(false), [copied,setCopied] = useState('')
  const openId = useRef('')
  useEffect(()=>{
    if (openId.current !== o.id) { openId.current=o.id; analytics.event('market_offer_open') }
  },[o.id])
  return <div className="bl-stack">
    <p className="bl-caption">{o.name} · Реклама · erid {o.erid}</p>
    <h2 className="bl-h2">{o.offer.title}</h2>
    {o.offer.discount && <p className="bl-lead">Скидка {o.offer.discount}%</p>}
    {o.offer.until && <p>Действует до {o.offer.until.split('-').reverse().join('.')}</p>}
    {o.online ? <p>Предложение действует онлайн</p> : <ul>{o.addresses.map(a=><li key={a}>{a}</li>)}</ul>}
    {o.offer.promo && (revealed ? <>
      <div className="near-code">{o.offer.promo}</div>
      <button className="bl-btn" onClick={async()=>{
        try { await navigator.clipboard.writeText(o.offer.promo); setCopied('Промокод скопирован'); analytics.event('market_code_copy') }
        catch { setCopied('Выделите промокод и скопируйте вручную') }
      }}>Скопировать</button>{copied && <span role="status">{copied}</span>}
    </> : <button className="bl-btn bl-btn--primary" onClick={()=>{setRevealed(true);analytics.event('market_code_reveal')}}>Показать промокод</button>)}
    {o.website && <a className="bl-btn bl-btn--dark" href={o.website} target="_blank" rel="noopener noreferrer sponsored" onClick={()=>analytics.event('market_partner_visit')}>На сайт партнёра</a>}
  </div>
}
export default function Market() {
  const [category,setCategory] = useState(''), [input,setInput] = useState(''), [search,setSearch] = useState('')
  const [params,setParams] = useSearchParams(), id = params.get('offer')
  const feed = useInfiniteQuery({queryKey:['market',category],initialPageParam:0,
    queryFn:({pageParam,signal})=>request<Page>('/offers?category='+encodeURIComponent(category)+'&offset='+pageParam,signal),
    getNextPageParam:(last,_all,offset)=>last.more ? offset+last.items.length : undefined,refetchInterval:15_000,staleTime:0})
  const results = useQuery({queryKey:['market-search',search],enabled:!!search,
    queryFn:({signal})=>request<{reply:string;items:MarketOffer[]}>('/search',signal,{query:search}),gcTime:0,retry:false,refetchOnWindowFocus:false})
  const detail = useQuery({queryKey:['market-detail',id],enabled:!!id,
    queryFn:({signal})=>request<MarketOffer>('/offers/'+encodeURIComponent(id!),signal),refetchInterval:15_000,staleTime:0,retry:false,gcTime:0})
  function ask(e:FormEvent) { e.preventDefault(); const q=input.trim(); if (!q) return; setCategory('');setSearch(q);analytics.event('market_search') }
  const items = search ? results.data?.items : feed.data?.pages.flatMap(p=>p.items)
  const current = search ? results : feed
  const show = (o:MarketOffer)=>setParams({offer:o.id})
  return <div className="bl-page near">
    <header className="bl-header"><Brand to="/"/><Link className="bl-btn bl-btn--s" to="/app/" onClick={()=>analytics.event('market_signup_click')}>Личный кабинет</Link></header>
    <main className="near-main">
      <section className="near-hero"><div className="bl-stack"><h1 className="bl-h1">Лучшее рядом</h1><p className="bl-h4">Скидки и промокоды партнёров</p></div>
        <section className="near-ask" aria-label="Поиск по предложениям"><form className="near-ask__bar near-ai ym-disable-keys" onSubmit={ask}>
          <Sparkles size={20} aria-hidden="true" className="near-ai__icon"/><input aria-label="Спроси, что ищешь" maxLength={500} value={input} placeholder="Найти предложение" onChange={e=>setInput(e.target.value)}/>
          {search && <button type="button" className="bl-icon-btn" aria-label="Сбросить поиск" onClick={()=>{setInput('');setSearch('')}}><X size={16}/></button>}
          <button className="bl-btn bl-btn--primary near-ask__send" disabled={!input.trim()} aria-label="Спросить"><ArrowUp size={18}/></button>
        </form></section>
      </section>
      <div className="near-scroller" role="group" aria-label="Категории">{Object.entries({ '':['Всё',LayoutGrid] as const, ...CATS, other:['Другие',Shapes] as const }).map(([key,[label,Icon]])=>
        <Chip key={key} on={category===key} onClick={()=>{setSearch('');setInput('');setCategory(key);analytics.event('market_filter')}}><Icon size={18} aria-hidden="true"/>{label}</Chip>)}</div>
      {current.isPending && <p role="status">Загружаем предложения…</p>}
      {current.error ? <p role="alert">{current.error.message} <button className="bl-btn" onClick={()=>void current.refetch()}>Повторить</button></p> :
        items && <>
          {search && results.data && <p aria-live="polite">{results.data.reply}</p>}
          {!items.length && !search && <p className="near-empty" role="status">{category ? 'В этой категории пока нет предложений.' : 'Пока нет действующих предложений.'}</p>}
          <div className="bl-grid near-found" style={{'--bl-cols':3} as React.CSSProperties}>{items.map(o=><article className="bl-card bl-card--white near-card" key={o.id}>
            <CampaignCreative legalNameBelow name={o.name} offer={o.offer} image={o.image} logo={o.logo} illustration="" disabled={false} erid={o.erid} onTerms={()=>show(o)}/>
            <div className="near-card__body"><span className="bl-caption">{o.online ? 'Онлайн' : o.addresses[0]}</span>
              <button className="bl-btn bl-btn--s" onClick={()=>show(o)}>Подробнее</button></div></article>)}</div>
          {!search && feed.hasNextPage && <button className="bl-btn" disabled={feed.isFetchingNextPage} onClick={()=>{analytics.event('market_more');void feed.fetchNextPage()}}>Показать ещё</button>}
        </>}
    </main>
    <footer className="near-foot bl-caption"><span>Реклама. Условия предложений предоставляют партнёры.</span><Link to="/app/?start=campaign" onClick={()=>analytics.event('market_signup_click')}>Разместить предложение</Link></footer>
    <Modal open={!!id} onClose={()=>setParams({},{replace:true})} label="Условия предложения">
      {detail.error ? <p role="alert">{detail.error.message}</p> : detail.data ? <OfferDetails key={detail.data.id} offer={detail.data}/> : <p>Загружаем предложение…</p>}
    </Modal>
  </div>
}
