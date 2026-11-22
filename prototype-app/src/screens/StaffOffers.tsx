import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { marketGroups, type CatalogRecord, type CatalogFields } from '../../shared/market-catalog'
import { marketOfferPath } from '../../shared/market'
import { queryClient } from '../api'

type Request = <T>(path:string, options?:{body?:object;signal?:AbortSignal})=>Promise<T>
const path='/app/staff/offers'
const statuses={published:'На витрине',unpublished:'Не опубликовано',expired:'Срок истёк'}
const labels:Record<keyof CatalogFields,string>={brand:'Бренд',benefit:'Выгода или заголовок',condition:'Краткое условие',description:'Описание',group:'Категория'}
const limits={brand:180,benefit:300,condition:700,description:12000}

function Editor({item,request,saved,reload}:{item:CatalogRecord;request:Request;saved:(item:CatalogRecord)=>void;reload:()=>void}) {
  const [version,setVersion]=useState(item.version)
  const [fields,setFields]=useState(item.fields), [message,setMessage]=useState(''), [error,setError]=useState(''), [busy,setBusy]=useState(false)
  function update(key:keyof CatalogFields,value:string) {setFields(old=>({...old,[key]:value}));setMessage('');setError('')}
  return <section className="bl-section pad staff-panel"><div className="page-title staff-page-title"><div>
    <h1 className="bl-h2">{item.fields.brand}</h1><p className="bl-caption">{statuses[item.status]} · {item.origin==='beeline' ? 'Подарки и акции билайна' : 'Партнёрская кампания'}</p>
  </div>{item.publicId && <Link className="bl-btn" to={marketOfferPath(item.publicId)}>Открыть на витрине</Link>}</div>
    <form className="bl-stack" onSubmit={async e=>{
      e.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('')
      try {const next=await request<CatalogRecord>('/offers/'+item.key,{body:{fields,version}});saved(next);setVersion(next.version);setFields(next.fields);setMessage('Изменения сохранены')}
      catch(err){setError(err instanceof Error ? err.message : 'Не удалось сохранить предложение')}
      finally{setBusy(false)}
    }}>
      <fieldset className="staff-offer-fields" disabled={busy}>
        {(Object.keys(limits) as (keyof typeof limits)[]).map(key=><div className="bl-field" key={key}><label htmlFor={'staff-offer-'+key}>{labels[key]}</label>
          {key==='description' || key==='condition' ? <textarea id={'staff-offer-'+key} className="bl-input" rows={key==='description' ? 4 : 2} maxLength={limits[key]} value={fields[key]} onChange={e=>update(key,e.target.value)}/>
          : <input id={'staff-offer-'+key} required className="bl-input" maxLength={limits[key]} value={fields[key]} onChange={e=>update(key,e.target.value)}/>}
        </div>)}
        <div className="bl-field"><label htmlFor="staff-offer-group">{labels.group}</label><select id="staff-offer-group" className="bl-input" value={fields.group} onChange={e=>update('group',e.target.value)}>
          {Object.entries(marketGroups).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></div>
      </fieldset>
      <div className="bl-row"><button className="bl-btn bl-btn--primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить изменения'}</button>
        {item.origin==='partner' && <Link to={'/app/staff/'+item.key}>Заявка и модерация</Link>}</div>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error} <button className="bl-btn bl-btn--s" type="button" onClick={reload}>Загрузить сохранённую версию</button></p>}
    </form>
  </section>
}
export function StaffOffers({offerKey,email,request}:{offerKey?:string;email:string;request:Request}) {
  const [query,setQuery]=useState(''), [status,setStatus]=useState(''), [offset,setOffset]=useState(0), [reset,setReset]=useState(0)
  const key=['v4-staff',email,'offer',offerKey]
  const item=useQuery({queryKey:key,queryFn:({signal})=>request<CatalogRecord>('/offers/'+offerKey,{signal}),enabled:!!offerKey,gcTime:0,retry:false,refetchOnWindowFocus:false})
  const list=useQuery({queryKey:['v4-staff',email,'offers',query,status,offset],queryFn:({signal})=>
    request<{items:CatalogRecord[];total:number}>('/offers?'+new URLSearchParams({q:query,status,offset:String(offset)}),{signal}),enabled:!offerKey,gcTime:0,retry:false})
  const current=offerKey ? item : list
  return <>
    {offerKey && <Link to={path}>← Все офферы</Link>}
    {current.isPending && <p role="status">Загружаем офферы…</p>}
    {current.error && <p role="alert">{current.error.message} <button className="bl-btn" onClick={()=>void current.refetch()}>Повторить</button></p>}
    {offerKey && item.data && <Editor key={offerKey+':'+reset} request={request} item={item.data} reload={async()=>{const r=await item.refetch();if(r.isSuccess)setReset(v=>v+1)}} saved={next=>{
      queryClient.setQueryData(key,next)
      for(const prefix of [['v4-staff',email,'offers'],['market'],['market-detail'],['market-search']]) void queryClient.invalidateQueries({queryKey:prefix})
    }}/>}
    {!offerKey && <><h1 className="bl-display-l">Реестр офферов</h1>
      <section className="bl-section pad staff-panel"><div className="bl-row staff-search">
        <input type="search" className="bl-input" placeholder="Бренд, заголовок или ID" aria-label="Поиск в реестре" maxLength={200} value={query} onChange={e=>{setQuery(e.target.value);setOffset(0)}}/>
        <select className="bl-input" aria-label="Статус оффера" value={status} onChange={e=>{setStatus(e.target.value);setOffset(0)}}>
          <option value="">Все статусы</option>{Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
      </div>
      {list.data && <>{list.data.total ? <div className="bl-table-wrap"><table className="bl-table"><thead><tr><th>Предложение</th><th>Источник</th><th>Категория</th><th>Статус</th></tr></thead>
        <tbody>{list.data.items.map(row=><tr key={row.key}><td><Link className="staff-row-link" to={path+'/'+row.key}>{row.fields.brand} · {row.fields.benefit}</Link></td><td>{row.origin==='beeline' ? 'билайн' : 'Партнёр'}</td><td>{marketGroups[row.fields.group]}</td><td>{statuses[row.status]}</td></tr>)}</tbody></table></div> : <p>Офферы не найдены.</p>}
        <div className="bl-row"><span className="bl-caption">Всего офферов · {list.data.total}</span>
          {offset>0 && <button className="bl-btn" onClick={()=>setOffset(offset-40)}>Назад</button>}
          {offset+40<list.data.total && <button className="bl-btn" onClick={()=>setOffset(offset+40)}>Дальше</button>}</div></>}
      </section></>}
  </>
}
