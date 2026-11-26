import { useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { queryClient } from '../api'
import type { components } from '../api.gen'
import { campaignLabels } from '../../shared/cabinet-dashboard'
import { mvpRequest } from './MvpSession'

export type Notifications = components['schemas']['CampaignNotifications']
export function useCampaignNotifications(email:string,enabled:boolean) {
  const result=useInfiniteQuery({
    queryKey:['campaign-notifications',email],enabled,retry:false,initialPageParam:0,refetchInterval:5000,
    queryFn:({pageParam,signal})=>mvpRequest<Notifications>('/notifications?before='+pageParam,undefined,email,undefined,signal),
    getNextPageParam:page=>page.more ? page.items.at(-1)?.eventId : undefined,
  })
  const latest=result.data?.pages[0]?.items[0]?.eventId ?? 0
  const previous=useRef<number|null>(null)
  useEffect(()=>{
    if(!result.isSuccess)return
    if(previous.current!==null && latest>previous.current){
      for(const key of ['mvp-receipt','mvp-campaigns'])void queryClient.invalidateQueries({queryKey:[key,email]})
    }
    previous.current=latest
  },[latest,email,result.isSuccess])
  return result
}

export function CampaignNotifications({feed}:{feed:ReturnType<typeof useCampaignNotifications>}) {
  if(feed.isError)return <p role="alert">Не удалось загрузить уведомления. <button className="bl-btn" onClick={()=>void feed.refetch()}>Повторить</button></p>
  if(feed.isPending)return <p role="status">Загружаем уведомления…</p>
  const items=feed.data.pages.flatMap(p=>p.items)
  if(!items.length)return null
  return <section aria-label="Изменения статусов"><h3>Изменения статусов</h3>
    <ol className="crm-events cb-notifications">{items.map(item=><li key={item.eventId}><div><Link to={'/app/campaigns/'+item.id}>{item.title}</Link>
      <strong>{campaignLabels[item.fromStage]} → {campaignLabels[item.toStage]}</strong>
      <small>{new Date(item.createdAt).toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Moscow'})} МСК</small></div></li>)}</ol>
    {['http://localhost:5184','http://127.0.0.1:5184'].includes(location.origin) && <p><a href="/api/local-status-mail" target="_blank" rel="noreferrer">Открыть тестовую почту со статусами</a></p>}
    {feed.hasNextPage && <button className="bl-btn" disabled={feed.isFetchingNextPage} onClick={()=>void feed.fetchNextPage()}>Предыдущие уведомления</button>}
  </section>
}
