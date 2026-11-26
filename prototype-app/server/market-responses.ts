import { db } from './db.ts'
import { moscowDay, periodStart, type MarketResponseReport } from '../shared/cabinet-dashboard.ts'

// Coverage starts when this database gains action tracking. Historical selection keys carry no dates.
export function initializeMarketResponses() {
  db.exec(`create table if not exists market_measurement (id integer primary key check(id=1), started_at integer not null);
    insert or ignore into market_measurement values(1,unixepoch('subsec')*1000);
    create table if not exists market_measured_offers (
      id text primary key references market_publications(submission_id) on delete cascade,
      first_live integer not null, last_live integer
    );
    insert or ignore into market_measured_offers
      select submission_id,max(published_at,started_at),null from market_publications,market_measurement
      where published_at is not null and (until_day='' or until_day>=date('now','+3 hours'));
    create table if not exists market_actions (
      submission_id text not null references market_measured_offers(id) on delete cascade,
      event_id text not null, kind text not null check(kind in ('open','reveal','site','route')),
      occurred_at integer not null, primary key(submission_id,event_id)
    ) without rowid;
    create index if not exists market_actions_period on market_actions(submission_id,occurred_at);
    create table if not exists market_impression_measurement (id integer primary key check(id=1), started_at integer not null);
    insert or ignore into market_impression_measurement values(1,unixepoch('subsec')*1000);
    create table if not exists market_exposures (
      submission_id text not null references market_measured_offers(id) on delete cascade,
      exposure_id text not null, placement text not null check(placement in ('market','landing')),
      seen_at integer not null, clicked integer not null check(clicked in (0,1)), primary key(submission_id,exposure_id)
    ) without rowid;
    create index if not exists market_exposures_period on market_exposures(submission_id,seen_at);`)
}

export function observePublication(id:string,live:boolean,now:number) {
  if (live) db.prepare('insert into market_measured_offers values(?,?,null) on conflict(id) do update set last_live=null').run(id,now)
  else db.prepare('update market_measured_offers set last_live=? where id=? and last_live is null').run(now,id)
}

export function marketResponseReport(email:string,days:number,now=Date.now()):MarketResponseReport {
  const since=Number(db.prepare('select started_at from market_measurement where id=1').get()!.started_at)
  const impressionSince=Number(db.prepare('select started_at from market_impression_measurement where id=1').get()!.started_at)
  const args={email,start:periodStart(days,now),now}
  const activity=`from campaign_owners o join market_actions a on a.submission_id=o.id
    where o.email=:email and a.occurred_at between :start and :now`
  const items=db.prepare(`with actions as (
      select a.submission_id, count(*) filter(where kind='open') opens, count(*) filter(where kind='reveal') reveals,
        count(*) filter(where kind='site') sites, count(*) filter(where kind='route') routes
      ${activity} group by a.submission_id
    ), exposures as (
      select e.submission_id, count(*) marketShows, sum(e.clicked) marketClicks
      from campaign_owners o join market_exposures e on o.id=e.submission_id
      where o.email=:email and e.placement='market' and seen_at between :start and :now group by e.submission_id
    )
    select s.id, coalesce(json_extract(s.data,'$.offer.title'),'') title, coalesce(json_extract(s.data,'$.offer.promo'),'') code,
      json_extract(s.data,'$.online') online, coalesce(opens,0) opens, coalesce(reveals,0) reveals, coalesce(sites,0) sites,
      coalesce(routes,0) routes, coalesce(marketShows,0) marketShows, coalesce(marketClicks,0) marketClicks,
      0 landingShows, 0 landingClicks
    from campaign_owners owner join v4_submissions s using(id) join market_measured_offers m using(id)
    join market_publications p on p.submission_id=s.id
    left join actions a on a.submission_id=s.id left join exposures e on e.submission_id=s.id
    where owner.email=:email and m.first_live<=:now and (a.submission_id is not null or e.submission_id is not null or (
      (m.last_live is null or m.last_live>=:start) and (p.until_day='' or p.until_day>=date(:start/1000,'unixepoch','+3 hours'))))
    order by opens desc, s.submitted_at desc, s.id`).all(args) as (Omit<MarketResponseReport['items'][number],'online'> & {online:number|null})[]
  const daily=db.prepare(`select cast((occurred_at+10800000)/86400000 as integer) day,
    count(*) filter(where kind='open') opens, count(*) filter(where kind in ('reveal','site','route')) clicks
    ${activity} group by day order by day`).all(args) as MarketResponseReport['daily']
  const hasCampaigns=!!db.prepare('select 1 from campaign_owners where email=? limit 1').get(email)
  return {since,impressionSince,today:moscowDay(now),hasCampaigns,daily,items:items.map(row=>({...row,online:!!row.online}))}
}
