import { useState } from 'react'
import { Activity, ArrowDownRight, ArrowUpRight, BadgeCheck, CalendarDays, CircleCheck, Clock3, Globe, Inbox, MapPin, Minus, Monitor, Send, Store } from 'lucide-react'
import { CabinetTrend } from './CabinetTrend'
import { campaignLabels, campaignStages, channelLabels, dayDate, type Channel, type DashboardGroup, type DashboardOverview } from '../../shared/cabinet-dashboard'
import type { PartnerCampaignStatus } from '../../shared/mvp-promo'
import { CabinetEvents } from './AccountCabinet'

const fmt = new Intl.NumberFormat('ru-RU')
const shortDate = new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'})
const dayLabel = (day:number)=>shortDate.format(dayDate(day))
const shortMonth = new Intl.DateTimeFormat('ru-RU',{month:'short',timeZone:'UTC'})
const periodOptions = [[7,'7 дней'],[30,'30 дней'],[90,'90 дней']] as const
const statuses = campaignStages.filter(stage => stage !== 'authorization')
const channels = Object.keys(channelLabels) as Channel[]
const gold = 'var(--crm-chart-gold)'
const series = [
  {key:'current',label:'Выбранный период',color:gold},
  {key:'previous',label:'Предыдущий период',color:'var(--crm-chart-ink)'},
] as const
type Metric = 'total' | PartnerCampaignStatus
const count = (groups:DashboardGroup[],key:Metric='total')=>groups.reduce((sum,g)=>sum+((key==='total'||g.status===key)?g.count:0),0)

export function OverviewLoading() {
  return <div className="crm-load" role="status" aria-busy="true"><span>Загружаем сводку…</span><div className="crm-metrics">{[1,2,3,4].map(i=><i key={i}/>)}</div><i/></div>
}
function StaffFunnel({funnel,start,today}:{funnel:NonNullable<DashboardOverview['funnel']>;start:number;today:number}) {
  const visits=funnel.filter(group=>group.day>=start && group.day<=today)
  const stages=campaignStages.map(status=>({status,value:visits.reduce((sum,g)=>sum+(g.status===status?g.count:0),0)}))
  const largest=Math.max(1,...stages.map(stage=>stage.value))
  return <section className="crm-card" aria-label="Воронка по этапам">
      <div className="crm-card-head"><div><h2>воронка по этапам</h2>
        <p>Авторизация — клиенты, впервые вошедшие за период. На этапе договора также видны договоры, сформированные за период. Следующие этапы учитывают кампании, запущенные за период и достигшие этапа.</p></div></div>
      <div className="crm-funnel">{stages.map(({status,value})=><div key={status} data-stage={status}>
        <span>{campaignLabels[status]}<b>{fmt.format(value)}</b></span>
        <progress aria-label={campaignLabels[status]} aria-valuetext={fmt.format(value)} max={largest} value={value}/></div>)}</div>
    </section>
}

