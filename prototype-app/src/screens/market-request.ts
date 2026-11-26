import type { MarketAction } from '../../shared/cabinet-dashboard'
import { mockMarketRequest, partnerDemo } from './mvp-demo'

const base = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/,'') + '/market'

// Both measurement endpoints deduplicate the original payload if the acknowledgement was lost.
async function sendMeasurement(send:()=>Promise<Response>) {
  try {
    const response=await send()
    if(response.status<500)return response
  } catch(error) {
    if(!(error instanceof TypeError))throw error
  }
  await new Promise(resolve=>setTimeout(resolve,350))
  return send()
}

export async function marketRequest<T>(path:string,signal?:AbortSignal,body?:object):Promise<T> {
  if (partnerDemo) return mockMarketRequest(path,body) as T
  const measurement=!!body && (path.endsWith('/actions') || path.endsWith('/exposure'))
  const send=()=>fetch(base+path,{credentials:'omit',cache:'no-store',signal,...(body && {method:'POST',keepalive:measurement,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})})
  const res=measurement ? await sendMeasurement(send) : await send()
  if (!res.ok) throw new Error(res.status===404 ? 'Предложение больше недоступно' : 'Не удалось загрузить предложения. Попробуйте ещё раз.')
  return res.json()
}

// A per-offer key deduplicates retries without linking activity across different offers.
export async function selectMarketOffer(id:string) {
  const key = 'market-selection/'+id
  function selectionKey() {
    const saved = localStorage.getItem(key)
    if (saved) return saved
    const value = crypto.randomUUID()
    localStorage.setItem(key,value)
    return value
  }
  const value = navigator.locks ? await navigator.locks.request(key,selectionKey) : selectionKey()
  return marketRequest<{selectionCount:number}>('/offers/'+encodeURIComponent(id)+'/selection',undefined,{selectionKey:value})
}


export async function recordMarketAction(id:string,kind:MarketAction) {
  try {
    await marketRequest('/offers/'+encodeURIComponent(id)+'/actions',undefined,{eventId:crypto.randomUUID(),kind})
  } catch { /* The public offer remains usable when measurement is unavailable. */ }
}
