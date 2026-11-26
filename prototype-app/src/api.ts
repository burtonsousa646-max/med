// Единственная точка связи интерфейса с бэкендом. Типы — из api/openapi.yaml (npm run api:types).
// Подменить тестовый сервер на настоящий: VITE_API_URL=https://… npm run build
import { useEffect, useRef, useState } from 'react'
import createFetchClient from 'openapi-fetch'
import createClient from 'openapi-react-query'
import { QueryClient } from '@tanstack/react-query'
import type { components, paths } from './api.gen'
import type { CampaignDraft } from '../shared/campaign-draft'
import type { OfferAiInput, OfferAiResponse } from '../shared/offer-ai'
import type { OfferImageInput } from '../shared/offer-image'
import { toast } from './ui'

export type S = components['schemas']
export type Campaign = S['Campaign']

export const client = createFetchClient<paths>({ baseUrl: import.meta.env.VITE_API_URL ?? '/api', credentials: 'include' })
export async function autocompleteInn(inn: string, signal: AbortSignal) {
  const { data, error, response } = await client.POST('/autocomplete/inn', { body: { inn }, signal })
  if (!data || data.profile.inn !== inn) throw Object.assign(new Error(error?.message || 'Не удалось найти бизнес. Попробуйте ещё раз'), {status:response.status})
  return data.profile
}

export async function fetchCampaignSiteProfile(website: string, signal: AbortSignal) {
  return (await readSiteInfo(website,signal,{profileOnly:true})).profile
}
export async function readSiteInfo(website:string, signal:AbortSignal, mode:{brandOnly:true}|{profileOnly:true}){
  const { data, error } = await client.POST('/v4/site-assets', { body: { website, ...mode }, signal })
    .catch(() => { throw new Error('Сервис импорта не ответил. Попробуйте ещё раз или вставьте текст предложения.') })
  if (!data?.profile) throw new Error(error?.message || 'Не удалось прочитать страницу. Проверьте ссылку или вставьте текст предложения.')
  return data
}

export async function fetchCampaignSiteAssets(website: string, signal: AbortSignal) {
  const { data, error } = await client.POST('/v4/site-assets', { body: { website }, signal })
  if (!data) throw new Error(error?.message || 'Не удалось получить изображения с сайта')
  return data.assets
}

export async function requestOfferCutout(image: Blob, signal: AbortSignal) {
  const base = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')
  const response = await fetch(base + '/v4/offer-cutout', {
    method: 'POST', body: image, headers: { 'Content-Type': 'image/png' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  })
  if (!response.ok) throw new Error('Cutout unavailable')
  return response.blob()
}

let offerConversation: string | undefined
export async function requestOfferAi(input: OfferAiInput, signal: AbortSignal): Promise<OfferAiResponse> {
  const { background: _background, ...offer } = input.offer as CampaignDraft['offer']
  const { data } = await client.POST('/v4/offer-ai', {
    headers: { 'X-Offer-Session': offerConversation ??= crypto.randomUUID?.() },
    body: { ...input, offer }, signal: AbortSignal.any([signal, AbortSignal.timeout(28_000)]),
  })
  if (!data) throw new Error('Offer assistant unavailable')
  return data
}

export async function requestOfferImage(input: OfferImageInput, reference: File | null, signal: AbortSignal) {
  const form = new FormData()
  form.set('input', JSON.stringify(input))
  if (reference) {
    const image = await createImageBitmap(reference)
    try {
      const scale = Math.min(1, 1024 / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Не удалось подготовить исходное фото')
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Не удалось подготовить исходное фото')), 'image/png'))
      form.set('image', png, 'reference.png')
    } finally { image.close() }
  }
  signal.throwIfAborted()
  const base = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')
  const response = await fetch(base + '/v4/offer-image', { method: 'POST', body: form, signal: AbortSignal.any([signal, AbortSignal.timeout(125_000)]) })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(typeof error?.message === 'string' ? error.message : 'Не удалось создать креатив. Попробуйте ещё раз')
  }
  const blob = await response.blob()
  if (blob.type !== 'image/png' || blob.size > 5 * 1024 * 1024) throw new Error('Получено неподходящее изображение. Попробуйте ещё раз')
  const bitmap = await createImageBitmap(blob)
  try {
    if (bitmap.width < 128 || bitmap.height < 128 || bitmap.width > 2048 || bitmap.height > 2048) throw new Error('Получено неподходящее изображение. Попробуйте ещё раз')
  } finally { bitmap.close() }
  return { file: new File([blob], `креатив-${input.variant + 1}.png`, { type: 'image/png' }), demo: response.headers.get('X-Offer-Image-Source') === 'demo' }
}

export async function sendCampaignEmailCode(key: string, email: string) {
  const { data, error } = await client.POST('/v4/draft/email', {
    params: { header: { 'X-Draft-Key': key } }, body: { email }, signal: AbortSignal.timeout(60_000),
  })
  if (data?.status !== 'sent') throw new Error(error?.message || 'Не удалось отправить письмо. Попробуйте ещё раз')
}

export async function sendCampaignDraft(method: 'put' | 'post', key: string, revision: number, value: CampaignDraft, options: { signal?: AbortSignal; emailCode?: string } = {}) {
  const { offerImage, logoImage, partnerDetails, ...fields } = value
  const timeout = AbortSignal.timeout(60_000)
  const { signal, emailCode } = options
  const { data, error, response } = await client.request(method, '/v4/draft', {
    params: { header: { 'X-Draft-Key': key, 'X-Draft-Revision': revision } },
    body: { draft: JSON.stringify({ ...fields, partnerDetails: method === 'post' ? partnerDetails : undefined }), emailCode },
    bodySerializer: ({ draft, emailCode }) => {
      const form = new FormData()
      form.append('draft', draft)
      if (emailCode) form.append('emailCode', emailCode)
      if (offerImage) form.append('offerImage', offerImage)
      if (logoImage) form.append('logoImage', logoImage)
      return form
    },
    signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
  })
  if (!response.ok || data?.status !== (method === 'post' ? 'accepted' : 'saved')) throw new Error(error?.message || 'Не удалось сохранить заявку. Попробуйте ещё раз')
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
