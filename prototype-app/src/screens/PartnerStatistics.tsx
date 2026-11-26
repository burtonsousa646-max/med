import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays } from 'lucide-react'
import { CabinetTrend } from './CabinetTrend'
import { analytics } from '../analytics'
import { dayDate, moscowDay, reportPeriod, type MarketResponseReport } from '../../shared/cabinet-dashboard'
import { PartnerCabinet } from './Mvp'
import { draftUrl, usePartnerDrafts } from './PartnerDraft'
import { mvpRequest, useMvpSession } from './MvpSession'

const date = new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'})
const localDate = new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Moscow'})
const number = new Intl.NumberFormat('ru-RU')
const percent = new Intl.NumberFormat('ru-RU',{style:'percent',maximumFractionDigits:1})
const ctr=(clicks:number,shows:number)=>shows?percent.format(clicks/shows):'—'
type Row=MarketResponseReport['items'][number]
const clicks=(r:Row)=>r.reveals+r.sites+r.routes

function FirstCampaign() {
  const {drafts,rows}=usePartnerDrafts()
  const draft=rows[0]
  return <section className="crm-card crm-empty"><h2>Статистика появится после публикации</h2>
    <p>Здесь вы увидите, сколько раз клиенты открыли предложение и какие действия выбрали.</p>
    {drafts.isPending ? <p role="status">Проверяем черновики…</p> : drafts.isError ? <Link className="bl-btn" to="/app/campaigns">Перейти к кампаниям</Link> :
      <Link className="bl-btn bl-btn--primary" to={draft?draftUrl(draft.id):'/app/campaigns/formats'}>{draft?'Продолжить черновик':'Создать кампанию'}</Link>}
  </section>
}

function Trend({report,days}:{report:MarketResponseReport;days:number}) {
  const totals=new Map(report.daily.map(row=>[row.day,row]))
  const first=Math.max(report.today-days+1,moscowDay(report.since))
  const points=Array.from({length:Math.max(0,report.today-first+1)},(_,i)=>{
    const day=first+i, row=totals.get(day)
    return {date:date.format(dayDate(day)),current:row?.opens??0,previous:row?.clicks??0}
  })
  return <section className="crm-card"><h2>динамика по дням</h2>
    <CabinetTrend key={days} points={points} kind="line" label="День статистики по предложениям" series={[
      {key:'current',label:'Просмотры',color:'var(--crm-chart-ink)'},
      {key:'previous',label:'Целевые клики',color:'var(--crm-chart-accent)',dashed:true},
    ]}/>
  </section>
}

function Performance({data,days}:{data:MarketResponseReport;days:number}) {
  if(!data.items.length) return data.hasCampaigns ? <section className="crm-card crm-empty"><h2>За этот период нет размещений с данными</h2>
    <p>Данные появятся после публикации предложения. Для прошлых размещений можно выбрать другой период.</p><Link className="bl-btn" to="/app/campaigns">Мои кампании</Link></section> : <FirstCampaign/>
  const sum=(key:Exclude<keyof Row,'id'|'title'|'code'|'online'>)=>data.items.reduce((n,r)=>n+r[key],0)
  const opens=sum('opens'), reveals=sum('reveals'), sites=sum('sites'), routes=sum('routes')
  const showRoutes=data.items.some(r=>!r.online || r.routes>0)
  const marketShows=sum('marketShows'), marketClicks=sum('marketClicks')
  const first=data.today-days+1
  return <>
    <div className="stats-kpis">
      <section className="crm-card"><h2>Просмотры карточек</h2><strong>{number.format(opens)}</strong><p className="crm-muted">Все открытия, включая переходы по прямой ссылке.</p></section>
      <section className="crm-card"><h2>Целевые клики</h2><strong>{number.format(reveals+sites+routes)}</strong>
        <dl className="stats-actions"><div><dt>Показали промокод</dt><dd>{number.format(reveals)}</dd></div>
          <div><dt>Перешли на сайт</dt><dd>{number.format(sites)}</dd></div>
          {showRoutes && <div><dt>Открыли маршрут</dt><dd>{number.format(routes)}</dd></div>}</dl></section>
    </div>
    {moscowDay(data.since)>=first && <p className="crm-muted">Просмотры и клики учитываются с {localDate.format(data.since)} МСК.</p>}
    {opens+reveals+sites+routes>0 ? <Trend report={data} days={days}/> :
      <section className="crm-card"><h2>динамика по дням</h2><p className="crm-chart-empty">За время наблюдения у этих кампаний пока нет открытий и целевых кликов.</p></section>}
    <section className="crm-card stats-responses"><h2>по кампаниям</h2>
      <div className="crm-table-scroll" tabIndex={0} aria-label="Показатели по кампаниям"><table className="crm-table"><thead><tr>
        <th scope="col">Кампания</th><th scope="col">Просмотры</th><th scope="col">Целевые клики</th><th scope="col">Промокод</th>
        <th scope="col">На сайт</th>{showRoutes&&<th scope="col">Маршрут</th>}<th scope="col">Показы на витрине</th><th scope="col">CTR</th></tr></thead>
        <tbody>{data.items.map(r=><tr key={r.id}><th scope="row"><Link to={'/app/campaigns/'+encodeURIComponent(r.id)}>{r.title||r.code||'Кампания'}</Link></th>
          <td>{r.opens}</td><td>{clicks(r)}</td><td>{r.reveals}</td><td>{r.sites}</td>{showRoutes&&<td>{r.online && !r.routes?'—':r.routes}</td>}
          <td>{r.marketShows}</td><td>{ctr(r.marketClicks,r.marketShows)}</td></tr>)}</tbody></table></div>
    </section>
    <section className="crm-card" aria-label="Показы на витрине"><h2>показы на витрине</h2>
      <dl className="stats-actions"><div><dt>Показы</dt><dd>{number.format(marketShows)}</dd></div>
        <div><dt>Переходы в карточку</dt><dd>{number.format(marketClicks)}</dd></div>
        <div><dt>CTR</dt><dd>{ctr(marketClicks,marketShows)}</dd></div></dl>
      <p className="crm-muted">CTR — доля показов на витрине «Лучшее рядом», с которых открыли предложение.</p>
      {moscowDay(data.impressionSince)>=first && <p className="crm-muted">Показы и CTR учитываются с {localDate.format(data.impressionSince)} МСК.</p>}
    </section>
  </>
}

export default function PartnerStatistics() {
  const session=useMvpSession(), [params,setParams]=useSearchParams()
  const days=reportPeriod(params.get('days'))||7
  const report=useQuery({queryKey:['mvp-campaigns',session.email,'market-responses',days],
    queryFn:({signal})=>mvpRequest<MarketResponseReport>('/statistics/responses?days='+days,undefined,session.email,undefined,signal),
    retry:false,refetchInterval:30_000})
  useEffect(()=>{analytics.view('/app/statistics')},[])
  return <PartnerCabinet>
    <div className="crm-page-heading"><h1>статистика</h1><label className="crm-period"><CalendarDays size={16}/><select aria-label="Период обзора" value={days}
      onChange={e=>setParams({days:e.target.value},{replace:true})}>{[7,30,90].map(d=><option key={d} value={d}>Последние {d} дней</option>)}</select></label></div>
    {report.isPending ? <p className="crm-card" role="status">Загружаем статистику…</p> : report.isError ? <div className="crm-card crm-feedback" role="alert">Не удалось загрузить статистику.
      <button className="bl-btn" onClick={()=>void report.refetch()}>Повторить</button></div> : <Performance data={report.data} days={days}/>}
  </PartnerCabinet>
}
