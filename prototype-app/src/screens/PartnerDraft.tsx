import { designs, type MvpSession, type Promo } from '../../shared/mvp-promo'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { queryClient } from '../api'
import { setupSteps, type DraftSummary, type PartnerDraft, type SavedPartnerDraft } from '../../shared/partner-campaign-draft'
import { draftKey, mvpRequest, errorMessage, useMvpSession } from './MvpSession'

export function readDraft(session: MvpSession) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(draftKey(session)) ?? 'null')
    const legacy = JSON.parse(sessionStorage.getItem('mvp-me') ?? 'null')
    const sameCompany = legacy?.email?.toLowerCase() === session.email && legacy.inn === session.profile?.inn
    const promo = stored?.promo ?? (sameCompany && JSON.parse(sessionStorage.getItem('mvp-promo-draft') ?? 'null'))
    if (!promo || !['code','off','cond','site','till'].every(key => typeof promo[key] === 'string')) return null
    if (promo.addresses && (!Array.isArray(promo.addresses) || !promo.addresses.every((a: unknown) => typeof a === 'string'))) return null
    if (!stored?.attempted) {
      promo.design = 'plain'
      delete promo.fee
      delete promo.check
      delete promo.via
    } else {
      // A retry from an older tab must match the originally submitted design.
      promo.design ??= designs[0].file
    }
    if (promo.usePhoto === false) delete promo.photo
    delete promo.usePhoto
    return { key: stored?.key ?? crypto.randomUUID(), adReviewed: stored?.adReviewed ?? (stored?.attempted === true || stored?.step === 3), step: stored?.step===2||stored?.step===3 ? Number(stored.step):1, attempted: stored?.attempted === true, promo: { ...promo, addresses: promo.addresses ?? [''] } as Promo }
  } catch { return null }
}

const listKey=(email:string)=>['partner-drafts',email]
export const draftUrl=(id:string)=>'/app/campaigns/new?draft='+encodeURIComponent(id)
const backupKey=(email:string,id:string)=>'partner-draft/'+email+'/'+id

export function recoverDraft(email:string,id:string,remote:SavedPartnerDraft|null) {
  try {
    const backup=JSON.parse(sessionStorage.getItem(backupKey(email,id))??'null')
    if(backup && backup.version===(remote?.version??0)) return backup.data as PartnerDraft
  } catch { /* The server copy remains available. */ }
  return remote?.data
}

export function useDraftSave(email:string,id:string,data:PartnerDraft,initial:SavedPartnerDraft|null) {
  const [status,setStatus]=useState('Сохраняем…'),[conflict,setConflict]=useState(false)
  const store=useRef({version:initial?.version??0,saved:initial?JSON.stringify(initial.data):'',latest:JSON.stringify(data),lock:null as Promise<number>|null,conflict:false,done:false})
  const state=store.current
  const localKey=backupKey(email,id)
  function backup() {
    try {sessionStorage.setItem(localKey,JSON.stringify({version:state.version,data:JSON.parse(state.latest)}))} catch { /* Server autosave still works. */ }
  }
  function flush():Promise<number> {
    if(state.conflict)return Promise.reject(new Error('Откройте сохранённую версию.'))
    if(state.lock)return state.lock
    if(state.done || state.latest===state.saved){setStatus('Сохранено');return Promise.resolve(state.version)}
    setStatus('Сохраняем…')
    state.lock=(async()=>{
      try {
        while(!state.done && state.saved!==state.latest) {
          const snapshot=state.latest
          const next=JSON.parse(snapshot) as PartnerDraft
          const previous=state.saved && JSON.parse(state.saved) as PartnerDraft
          const file=next.contractInput?.attachment
          const keepAttachment=!!(file && previous && previous.contractInput?.attachment?.base64===file.base64 && previous.contractInput.attachment.name===file.name && previous.contractInput.attachment.type===file.type)
          if(keepAttachment)delete next.contractInput!.attachment
          const result=await mvpRequest<{version:number}>('/drafts/'+id,{version:state.version,data:next,keepAttachment},email)
          state.saved=snapshot;state.version=result.version
          if(state.latest!==snapshot)backup()
          else {try{sessionStorage.removeItem(localKey)} catch { /* Optional local recovery. */ }}
        }
        setStatus('Сохранено')
        void queryClient.invalidateQueries({queryKey:listKey(email)})
        return state.version
      } catch(e) {
        if((e as {status?:number}).status===409){state.conflict=true;setConflict(true)}
        setStatus(errorMessage(e));throw e
      } finally {state.lock=null}
    })()
    return state.lock
  }
  useLayoutEffect(()=>{
    state.latest=JSON.stringify(data)
    if(state.saved!==state.latest){backup();setStatus('Сохраняем…')}
    const timer=setTimeout(()=>{void flush().catch(()=>{})},300)
    return ()=>clearTimeout(timer)
  },[data])
  useEffect(()=>{
    const persist=()=>{if(!state.done && !state.conflict && state.saved!==state.latest)void flush().catch(()=>{})}
    const hide=()=>{if(document.visibilityState==='hidden')persist()}
    document.addEventListener('visibilitychange',hide)
    return ()=>{document.removeEventListener('visibilitychange',hide);persist()}
  },[id,email])
  return {status,conflict,flush,finish(){state.done=true;try{sessionStorage.removeItem(localKey)}catch{};void queryClient.invalidateQueries({queryKey:listKey(email)})},
    reload(){try{sessionStorage.removeItem(localKey)}catch{};location.reload()}}
}

export function usePartnerDrafts(enabled=true) {
  const session=useMvpSession(), email=session.email
  const drafts=useQuery({enabled,queryKey:listKey(email),queryFn:()=>mvpRequest<DraftSummary[]>('/drafts',undefined,email),staleTime:0,refetchInterval:15_000})

  const legacy=useMemo(()=>readDraft(session),[email,session.profile?.inn])
  const rows=[...(drafts.data??[])]
  if(legacy && !rows.some(r=>r.id===legacy.key))rows.push({id:legacy.key,step:[3,1,2][legacy.step-1]??1,code:legacy.promo.code,title:legacy.promo.cond,updatedAt:0})
  return {drafts,rows}
}

export function PartnerDrafts({drafts,rows}:ReturnType<typeof usePartnerDrafts>) {
  if(drafts.isPending)return <p role="status">Загружаем черновики…</p>
  if(drafts.isError)return <p role="alert">Не удалось открыть черновики. <button className="bl-btn" onClick={()=>void drafts.refetch()}>Повторить</button></p>
  if(!rows.length)return null
  return <section className="crm-card partner-drafts"><h2>черновики</h2>{rows.map(d=><article key={d.id}>
    <div><strong>{d.title||d.code||'Промокод на покупку'}</strong><p>{d.code} · {setupSteps[d.step-1]} · {!d.updatedAt?'из этой вкладки':new Date(d.updatedAt).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</p></div>
    <Link className="bl-btn" to={draftUrl(d.id)} aria-label={'Продолжить черновик '+(d.code||d.title)}>Продолжить</Link>
  </article>)}</section>
}
