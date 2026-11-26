import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { marketOfferPath } from '../../shared/market'
import type { Receipt } from '../../shared/mvp-promo'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { ArrowDownUp, ChevronLeft, ChevronRight, Columns3, Download, FileSearch, FolderOpen, ListFilter, MoreHorizontal, Plus, Search, X } from 'lucide-react'
import { campaignLabels, channelLabels, dashboardFilter, dashboardPageSize, type DashboardOverview, type DashboardList, type DashboardRow } from '../../shared/cabinet-dashboard'
import { CabinetDialog, CampaignStatus } from './AccountCabinet'
import { CabinetOverview, OverviewLoading, RecentEvents } from './CabinetOverview'
import { campaignRowPath, useCabinetData } from './cabinet-data'
import { mvpRequest,useMvpSession } from './MvpSession'
import { PartnerDrafts, usePartnerDrafts } from './PartnerDraft'
import { partnerDemo } from './mvp-demo'

const formatDate=new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',year:'numeric',timeZone:'Europe/Moscow'})
const columns={date:'Дата',channel:'Место покупки',contact:'Контакт партнёра'}
type Column = keyof typeof columns

function PartnerRowAction({row}:{row:DashboardRow}) {
  if(row.status==='published' && row.publicId)return <Link to={marketOfferPath(row.publicId)}>Открыть на витрине</Link>
  const path=campaignRowPath(row,false)
  if(row.status==='contract')return <Link to={row.kind==='contract'?path:path+'?section=contract'}>Открыть договор</Link>
  return <Link to={path}>{row.status==='review'?'Посмотреть условия':'Открыть кампанию'}</Link>
}

