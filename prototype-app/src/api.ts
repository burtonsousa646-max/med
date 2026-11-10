// Единственная точка связи интерфейса с бэкендом. Типы — из api/openapi.yaml (npm run api:types).
// Подменить тестовый сервер на настоящий: VITE_API_URL=https://… npm run build
import { useEffect, useRef, useState } from 'react'
import createFetchClient from 'openapi-fetch'
import createClient from 'openapi-react-query'
import { QueryClient } from '@tanstack/react-query'
import type { components, paths } from './api.gen'
import type { CampaignDraft } from '../shared/campaign-draft'
import { toast } from './ui'

export type S = components['schemas']
export type Campaign = S['Campaign']

export const client = createFetchClient<paths>({ baseUrl: import.meta.env.VITE_API_URL ?? '/api', credentials: 'include' })
export async function autocompleteInn(inn: string, signal: AbortSignal) {
  const { data, error } = await client.POST('/autocomplete/inn', { body: { inn }, signal })
  if (!data || data.profile.inn !== inn) throw new Error(error?.message || 'Не удалось найти бизнес. Попробуйте ещё раз')
  return data.profile
}

export async function sendCampaignDraft(method: 'put' | 'post', key: string, revision: number, value: CampaignDraft, signal?: AbortSignal) {
  const { offerImage, logoImage, ...fields } = value
  const timeout = AbortSignal.timeout(60_000)
  const { data, response } = await client.request(method, '/v4/draft', {
    params: { header: { 'X-Draft-Key': key, 'X-Draft-Revision': revision } },
    body: { draft: JSON.stringify(fields) },
    bodySerializer: ({ draft }) => {
      const form = new FormData()
      form.append('draft', draft)
      if (offerImage) form.append('offerImage', offerImage)
      if (logoImage) form.append('logoImage', logoImage)
      return form
    },
    signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
  })
  if (!response.ok || data?.status !== (method === 'post' ? 'accepted' : 'saved')) throw new Error('Campaign save failed')
}

export const $api = createClient(client)
export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } })

// Любое действие меняет данные на сервере: перечитываем всё, что на экране, ошибку показываем тостом
export const act = {
  onSuccess: () => queryClient.invalidateQueries(),
  onError: (e: unknown) => { toast((e as S['Error'] | undefined)?.message ?? 'не получилось, попробуйте ещё раз') },
}

/* ───────── чтение. Suspense: данные всегда есть, загрузку показывает граница в main.tsx ───────── */
export const useCatalog = () => $api.useSuspenseQuery('get', '/catalog', {}, { staleTime: Infinity }).data
export const useSession = () => $api.useSuspenseQuery('get', '/session').data
export const useCompany = () => $api.useSuspenseQuery('get', '/company').data
export const useCampaigns = () => $api.useSuspenseQuery('get', '/campaigns').data
export const useBalance = () => $api.useSuspenseQuery('get', '/balance').data
export const useCampaign = (id: number) => $api.useSuspenseQuery('get', '/campaigns/{id}', { params: { path: { id } } }, {
  // пока идёт проверка и маркировка, сервер двигает шаги — опрашиваем
  refetchInterval: q => (q.state.data?.status === 'moderation' ? 700 : false),
}).data

export function useOfferType(type: S['OfferType']) {
  return useCatalog().offerTypes.find(t => t.id === type)!
}

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
