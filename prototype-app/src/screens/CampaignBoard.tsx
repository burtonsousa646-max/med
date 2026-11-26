import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useSearchParams } from 'react-router'
import { ArrowLeftRight, Check, Columns3, GripVertical, List, RefreshCw, Search } from 'lucide-react'
import { campaignLabels, campaignStages, type BoardCard } from '../../shared/cabinet-dashboard'
import { StaffError, staffRequest } from './staff-request'
import { CabinetDashboard } from './CabinetDashboard'
import { CabinetDialog } from './AccountCabinet'
import type { PartnerCampaignStatus } from '../../shared/mvp-promo'
import './campaign-board.css'

const date = new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'Europe/Moscow'})
const detail = (id:string) => '/app/staff/'+encodeURIComponent(id)
export function CampaignBoard({email,onExpired}:{email:string;onExpired:()=>void}) {
  const client=useQueryClient()
  const refreshing=useIsFetching({queryKey:['v4-staff',email]})>0
  const storageKey='cabinet-ui/offer-view/'+email
  const [preferred,setPreferred]=useState<'board'|'list'>(()=>{try{return localStorage.getItem(storageKey)==='list'?'list':'board'}catch{return 'board'}})
  const location=useLocation(), [params,setParams]=useSearchParams()
  const search:string=location.state?.cabinetSearch??''
  const view=params.get('view')==='list' || (!params.has('view') && params.has('status')) ? 'list' : params.get('view')==='board' ? 'board' : preferred
  const [clientCard,setClientCard]=useState<BoardCard|null>(null)
  const [busy,setBusy]=useState(''), [drag,setDrag]=useState<BoardCard|null>(null), [over,setOver]=useState('')
  const [result,setResult]=useState<{text:string;error?:boolean;id?:string}|null>(null)
  const [choosing,setChoosing]=useState<BoardCard|null>(null)
  const touch=useRef<{card:BoardCard;x:number;y:number;moved:boolean}|null>(null)
  const lock=useRef(false), lanes=useRef<HTMLDivElement>(null)
  const board=useQuery({queryKey:['v4-staff',email,'board'],queryFn:({signal})=>staffRequest<BoardCard[]>('/board',{signal}),enabled:view==='board',retry:false,refetchInterval:15_000})
  const expired=board.error instanceof StaffError && board.error.status===401
  useEffect(()=>{if(expired)onExpired()},[expired,onExpired])
  const cards=(board.data??[]).filter(card=>[card.name,card.title,card.code,card.inn,card.email].join(' ').toLowerCase().includes(search.trim().toLowerCase()))
  function switchView(next:typeof view) {
    const updated=new URLSearchParams(params)
    updated.set('view',next)
    if (next==='board') {updated.delete('status');updated.delete('page')}
    setParams(updated,{replace:true,state:location.state})
    setPreferred(next)
    try {localStorage.setItem(storageKey,next)} catch { /* Retain the in-memory preference. */ }
  }
  function endDrag(){touch.current=null;setDrag(null);setOver('')}
  async function move(card:BoardCard,status:PartnerCampaignStatus) {
    endDrag()
    if (lock.current || card.status===status) return
    lock.current=true;setBusy(card.id);setResult(null)
    try {
      const saved=await staffRequest<{warning?:string}>('/submissions/'+card.id+'/stage',{body:{status,version:card.version}})
      setResult({text:card.title+' · '+campaignLabels[status]+(saved.warning?' · '+saved.warning:'')})
      for(const key of [['v4-staff',email],['mvp-campaigns'],['mvp-receipt'],['market'],['market-detail'],['market-search']]) {
        void client.invalidateQueries({queryKey:key})
      }
    } catch(error){
      if(error instanceof StaffError && error.status===401)onExpired()
      else setResult({text:error instanceof Error ? error.message : 'Не удалось изменить этап.',error:true,id:card.id})
    }
    finally{if(view==='board')await board.refetch();else await client.invalidateQueries({queryKey:['v4-staff',email,'dashboard']});lock.current=false;setBusy('')}
  }
  function laneAt(e:PointerEvent) {
    return document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-lane]')?.dataset.lane as PartnerCampaignStatus|undefined
  }
  function handleTouchMove(e:PointerEvent) {
    const current=touch.current, bounds=lanes.current?.getBoundingClientRect()
    if (!current || !bounds) return
    if (!current.moved && Math.hypot(e.clientX-current.x,e.clientY-current.y)<6) return
    current.moved=true;setDrag(current.card)
    if(e.clientX<bounds.left+50)lanes.current!.scrollLeft-=24
    else if(e.clientX>bounds.right-50)lanes.current!.scrollLeft+=24
    setOver(laneAt(e)??'')
  }
  function changeControl(card:BoardCard){
    return <button type="button" className="cb-move" title="Сменить этап" aria-haspopup="dialog"
      aria-label={'Сменить этап · '+card.title} aria-disabled={!!busy} onClick={()=>{if(!busy)setChoosing(card)}}><ArrowLeftRight size={16}/></button>
  }
  return <><section className="cb-page">
    <div className="crm-page-heading"><h1>кампании</h1><div className="crm-heading-actions">
      <button type="button" className="crm-icon" title="Обновить кампании" aria-label="Обновить кампании" disabled={refreshing}
        onClick={()=>void client.invalidateQueries({queryKey:['v4-staff',email]})}><RefreshCw size={17}/></button>
      <Link className="bl-btn" to="?catalog=1">реестр витрины</Link></div></div>
    <div className="cb-toolbar"><div className="cb-views" role="group" aria-label="Вид кампаний">
      <button aria-pressed={view==='board'} onClick={()=>switchView('board')}><Columns3 size={16}/>канбан</button>
      <button aria-pressed={view==='list'} onClick={()=>switchView('list')}><List size={17}/>список</button></div>
      {view==='board'&&<label className="crm-searchfield"><Search size={17}/><input type="search" aria-label="Поиск кампаний" placeholder="Компания, ИНН, почта или промокод" value={search} maxLength={120} onChange={e=>setParams(params,{replace:true,preventScrollReset:true,state:{cabinetSearch:e.target.value}})}/></label>}</div>
    {result && <p className={result.error?'bl-notice bl-notice--error staff-retry':'bl-notice bl-notice--success cb-feedback'} role={result.error?'alert':'status'}>{result.text} {result.id&&<Link to={detail(result.id)}>Открыть кампанию</Link>}</p>}
    {view==='board' && board.isError && !expired && <div className="bl-notice staff-retry" role="alert">Не удалось загрузить кампании. <button type="button" className="bl-btn bl-btn--s" disabled={board.isFetching} onClick={()=>void board.refetch()}>Повторить</button></div>}
    {view==='board' && board.isPending && <p role="status">Загружаем кампании…</p>}
    {view==='board' && board.data && <div className="cb-board-tools">
      <label className="cb-stage-jump">К этапу <select aria-label="Перейти к этапу" className="bl-select" value="" onChange={e=>{
        const container=lanes.current
        const column=container?.querySelector<HTMLElement>('[data-lane="'+e.target.value+'"]')
        if(column&&container)container.scrollLeft+=column.getBoundingClientRect().left-container.getBoundingClientRect().left
      }}><option value="" disabled>Выберите этап</option>{campaignStages.map(stage=><option key={stage} value={stage}>{campaignLabels[stage]} · {cards.filter(c=>c.status===stage).length}</option>)}</select></label>
      {search.trim() && <div className="cb-search-feedback"><span role="status">Найдено · {cards.length}</span>
        <button className="bl-btn bl-btn--s" type="button" onClick={()=>setParams(params,{replace:true,preventScrollReset:true,state:{...location.state,cabinetSearch:''}})}>Очистить поиск</button></div>}
    </div>}
    {view==='board' && board.data && <div ref={lanes} className="cb-lanes" data-dragging={!!drag} aria-label="Доска кампаний" tabIndex={0}>
      {campaignStages.map(stage=>{
        const group=cards.filter(c=>c.status===stage)
        return <section key={stage} data-lane={stage} aria-label={campaignLabels[stage]} className={'cb-lane'+(over===stage?' cb-over':'')}
          onDragOver={e=>{if(stage!=='authorization' && drag && !busy){e.preventDefault();e.dataTransfer.dropEffect='move';setOver(stage)}}}
          onDrop={e=>{e.preventDefault();if(drag && stage!=='authorization')void move(drag,stage)}}>
          <header><i/><h2>{campaignLabels[stage]}</h2><span>{group.length}</span></header>
          <div className="cb-stack">{group.map(card=><article key={card.id} className="cb-card" aria-label={card.kind==='client'?card.name:card.title} data-dragging={drag?.id===card.id} aria-busy={busy===card.id}
            draggable={card.kind==='campaign' && !busy} onDragStart={e=>{e.dataTransfer.setData('text/plain',card.id);e.dataTransfer.effectAllowed='move';setDrag(card)}} onDragEnd={endDrag}>
            <div className="cb-card-top"><span>{card.name}{card.kind==='campaign'&&card.inn&&<small className="cb-inn">ИНН {card.inn}</small>}</span>{card.kind==='campaign' && <span className="cb-grip" aria-hidden="true"
              onPointerDown={e=>{if(e.pointerType==='mouse'||busy)return;e.currentTarget.setPointerCapture(e.pointerId);touch.current={card,x:e.clientX,y:e.clientY,moved:false}}}
              onPointerMove={handleTouchMove} onPointerCancel={endDrag} onPointerUp={e=>{const target=laneAt(e);if(touch.current?.moved&&target&&target!=='authorization')void move(card,target);else endDrag()}}><GripVertical size={16}/></span>}</div>
            {card.kind==='client' ? <button className="cb-client" onClick={()=>setClientCard(card)}>{card.title}</button> : <Link draggable={false} to={card.kind==='contract'?'/app/staff/contract/'+card.id:detail(card.id)}>{card.title||card.name}</Link>}
            <footer><small>{card.kind==='client' ? (card.inn?'ИНН '+card.inn:card.email!==card.name?card.email:'') : card.code||date.format(card.submittedAt)}</small>{card.kind==='campaign' && changeControl(card)}</footer>
          </article>)}
          {!group.length && <p className="cb-empty">{search?'Нет совпадений':stage==='authorization'?'Нет клиентов':'Нет кампаний'}</p>}</div>
        </section>
      })}</div>}
    {clientCard && <CabinetDialog title={clientCard.name} close={()=>setClientCard(null)} variant="command">
      <p>Клиент вошёл в кабинет. Договор ещё не сформирован.</p>
      <dl className="staff-fields"><div><dt>Почта</dt><dd>{clientCard.email}</dd></div>
        {clientCard.inn&&<div><dt>ИНН</dt><dd>{clientCard.inn}</dd></div>}
        {clientCard.submittedAt>0&&<div><dt>Первый вход</dt><dd>{date.format(clientCard.submittedAt)}</dd></div>}</dl>
    </CabinetDialog>}
    {choosing && <CabinetDialog title="Сменить этап" variant="command" close={()=>setChoosing(null)}>
      <p className="cb-choice-title">{choosing.title}</p><p className="bl-caption">Текущий этап · {campaignLabels[choosing.status]}</p><div className="cb-stage-options">{campaignStages.filter(stage=>stage!=='authorization').map(stage=><button type="button" key={stage}
        aria-pressed={stage===choosing.status} disabled={stage===choosing.status} onClick={()=>{setChoosing(null);void move(choosing,stage)}}>
        {campaignLabels[stage]}{stage===choosing.status&&<Check size={16}/>}</button>)}</div>
    </CabinetDialog>}
  </section>
    <CabinetDashboard showTable={view==='list'} rowAction={changeControl} openClient={setClientCard}/>
  </>
}
