import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowUpRight, Search } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { marketGroups, type CatalogRecord, type CatalogFields } from '../../shared/market-catalog'
import { marketOfferPath } from '../../shared/market'
import { queryClient } from '../api'
import { StaffError } from './staff-request'

type Request = <T>(path:string, options?:{body?:object;signal?:AbortSignal})=>Promise<T>
const path='/app/staff/offers'
const catalog='/app/staff?catalog=1'
const pageSize=40
type CatalogFilters = {q:string;status:string;offset:number}
const emptyFilters:CatalogFilters={q:'',status:'',offset:0}
const statuses={published:'На витрине',unpublished:'Не опубликовано',expired:'Срок истёк'}
const labels={brand:'Бренд',benefit:'Выгода или заголовок',condition:'Краткое условие',description:'Описание'}
const hints={brand:'Название, по которому клиенты узнают компанию.',benefit:'Что получит клиент. Например, скидку 20% на первый заказ.',condition:'Главное ограничение, которое видно сразу.',description:'Подробные условия получения и использования предложения.'}
const limits={brand:180,benefit:300,condition:700,description:12000}

function Editor({item,request,saved,reload,onExpired}:{item:CatalogRecord;request:Request;saved:(item:CatalogRecord)=>void;reload:()=>Promise<unknown>;onExpired:()=>void}) {
  const [version,setVersion]=useState(item.version)
  const [original,setOriginal]=useState(item.fields), [fields,setFields]=useState(item.fields)
  const [message,setMessage]=useState(''), [error,setError]=useState(''), [conflict,setConflict]=useState(false), [busy,setBusy]=useState(false)
  const changed=(Object.keys(fields) as (keyof CatalogFields)[]).some(key=>fields[key]!==original[key])
  const valid=!!fields.brand.trim() && !!fields.benefit.trim()
  function update(key:keyof CatalogFields,value:string) {setFields(old=>({...old,[key]:value}));setMessage('');setError('')}
  const saveLabel=item.status==='published'?'Сохранить изменения на витрине':'Сохранить черновик'
  return <section className="bl-section pad staff-panel staff-catalog-editor"><div className="page-title staff-page-title">
    <div><h2 className="bl-h2">{original.brand}</h2><p className="bl-caption">{item.origin==='beeline' ? 'Подарки и акции билайна' : 'Партнёрская кампания'} · <span className="crm-status" data-status={item.status}>{statuses[item.status]}</span></p></div>
    {item.publicId && <Link className="bl-btn" to={marketOfferPath(item.publicId)}>Открыть на витрине<ArrowUpRight size={16} aria-hidden="true"/></Link>}</div>
    <form className="bl-stack staff-form" aria-busy={busy} onSubmit={async e=>{
      e.preventDefault()
      if(busy || !changed || !valid || conflict)return
      setBusy(true);setError('');setMessage('')
      try {
        const next=await request<CatalogRecord>('/offers/'+encodeURIComponent(item.key),{body:{fields,version}})
        saved(next);setVersion(next.version);setOriginal(next.fields);setFields(next.fields);setMessage('Изменения сохранены')
      } catch(err) {
        if(err instanceof StaffError && err.status===401) onExpired()
        else {
          setConflict(err instanceof StaffError && err.status===409)
          setError(err instanceof Error ? err.message : 'Не удалось сохранить предложение')
        }
      } finally{setBusy(false)}
    }}>
      <fieldset className="staff-offer-fields" disabled={busy}>
        {(Object.keys(limits) as (keyof typeof limits)[]).map(key=><div className="bl-field" key={key}>
          <label htmlFor={'staff-offer-'+key}>{labels[key]}{(key==='brand'||key==='benefit')&&<span aria-hidden="true"> *</span>}</label>
          {key==='description' || key==='condition' ? <textarea id={'staff-offer-'+key} className="bl-input" rows={key==='description' ? 5 : 2} maxLength={limits[key]} value={fields[key]} onChange={e=>update(key,e.target.value)} aria-describedby={'staff-offer-hint-'+key}/>
            : <input id={'staff-offer-'+key} required className="bl-input" maxLength={limits[key]} value={fields[key]} onChange={e=>update(key,e.target.value)} aria-describedby={'staff-offer-hint-'+key}/>}
          <div className="staff-field-meta"><small id={'staff-offer-hint-'+key}>{hints[key]}</small><small aria-hidden="true">{fields[key].length} / {limits[key]}</small></div>
        </div>)}
        <div className="bl-field"><label htmlFor="staff-offer-group">Категория</label><select id="staff-offer-group" className="bl-select" value={fields.group} onChange={e=>update('group',e.target.value)}>
          {Object.entries(marketGroups).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></div>
      </fieldset>
      {error && <p className="bl-notice bl-notice--error" role="alert">{error}</p>}
      {(conflict || error) && <div className="bl-notice staff-retry">
        <span>Скопируйте свой текст, если хотите сохранить его. Загрузка заменит текущие поля.</span>
        <button className="bl-btn bl-btn--s" type="button" disabled={busy} onClick={async()=>{
          setBusy(true)
          try { await reload() } finally { setBusy(false) }
        }}>Загрузить сохранённую версию</button>
      </div>}
      <div className="bl-row staff-form-actions"><button className="bl-btn bl-btn--primary" disabled={busy || !changed || !valid || conflict}>{busy ? 'Сохраняем…' : saveLabel}</button>
        {changed && !conflict && <button className="bl-btn" type="button" disabled={busy} onClick={()=>{setFields(original);setError('')}}>Отменить правки</button>}
      </div>
      {message && <p className="bl-notice bl-notice--success" role="status">{message}</p>}
    </form>
  </section>
}
export function StaffOffers({offerKey,email,request,embedded=false,onExpired}:{offerKey?:string;embedded?:boolean;email:string;request:Request;onExpired:()=>void}) {
  const location=useLocation(), navigate=useNavigate()
  const filters:CatalogFilters=location.state?.staffCatalogFilters ?? emptyFilters
  const {q:query,status,offset}=filters
  const [reset,setReset]=useState(0)
  function update(next:Partial<CatalogFilters>) {
    void navigate(catalog,{replace:true,preventScrollReset:true,state:{staffCatalogFilters:{...filters,offset:0,...next}}})
  }
  const key=['v4-staff',email,'offer',offerKey]
  const item=useQuery({queryKey:key,queryFn:({signal})=>request<CatalogRecord>('/offers/'+encodeURIComponent(offerKey!),{signal}),enabled:!!offerKey,gcTime:0,retry:false,refetchOnWindowFocus:false})
  const list=useQuery({queryKey:['v4-staff',email,'offers',query,status,offset],queryFn:({signal})=>
    request<{items:CatalogRecord[];total:number}>('/offers?'+new URLSearchParams({q:query,status,offset:String(offset)}),{signal}),enabled:!offerKey,gcTime:0,retry:false})
  const current=offerKey ? item : list
  const expired=current.error instanceof StaffError && current.error.status===401
  useEffect(()=>{if(expired)onExpired()},[expired,onExpired])
  if (!embedded && item.data?.origin==='partner' && offerKey) return <Navigate replace state={location.state} to={'/app/staff/'+encodeURIComponent(offerKey)+'?edit=1'}/>
  return <>
    {!embedded && <Link className="bl-btn staff-back" to={offerKey?catalog:'/app/staff'} state={offerKey?location.state:undefined}><ArrowLeft size={18} aria-hidden="true"/>{offerKey?'Реестр витрины':'Все кампании'}</Link>}
    {offerKey && !embedded && <h1 className="bl-display-l">Редактор предложения</h1>}
    {current.error && !expired && <div role="alert" className="bl-notice staff-retry">{current.error.message} <button type="button" className="bl-btn bl-btn--s" onClick={()=>void current.refetch()}>Повторить</button></div>}
    {offerKey && current.isPending && <p className="bl-secondary" role="status">Открываем предложение…</p>}
    {offerKey && item.data && <Editor key={offerKey+':'+reset} request={request} item={item.data} onExpired={onExpired} reload={async()=>{const r=await item.refetch();if(r.isSuccess)setReset(v=>v+1)}} saved={next=>{
      queryClient.setQueryData(key,next)
      for(const prefix of [['v4-staff',email,'offers'],['v4-staff',email,'submission',offerKey],['mvp-receipt'],['market'],['market-detail'],['market-search']]) void queryClient.invalidateQueries({queryKey:prefix})
    }}/>}
    {!offerKey && <><div className="staff-case-title"><h1 className="bl-display-l">Реестр витрины</h1>
      <p className="bl-secondary">Предложения партнёров и акции билайна</p></div>
      <section className="bl-section pad staff-panel" aria-label="Предложения витрины"><div className="staff-catalog-filters">
        <label className="bl-field"><span>Найти предложение</span><span className="staff-search-field"><Search size={18} aria-hidden="true"/>
          <input type="search" className="bl-input" aria-label="Поиск в реестре" placeholder="Бренд, заголовок или ID" maxLength={200} value={query} onChange={e=>update({q:e.target.value})}/></span></label>
        <label className="bl-field"><span>Статус</span><select className="bl-select" value={status} onChange={e=>update({status:e.target.value})}>
          <option value="">Все статусы</option>{Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      </div>
      {list.isPending && <p className="bl-secondary" role="status">Загружаем предложения…</p>}
      {list.data && <>{list.data.items.length ? <div className="bl-table-wrap"><table className="bl-table staff-catalog-table" role="table"><thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Предложение</th><th role="columnheader" scope="col">Источник</th><th role="columnheader" scope="col">Категория</th><th role="columnheader" scope="col">Статус</th></tr></thead>
        <tbody role="rowgroup">{list.data.items.map(row=><tr key={row.key} role="row"><td role="cell"><Link className="staff-row-link" state={{staffCatalogFilters:filters}} to={row.origin==='partner'?'/app/staff/'+encodeURIComponent(row.key)+'?edit=1':path+'/'+encodeURIComponent(row.key)}>{row.fields.benefit}<span className="staff-subline">{row.fields.brand}</span></Link></td>
          <td role="cell"><span className="staff-mobile-label" aria-hidden="true">Источник</span>{row.origin==='beeline' ? 'билайн' : 'Партнёр'}</td><td role="cell"><span className="staff-mobile-label" aria-hidden="true">Категория</span>{marketGroups[row.fields.group]}</td>
          <td role="cell"><span className="staff-mobile-label" aria-hidden="true">Статус</span><span className="crm-status" data-status={row.status}>{statuses[row.status]}</span></td></tr>)}</tbody></table></div>
        : <div className="staff-catalog-empty"><Search size={22} aria-hidden="true"/><strong>Предложения не найдены</strong>{(query || status || offset>0) && <><p>Проверьте запрос или сбросьте фильтры.</p><button type="button" className="bl-btn" onClick={()=>update({q:'',status:''})}>Сбросить фильтры</button></>}</div>}
        {!!list.data.items.length && <div className="bl-row staff-pagination"><span className="bl-caption" role="status">{offset+1}–{offset+list.data.items.length} из {list.data.total}</span>
          <div className="bl-row staff-form-actions">
            {offset>0 && <button type="button" className="bl-btn" onClick={()=>update({offset:Math.max(0,offset-pageSize)})}>Назад</button>}
            {offset+pageSize<list.data.total && <button type="button" className="bl-btn" onClick={()=>update({offset:offset+pageSize})}>Дальше</button>}
          </div></div>}</>}
      </section></>}
  </>
}