export function CabinetOverview({data,staff,days,setDays,onFilter}:{data:DashboardOverview;staff:boolean;days:number;setDays:(v:number)=>void;onFilter:(v:string)=>void}) {
  const [shown,setShown]=useState({current:true,previous:true})
  const [bucket,setBucket]=useState('week')
  const [source,setSource]=useState<Channel|null>(null), [hoverSource,setHoverSource]=useState<Channel|null>(null)
  const highlighted=hoverSource??source
  const start=data.today-days+1
  const active=data.groups.filter(g=>g.day>=start && g.day<=data.today)
  const previous=data.groups.filter(g=>g.day>=start-days && g.day<start)
  const total=count(active)
  const dayTotals = new Map<number,number>()
  for(const g of data.groups) dayTotals.set(g.day,(dayTotals.get(g.day)??0)+g.count)
  const points=Array.from({length:days},(_,i)=>({date:dayLabel(start+i),priorDate:dayLabel(start-days+i),current:dayTotals.get(start+i)??0,previous:dayTotals.get(start-days+i)??0}))
  const metricList = [
    {key:'total',label:'Всего кампаний',Icon:staff?Inbox:Send,tone:'gold'},
    {key:'review',label:'На модерации',Icon:Clock3,tone:'violet'},
    {key:'contract',label:'Договор',Icon:BadgeCheck,tone:'blue'},
    {key:'published',label:'На витрине',Icon:CircleCheck,tone:'green'},
  ] as const
  const buckets=bucket==='week'?7:bucket==='month'?6:12
  const bars=Array.from({length:buckets},(_,i)=>{
    const now=dayDate(data.today), step=bucket==='month'?5:1
    let end=data.today-(buckets-1-i)*step, begin=end-step+1
    if(bucket==='year'){
      const startMonth=Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-(buckets-1-i),1)/86400000
      begin=startMonth;end=Math.min(data.today,Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-(buckets-1-i)+1,1)/86400000-1)
    }
    const value=count(data.groups.filter(g=>g.day>=begin && g.day<=end))
    return {current:value,tickLabel:bucket==='year'?shortMonth.format(dayDate(begin)):dayLabel(begin),date:dayLabel(begin)+(end!==begin?' – '+dayLabel(end):'')}
  })
  const sourceCounts=channels.map(c=>count(active.filter(g=>g.channel===c)))
  const segments=sourceCounts.map((n,i)=>({
    length:total?100*n/total:0,
    offset:total?-100*sourceCounts.slice(0,i).reduce((a,b)=>a+b,0)/total:0,
  }))
  return <>
    <div className="crm-overview-heading"><span><Activity size={16}/>Обзор за период</span>
      <label className="crm-period"><CalendarDays size={16}/><select aria-label="Период обзора" value={days} onChange={e=>setDays(Number(e.target.value))}>{periodOptions.map(([v,label])=><option key={v} value={v}>Последние {label}</option>)}</select></label>
    </div>
    {staff && <StaffFunnel funnel={data.funnel??[]} start={start} today={data.today}/>}
    <div className="crm-metrics">{metricList.map(({key,label,Icon,tone})=>{
      const value=count(active,key), diff=value-count(previous,key), Trend=diff>0?ArrowUpRight:diff<0?ArrowDownRight:Minus
      return <div className={'crm-metric crm-metric--'+tone} key={key}><div><span>{label}</span><i><Icon size={18}/></i></div>
        <strong>{fmt.format(value)}</strong><small><b><Trend size={14}/>{diff>0?'+':''}{diff}</b>к прошлому периоду</small></div>
    })}</div>
    <div className="crm-chartgrid"><section className="crm-card crm-trend"><div className="crm-card-head"><div><h2>динамика кампаний</h2><p>{dayLabel(start)} – {dayLabel(data.today)}</p></div><Activity className="crm-corner"/></div>
      {total+count(previous)>0 ? <>
        <div className="crm-legend">{series.map(({key,label})=><button key={key} aria-pressed={shown[key]} disabled={shown[key]&&!shown[key==='current'?'previous':'current']} onClick={()=>setShown(s=>({...s,[key]:!s[key]}))}><i className={'crm-line-key '+key}/>{label}</button>)}</div>
        <CabinetTrend key={days} points={points} series={series.filter(({key})=>shown[key])} kind="bar" label="День запуска кампаний"/>
      </> : <p className="crm-chart-empty">За выбранные периоды кампаний ещё нет</p>}
    </section>
    <section className="crm-card crm-distribution"><div className="crm-card-head"><div><h2>статусы кампаний</h2><p>У запущенных за период</p></div></div>
      <div className="crm-stackbar" aria-hidden="true">{statuses.map(s=>count(active,s)>0&&<i key={s} data-status={s} style={{flex:count(active,s)}}/>)}</div>
      <div className="crm-status-list">{statuses.map(s=><button key={s} title={campaignLabels[s]+' · '+count(active,s)} onClick={()=>onFilter(s)} aria-label={'Показать в списке · '+campaignLabels[s]}><i data-status={s}/><span>{campaignLabels[s]}</span><b>{count(active,s)}</b></button>)}</div>
    </section></div>
    <details className="crm-more"><summary>Подробная аналитика</summary><div className="crm-detail-grid">
      <section className="crm-card"><h2>место покупки</h2><p>Из условий предложений</p>
        <div className="crm-source-ring">
          <svg viewBox="0 0 100 100" role="group" aria-label="Распределение по месту покупки">
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--crm-bg)" strokeWidth="12"/>
            {segments.map(({length,offset},i)=>length>0&&<circle key={channels[i]} cx="50" cy="50" r="42" pathLength="100"
              fill="none" stroke={'var(--crm-source-'+i+')'} strokeWidth="12" strokeDasharray={length+' '+(100-length)}
              strokeDashoffset={offset} transform="rotate(-90 50 50)" onPointerEnter={()=>setHoverSource(channels[i])}
              onPointerLeave={()=>setHoverSource(null)} onClick={()=>setSource(source===channels[i]?null:channels[i])}>
              <title>{channelLabels[channels[i]]} · {sourceCounts[i]}</title></circle>)}
          </svg><div aria-live="polite"><b>{highlighted?sourceCounts[channels.indexOf(highlighted)]:total}</b><small>{highlighted?channelLabels[highlighted]:'Всего'}</small></div></div>
        <div className="crm-source-list">{channels.map((c,i)=>{
          const Icon=[Globe,Store,MapPin][i]
          return <button key={c} aria-pressed={source===c} onFocus={()=>setHoverSource(c)} onBlur={()=>setHoverSource(null)} onPointerEnter={()=>setHoverSource(c)} onPointerLeave={()=>setHoverSource(null)} onClick={()=>setSource(source===c?null:c)} title={channelLabels[c]+' · '+sourceCounts[i]}><i style={{background:'var(--crm-source-'+i+')'}}/><Icon size={16}/><span>{channelLabels[c]}</span><b>{sourceCounts[i]}</b></button>
        })}</div></section>
      <section className="crm-card"><h2>поступление кампаний</h2><select className="crm-select" aria-label="Группировка поступлений" value={bucket} onChange={e=>setBucket(e.target.value)}><option value="week">Последние 7 дней</option><option value="month">Последние 30 дней</option><option value="year">Последние 12 месяцев</option></select>
        {bars.some(point=>point.current>0) ? <CabinetTrend key={bucket} points={bars} series={[{key:'current',label:'Кампании',color:gold}]} kind="bar" label="Период поступления кампаний"/> :
          <p className="crm-chart-empty">За этот период кампаний ещё нет</p>}</section>
    </div></details>
  </>
}

export function RecentEvents({data,staff}:{data:DashboardOverview;staff:boolean}){
  return <section className="crm-card"><div className="crm-card-head"><div><h2>последние события</h2><p>Последние запущенные кампании</p></div><Monitor className="crm-corner"/></div><CabinetEvents items={data.recent} staff={staff}/></section>
}
