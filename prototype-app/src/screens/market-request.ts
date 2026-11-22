import { mockMarketRequest, partnerDemo } from './mvp-demo'

const base = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/,'') + '/market'
export async function marketRequest<T>(path:string,signal:AbortSignal,body?:object):Promise<T> {
  if (partnerDemo) return mockMarketRequest(path,body) as T
  const res = await fetch(base+path,{credentials:'omit',cache:'no-store',signal,...(body && {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})})
  if (!res.ok) throw new Error(res.status===404 ? 'Предложение больше недоступно' : 'Не удалось загрузить предложения. Попробуйте ещё раз.')
  return res.json()
}
