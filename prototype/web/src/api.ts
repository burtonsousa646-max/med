// Единственная точка связи интерфейса с сервером. Типы — из api/cabinet.yaml (npm run api:types).
import { useEffect, useRef, useState } from 'react'
import createFetchClient from 'openapi-fetch'
import createClient from 'openapi-react-query'
import { QueryClient } from '@tanstack/react-query'
import type { components, paths } from './api.gen'
import { toast } from './ui'

export type S = components['schemas']
export type Campaign = S['Campaign']
export type OfferType = S['OfferType']

export const client = createFetchClient<paths>({ baseUrl: import.meta.env.VITE_API_URL ?? '/api', credentials: 'include' })
export const $api = createClient(client)
export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: (n, e) => n < 1 && (e as { status?: number })?.status !== 401 } } })

// Любое действие меняет данные на сервере: перечитываем всё, что на экране, ошибку показываем тостом
export const act = {
  onSuccess: () => queryClient.invalidateQueries(),
  onError: (e: unknown) => { toast((e as S['Error'] | undefined)?.message ?? 'не получилось, попробуйте ещё раз') },
}

/* ───────── чтение. Suspense: данные всегда есть, загрузку показывает граница в main.tsx ───────── */
export const useCatalog = () => $api.useSuspenseQuery('get', '/cabinet/catalog', {}, { staleTime: Infinity }).data
export const useMe = () => $api.useSuspenseQuery('get', '/auth/me').data
export const useCompany = () => $api.useSuspenseQuery('get', '/cabinet/company').data
export const useCampaigns = () => $api.useSuspenseQuery('get', '/cabinet/campaigns').data
export const useBalance = () => $api.useSuspenseQuery('get', '/cabinet/balance').data
export const useDocuments = () => $api.useSuspenseQuery('get', '/cabinet/documents').data
export const useCampaign = (id: number) => $api.useSuspenseQuery('get', '/cabinet/campaigns/{id}', { params: { path: { id } } }, {
  // пока идёт проверка, маркировка или ждём оплату — опрашиваем: статус двигает сервер
  refetchInterval: q => (['moderation', 'invoice'].includes(q.state.data?.status ?? '') ? 1500 : false),
}).data

export function useOfferType(type: OfferType) {
  return useCatalog().offerTypes.find(t => t.id === type)!
}

/** Вошедший партнёр и его роль в выбранной компании. */
export function useMember() {
  const me = useMe()
  if (me.kind !== 'partner') return null
  return me.companies.find(c => c.id === me.companyId) ?? null
}

/* ───────── деньги: на сервере копейки строкой ───────── */
export const kop = (v: string | number | null | undefined) => Number(v ?? 0) / 100
export const toKop = (rub: number) => String(Math.round(rub * 100))

/* ───────── правка с задержкой: ползунки и поля ввода не шлют запрос на каждый символ ───────── */
export function useLater<T>(server: T, save: (v: T) => void, ms = 400) {
  const [v, setV] = useState(server)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const edited = useRef(0)
  const pending = useRef<{ v: T } | null>(null)
  const flush = () => { clearTimeout(timer.current); if (pending.current) save(pending.current.v); pending.current = null }
  // ответ сервера не перетирает то, что человек печатает прямо сейчас
  useEffect(() => { if (Date.now() - edited.current > 1500) setV(server) }, [server])
  useEffect(() => flush, []) // ушли с экрана раньше задержки — всё равно сохраняем
  return [v, (x: T) => { setV(x); edited.current = Date.now(); pending.current = { v: x }; clearTimeout(timer.current); timer.current = setTimeout(flush, ms) }] as const
}

/** Ключ идемпотентности на одно нажатие: повторный клик по той же кнопке не создаст второй платёж. */
export const newKey = () => crypto.randomUUID()
