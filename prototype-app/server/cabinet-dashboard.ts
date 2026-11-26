import { createHash } from 'node:crypto'
import { db } from './db.ts'
import { dashboardFilter, periodStart, dashboardPageSize, dayMs, moscowDay, type BoardCard, type DashboardGroup, type DashboardEvent, type DashboardRow, type DashboardList, type DashboardOverview } from '../shared/cabinet-dashboard.ts'

// Both intake paths use the verified submission owner.
const scope = (owner?: string) => owner === undefined ? 'from v4_submissions s' : 'from campaign_owners r join v4_submissions s using(id)'
const ownerWhere = (owner?: string) => owner === undefined ? '' : ' and r.email = :owner'
const fields = (key: string) => "coalesce(json_extract(s.data,'$." + key + "'),'')"
const channel = "case when json_extract(s.data,'$.online')=1 then 'online' when json_array_length(s.data,'$.addresses')>0 then 'places' else 'unspecified' end"
const statusJoins = ' join campaign_stage_state st on st.id=s.id left join market_publications p on p.submission_id=s.id'
const common = `s.id, s.submitted_at as submittedAt, ${fields('business.name')} as name, ${fields('offer.promo')} as code`
const ownerArgs = (owner?: string): Record<string,string> => owner === undefined ? {} : {owner}
db.function('cabinet_lower', {deterministic:true}, value => String(value ?? '').toLowerCase())

db.function('cabinet_client_id',{deterministic:true}, email=>'client-'+createHash('sha256').update(String(email)).digest('hex'))
const partnerAccounts = `from mvp_accounts a left join partner_authorizations log on log.email=a.email
  where not exists (select 1 from v4_staff_members m where m.email=a.email)
    and a.email not in (select value from json_each(:excluded))`

export function cabinetOverview(owner?: string, excluded:readonly string[]=[]): DashboardOverview {
  const now = Date.now(), today = moscowDay(now)
  const args = {...ownerArgs(owner), start:(today-365)*dayMs-10800000}
  const groups = db.prepare(`select cast((s.submitted_at+10800000)/86400000 as integer) as day,
    st.status as status, ${channel} as channel, sum(case when p.reviewed=1 and p.erid<>'' then 1 else 0 end) as verified, count(*) as count
    ${scope(owner)} ${statusJoins} where s.submitted_at >= :start ${ownerWhere(owner)} group by 1,2,3`)
    .all(args) as DashboardGroup[]
  const recent = db.prepare(`select ${common} ${scope(owner)} where 1=1 ${ownerWhere(owner)}
    order by s.submitted_at desc, s.id desc limit 5`).all(ownerArgs(owner)) as DashboardEvent[]
  if (owner !== undefined) return {today,groups,recent}
  // UNION counts one visit per campaign and stage, including returns after a pause.
  const funnel = db.prepare(`with cohort as (
      select s.id, cast((s.submitted_at+10800000)/86400000 as integer) day, st.status, json_extract(s.data,'$.offerAccepted') accepted
      from v4_submissions s join campaign_stage_state st on st.id=s.id
      where s.submitted_at >= :start
    ), visits(id,status) as (
      select id,status from cohort
      union select id,'contract' from cohort where accepted=1
      union select c.id,e.previous from cohort c join campaign_stage_events e on e.submission_id=c.id
      union select c.id,e.stage from cohort c join campaign_stage_events e on e.submission_id=c.id
      union select c.id,w.stage from cohort c join campaign_workflow w on w.id=c.id
      union select c.id,'published' from cohort c join market_publications p on p.submission_id=c.id where p.published_at is not null
      union select c.id,'published' from cohort c join market_withdrawals w on w.submission_id=c.id
    ) select c.day,v.status,count(*) count from cohort c join visits v using(id) where v.status<>'authorization' group by c.day,v.status
    union all select cast((k.created_at+10800000)/86400000 as integer) day,'contract',count(*)
      from campaign_contracts k where k.submission_id is null and k.created_at>=:start group by day
    union all select cast((log.authorized_at+10800000)/86400000 as integer) day,'authorization',count(*)
      ${partnerAccounts} and log.authorized_at>=:start group by day`)
    .all({...args,excluded:JSON.stringify(excluded)}) as DashboardOverview['funnel']
  return {today, groups, funnel, recent}
}

function cabinetRows(owner?:string) {
  const campaigns = `select ${common}, st.version, st.status, ${channel} as channel, ${fields('offer.title')} as title,
    ${fields('business.inn')} as inn, ${fields('email')} as email, ${fields('business.city')} as city,
    ${fields('contactName')} as contactName, ${fields('business.phone')} as phone, 'campaign' as kind
    ${scope(owner)} join campaign_stage_state st on st.id=s.id where 1=1 ${ownerWhere(owner)}`
  const contracts=` union all select k.id,k.created_at,k.company,'',k.version,'contract','unspecified','Договор на размещение',
    k.inn,k.email,'','','','contract' from campaign_contracts k where k.submission_id is null ${owner===undefined?'':'and k.email=:owner'}`
  if (owner !== undefined) return campaigns+contracts
  return campaigns + contracts + ` union all select cabinet_client_id(a.email),coalesce(log.authorized_at,0),
    coalesce(nullif(json_extract(a.profile,'$.company'),''),a.email),'',0,'authorization','unspecified','Клиент до запуска',
    coalesce(json_extract(a.profile,'$.inn'),''),a.email,'','','','client'
    ${partnerAccounts} and not exists (select 1 from campaign_contracts k where k.email=a.email) and a.email not in (select email from campaign_owners where email is not null)`
}

export function campaignBoard(excluded:readonly string[]):BoardCard[] {
  return db.prepare(`select id,kind,name,title,code,inn,email,status,version,submittedAt from (${cabinetRows()})
    order by submittedAt desc,id desc`).all({excluded:JSON.stringify(excluded)}) as BoardCard[]
}

export function cabinetList(params: URLSearchParams, owner?: string, excluded:readonly string[]=[]): DashboardList {
  const filter = dashboardFilter(params)
  const source = `with rows as (${cabinetRows(owner)})`
  const where = `where (:start=0 or (kind='campaign' and submittedAt between :start and :now)) and (:status='' or status=:status) and (:q='' or instr(cabinet_lower(name||' '||code||' '||title||' '||inn||' '||email||' '||contactName||' '||phone),:q)>0)`
  const args = {...ownerArgs(owner), ...(owner===undefined && {excluded:JSON.stringify(excluded)}), start:filter.days?periodStart(filter.days):0, now:Date.now(), q:filter.q, status:filter.status}
  const {total} = db.prepare(`${source} select count(*) total from rows ${where}`).get(args) as {total:number}
  const page = Math.min(filter.page, Math.max(1,Math.ceil(total/dashboardPageSize)))
  const order = {newest:'submittedAt desc',oldest:'submittedAt asc',name:'cabinet_lower(name) asc, submittedAt desc'}[filter.sort]
  const items = db.prepare(`${source} select rows.*,case when rows.status='published' then
    (select public_id from market_publications p where p.submission_id=rows.id and p.published_at is not null) end publicId
    from rows ${where} order by ${order}, id desc limit :size offset :offset`)
    .all({...args,size:dashboardPageSize,offset:(page-1)*dashboardPageSize}) as DashboardRow[]
  return {items,total,page}
}