function exportRows(items:DashboardRow[],staff:boolean) {
  const cell=(v:string)=>'"'+(/^[\s]*[=+@-]/.test(v)?"'":'')+v.replace(/"/g,'""')+'"'
  const rows=[['Компания','Промокод','Предложение','Дата, МСК','Статус','Место покупки',...(staff?['ИНН','Контакт','Телефон','Почта']:[])],
    ...items.map(r=>[r.name,r.code,r.title,(r.submittedAt?formatDate.format(r.submittedAt):''),campaignLabels[r.status],channelLabels[r.channel],...(staff?[r.inn,r.contactName,r.phone,r.email]:[])])]
  const file=new Blob(['\ufeff'+rows.map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'})
  const url=URL.createObjectURL(file), a=document.createElement('a')
  a.href=url;a.download='Кампании.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}

export function CabinetDashboard({showTable=true,rowAction,openClient}:{
  showTable?:boolean; rowAction?:(row:DashboardRow)=>ReactNode; openClient?:(row:DashboardRow)=>void
}={}) {
  const session=useMvpSession(), staff=!!session.role, home=staff?'/app/staff':'/app/campaigns'
  const [params,setParams]=useSearchParams(), location=useLocation()
  const submittedId=location.state?.submittedId
  const submitted=useQuery({queryKey:['mvp-receipt',session.email,submittedId],enabled:!staff&&typeof submittedId==='string',
    queryFn:()=>mvpRequest<Receipt>('/campaigns/'+encodeURIComponent(submittedId),undefined,session.email),refetchInterval:10_000,retry:false})
  const incoming=typeof location.state?.cabinetSearch==='string'?location.state.cabinetSearch:''
  const [days,setDays]=useState(7), [search,setSearch]=useState(incoming)
  const searchParams=new URLSearchParams(params)
  searchParams.set('q',incoming)
  const filter=dashboardFilter(searchParams)
  const [selected,setSelected]=useState<DashboardRow[]>([]), [action,setAction]=useState<DashboardRow|null>(null)
  const [settings,setSettings]=useState(false), [visible,setVisible]=useState<Record<Column,boolean>>({date:true,channel:false,contact:staff})
  const [exported,setExported]=useState('')
  const master=useRef<HTMLInputElement>(null), table=useRef<HTMLElement>(null), nav=useNavigate()
  const overview=useCabinetData<DashboardOverview>('/dashboard',staff)
  const request=new URLSearchParams({q:filter.q,status:filter.status,page:String(filter.page),sort:filter.sort,days:String(filter.days)})
  const list=useCabinetData<DashboardList>('/dashboard/rows?'+request,showTable)
  const rows=list.data?.items??[], total=list.data?.total??0, page=list.data?.page??filter.page
  const selectedIds=new Set(selected.map(r=>r.id)), all=rows.length>0&&rows.every(r=>selectedIds.has(r.id))
  const some=rows.some(r=>selectedIds.has(r.id)), filtered=!!(filter.q||filter.status||filter.days)
  const drafts=usePartnerDrafts(!staff)
  const emptyWorkspace=!staff && list.isSuccess && !total && !filtered
  const firstCampaign=emptyWorkspace && drafts.drafts.isSuccess && !drafts.rows.length
  const detail=(r:DashboardRow)=>campaignRowPath(r,staff)
  useEffect(()=>{setSearch(incoming)},[incoming])
  useEffect(()=>{setSelected([]);setExported('')},[filter.q,filter.status,filter.days])
  useEffect(()=>{if(master.current)master.current.indeterminate=some&&!all},[some,all])
  function change(values:Record<string,string>) {
    const next=new URLSearchParams(params)
    for(const [key,value] of Object.entries(values)){if(key==='q')continue;if(value)next.set(key,value);else next.delete(key)}
    if(!Object.hasOwn(values,'page'))next.delete('page')
    setParams(next,{replace:true,preventScrollReset:true,state:{cabinetSearch:values.q??incoming}})
  }
  function filterBy(status:string){change(staff?{status,view:'list'}:{status});requestAnimationFrame(()=>table.current?.scrollIntoView({block:'start'}))}
  function download(items:DashboardRow[]){
    exportRows(items,staff);setExported('Файл CSV подготовлен · записей '+items.length);setAction(null)
  }
  const summary=overview.isPending?<OverviewLoading/>:overview.isError?<div className="crm-feedback" role="alert">Не удалось загрузить сводку. <button className="bl-btn" onClick={()=>void overview.refetch()}>Повторить</button></div>
      :<CabinetOverview data={overview.data} staff={staff} days={days} setDays={setDays} onFilter={filterBy}/>
  return <>
    {!staff && <><div className="crm-page-heading"><div><h1>рекламные кампании</h1><p>Предложения вашей компании и их публикация на витрине.</p></div>
      <div className="crm-heading-actions">
      {!firstCampaign && <Link className="bl-btn bl-btn--primary crm-primary" to="/app/campaigns/formats"><Plus size={17}/>новая кампания</Link>}</div></div>
      {!filtered && <PartnerDrafts {...drafts}/>}
      {firstCampaign && <section className="crm-card crm-empty"><h2>Создайте первую кампанию</h2><p>Выберите формат и подготовьте предложение. Черновик можно продолжить в любой момент.</p><Link className="bl-btn bl-btn--primary" to="/app/campaigns/formats">Создать кампанию</Link></section>}
      {submitted.data&&<section className="crm-card" role="status"><h2>{submitted.data.promo.code}</h2>
        <p>{submitted.data.status==='review'?'Кампания на модерации. Показы начнутся после публикации.':submitted.data.status==='contract'?'Запуск начат. Менеджер проверит подпись, затем кампания перейдёт на модерацию.':'Текущий этап · '+campaignLabels[submitted.data.status]}</p>
        <Link to={home+'/'+submittedId}>Открыть кампанию</Link></section>}</>}
    {showTable && !emptyWorkspace && <section ref={table} className="crm-card crm-table-card" aria-label="Список кампаний">
      <div className="crm-table-title"><h2>{staff?'все кампании':'мои кампании'}</h2><button className="crm-icon" onClick={()=>setSettings(true)} aria-label="Настроить столбцы" title="Настроить столбцы"><Columns3/></button></div>
      <div className="crm-table-controls"><form className="crm-searchfield" onSubmit={e=>{e.preventDefault();change({q:search.trim()})}}>
        <button type="submit" aria-label="Найти"><Search size={17}/></button><input type="search" aria-label={staff?'Поиск по названию компании, ИНН или почте':'Поиск по кампании'} placeholder={staff?'Компания, ИНН, почта или промокод':'Промокод или предложение'} value={search} maxLength={120} onChange={e=>{setSearch(e.target.value);change({q:e.target.value})}}/></form>
        <label className="crm-select-wrap"><ListFilter size={16}/><select aria-label="Фильтр по статусу" value={filter.status} onChange={e=>change({status:e.target.value})}><option value="">Все статусы</option>{Object.entries(campaignLabels).filter(([stage])=>staff||stage!=='authorization').map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        {filter.days>0 && <button className="bl-btn bl-btn--s" onClick={()=>change({days:''})}>Запуски за {filter.days} дней <X size={14} aria-label="Снять фильтр периода"/></button>}
        <label className="crm-select-wrap"><ArrowDownUp size={16}/><select aria-label="Сортировка" value={filter.sort} onChange={e=>change({sort:e.target.value})}><option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option><option value="name">По компании</option></select></label></div>
      {selected.length>0 && <div className="crm-selection"><span>Выбрано · {selected.length}</span><button onClick={()=>download(selected)}><Download size={15}/>Скачать CSV</button><button onClick={()=>setSelected([])} aria-label="Снять выбор"><X size={16}/></button></div>}
      {exported&&<p className="crm-exported" role="status">{exported}</p>}
      {list.isPending?<div className="crm-list-load" role="status" aria-busy="true">Загружаем кампании…<i/><i/><i/></div>:
        list.isError?<div className="crm-feedback" role="alert">{list.error.message} <button className="bl-btn" onClick={()=>void list.refetch()}>Повторить</button></div>:
        rows.length===0?<div className="crm-empty"><FileSearch/><h3>{filtered?'Ничего не найдено':staff?'Пока нет кампаний':'Пока нет запущенных кампаний'}</h3>
          <p>{filtered?'Попробуйте другое название или сбросьте фильтры.':staff?'Здесь появятся кампании, которые запустят партнёры.':'Создайте первую кампанию.'}</p>
          {filtered?<button className="bl-btn" onClick={()=>change({q:'',status:'',days:''})}>Сбросить фильтры</button>:null}</div>:
        <div className="crm-table-scroll" tabIndex={0} aria-label="Таблица с горизонтальной прокруткой"><table className="crm-table"><thead><tr>
          <th><label className="crm-master"><input type="checkbox" ref={master} aria-label="Выбрать всю страницу" checked={all} onChange={()=>setSelected(current=>[...current.filter(r=>!rows.some(item=>item.id===r.id)),...(all?[]:rows)])}/><span>Выбрать страницу</span></label></th>
          <th scope="col">{staff?'Компания и предложение':'Промокод и предложение'}</th>{visible.contact&&staff&&<th scope="col">Контакт партнёра</th>}{visible.date&&<th scope="col">{staff?'Дата, МСК':'Дата, МСК'}</th>}{visible.channel&&<th scope="col">Место покупки</th>}<th scope="col">Статус</th><th aria-label="Действия"/></tr></thead>
          <tbody>{rows.map(r=><tr key={r.id} data-selected={selectedIds.has(r.id)}><td><input type="checkbox" aria-label={'Выбрать · '+(staff?r.name:r.code)} checked={selectedIds.has(r.id)} onChange={()=>setSelected(current=>selectedIds.has(r.id)?current.filter(s=>s.id!==r.id):[...current,r])}/></td>
            <td className="crm-row-title">{r.kind==='client'?<button className="cb-client" onClick={()=>openClient?.(r)}>{r.name}</button>:<Link to={detail(r)}>{staff?r.name:r.code||r.name}</Link>}<small>{r.title || r.name}</small>{staff&&<small>{[r.code,r.inn&&'ИНН '+r.inn,r.city].filter(Boolean).join(' · ')}</small>}</td>
            {visible.contact&&staff&&<td className="crm-row-meta">{r.contactName&&<strong>{r.contactName}</strong>}{r.phone&&<small>{r.phone}</small>}{r.email||'—'}</td>}
            {visible.date&&<td className="crm-row-meta">{r.submittedAt?<time dateTime={new Date(r.submittedAt).toISOString()}>{formatDate.format(r.submittedAt)}</time>:'—'}</td>}
            {visible.channel&&<td className="crm-row-meta">{channelLabels[r.channel]}</td>}<td className="crm-row-status"><CampaignStatus status={r.status}/>{!staff && <small className="crm-next-action"><PartnerRowAction row={r}/></small>}</td>
            <td className="crm-row-action">{r.kind==='campaign'&&rowAction?.(r)}<button className="crm-icon" aria-label={'Действия · '+(staff?r.name:r.code)} onClick={()=>setAction(r)}><MoreHorizontal/></button></td></tr>)}</tbody></table></div>}
      {list.isSuccess && total>0 && <footer className="crm-pagination"><span aria-live="polite">{(page-1)*dashboardPageSize+1}–{Math.min(total,page*dashboardPageSize)} из {total}</span>
        <div><button className="crm-icon" aria-label="Предыдущая страница" disabled={page===1} onClick={()=>change({page:String(page-1)})}><ChevronLeft/></button>
          <span>{page} / {Math.ceil(total/dashboardPageSize)}</span><button className="crm-icon" aria-label="Следующая страница" disabled={page*dashboardPageSize>=total} onClick={()=>change({page:String(page+1)})}><ChevronRight/></button></div></footer>}
    </section>}
    {staff&&summary}
    {staff&&overview.data&&<RecentEvents data={overview.data} staff={staff}/>}
    {!staff&&partnerDemo&&<div><a className="bl-btn" href="/app/?preview=staff" target="_blank" rel="noopener noreferrer">Открыть демо сотрудника</a></div>}
    {settings&&<CabinetDialog title="Столбцы таблицы" close={()=>setSettings(false)} variant="command"><div className="crm-options">{(Object.keys(columns) as Column[]).filter(c=>c!=='contact'||staff).map(c=><label key={c}><input type="checkbox" checked={visible[c]} onChange={()=>setVisible(v=>({...v,[c]:!v[c]}))}/>{columns[c]}</label>)}</div></CabinetDialog>}
    {action&&<CabinetDialog title={staff?action.name:action.code||action.name} close={()=>setAction(null)} variant="command"><div className="crm-actions">
      <p>{action.title}</p><button onClick={()=>{if(action.kind==='client'){openClient?.(action);setAction(null)}else nav(detail(action))}}><FolderOpen size={18}/>{action.kind==='client'?'Открыть клиента':'Открыть кампанию'}</button>
      {staff&&action.kind==='campaign'&&<button onClick={()=>nav(detail(action)+'?edit=1')}>Редактировать на витрине</button>}
      {!staff&&action.inn===session.profile?.inn&&<button onClick={()=>nav('/app/materials?campaign='+action.id)}>Создать постер A4</button>}
      <button onClick={()=>download([action])}><Download size={18}/>Скачать строку CSV</button></div></CabinetDialog>}
  </>
}
