import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { marketRequest } from './market-request'

type Exposure = {id:string; seen:boolean; clicked:boolean}
const Placement = createContext<((offerId:string)=>Exposure)|null>(null)
const marketFragment = /^#market-view=([\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12})$/i

function postExposure(offerId:string,exposureId:string,clicked:boolean) {
  return marketRequest('/offers/'+encodeURIComponent(offerId)+'/exposure',undefined,{exposureId,placement:'market',clicked})
}

// A browser can follow a card link in a new tab without firing click on the catalogue.
export function useMarketReferral(offerId:string) {
  const {hash,pathname,search,state}=useLocation()
  const navigate=useNavigate()
  useEffect(()=>{
    const exposureId=marketFragment.exec(hash)?.[1]
    if(!exposureId)return
    const source=document.referrer && new URL(document.referrer)
    if(!state?.fromCatalog && source && source.origin===location.origin && /^\/market\/?$/.test(source.pathname)){
      void postExposure(offerId,exposureId,true).catch(()=>{})
    }
    void navigate({pathname,search},{replace:true,state,preventScrollReset:true})
  },[hash,offerId,pathname,search,state,navigate])
}

function record(offerId:string,exposure:Exposure,clicked:boolean) {
  if(document.visibilityState!=='visible' || exposure.clicked || (!clicked && exposure.seen))return
  const flag=clicked?'clicked':'seen'
  exposure[flag]=true
  void postExposure(offerId,exposure.id,clicked).catch(()=>{exposure[flag]=false})
}

export function OfferExposureScope({children}:{children:ReactNode}) {
  // The map belongs to one visit to this placement. A filter or a feed refresh can remount a card.
  const [forOffer]=useState(()=> {
    const exposures=new Map<string,Exposure>()
    return (offerId:string)=>{
      let exposure=exposures.get(offerId)
      if(!exposure){
        exposure={id:crypto.randomUUID(),seen:false,clicked:false}
        exposures.set(offerId,exposure)
      }
      return exposure
    }
  })
  return <Placement.Provider value={forOffer}>{children}</Placement.Provider>
}

export function useOfferExposure(offerId:string,enabled:boolean) {
  const ref=useRef<HTMLElement>(null)
  const forOffer=useContext(Placement)
  const exposure=enabled && typeof crypto.randomUUID==='function' ? forOffer?.(offerId) : undefined
  useEffect(()=>{
    const element=ref.current
    if(!exposure || !element || !window.IntersectionObserver)return
    const entrance=element.parentElement?.getAnimations?.().find(animation=>
      'animationName' in animation && animation.animationName==='market-card-in' && animation.playState!=='finished')
    let ready=!entrance, disposed=false
    let timer:ReturnType<typeof setTimeout>|undefined
    const stop=()=>{clearTimeout(timer);timer=undefined}
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries) {
        stop()
        if(entry.isIntersecting && entry.intersectionRatio>=0.5 && document.visibilityState==='visible'){
          timer=setTimeout(()=>{
            record(offerId,exposure,false)
          },1000)
        }
      }
    },{threshold:[0,0.5]})
    function visibility() {
      stop()
      observer.disconnect()
      if(ready && document.visibilityState==='visible')observer.observe(element!)
    }
    // Search results enter with a staggered fade; their layout can intersect before they are shown.
    if(entrance){
      const start=()=>{if(!disposed){ready=true;visibility()}}
      void entrance.finished.then(start,start)
    }
    visibility()
    document.addEventListener('visibilitychange',visibility)
    return ()=>{disposed=true;stop();observer.disconnect();document.removeEventListener('visibilitychange',visibility)}
  },[exposure,offerId])
  return {ref,fragment:exposure?'#market-view='+exposure.id:'',click:()=>{if(exposure)record(offerId,exposure,true)}}
}
