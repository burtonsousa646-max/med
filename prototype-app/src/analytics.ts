const values = {
  step: ['business', 'details', 'offer', 'audience', 'success'],
  target_step: ['business', 'details', 'offer', 'audience', 'success'],
  source: ['hero', 'header', 'how', 'where', 'final', 'direct', 'back', 'progress', 'success', 'footer'],
  section: ['hero', 'metrics', 'how', 'where', 'final'],
  target: ['how', 'where', 'login', 'offer_document', 'privacy_document', 'landing'],
  method: ['lookup', 'manual', 'first', 'rebuild', 'automatic', 'skip', 'text', 'example', 'voice'],
  field: ['inn', 'phone', 'name', 'category', 'city', 'website', 'address', 'title', 'promo', 'discount', 'until', 'image', 'logo', 'wishes', 'unknown'],
  tone: ['red', 'green', 'blue', 'violet', 'magenta', 'teal', 'dark', 'light'],
  reason: ['required', 'format', 'range', 'length', 'invalid', 'type', 'size', 'decode', 'unsupported', 'recognition', 'storage'],
  result: ['success', 'error', 'empty'],
  action: ['add', 'remove', 'change', 'open', 'close'],
  generation: ['first', 'rebuild'],
  group: ['geography', 'gender', 'age', 'income', 'moment'],
  placement: ['main', 'showcase', 'paid', 'rest'],
} as const
type Choice = { [K in keyof typeof values]?: typeof values[K][number] }
export type EventParams = Choice & {
  duration_ms?: number; address_count?: number; error_count?: number; choice?: number;
  online?: boolean; resumed?: boolean; has_image?: boolean; has_logo?: boolean; has_promo?: boolean; has_discount?: boolean; has_wishes?: boolean;
}

export const goals = [
  'v4_landing_view', 'v4_business_view', 'v4_details_view', 'v4_offer_view', 'v4_audience_view', 'v4_success_view',
  'v4_login_view', 'v4_document_view', 'v4_section_view', 'v4_cta_click', 'v4_navigation_click', 'v4_placement_select',
  'v4_flow_start', 'v4_field_error', 'v4_lookup_start', 'v4_lookup_result', 'v4_lookup_cancel', 'v4_identify_complete',
  'v4_company_change', 'v4_address_change', 'v4_business_mode', 'v4_business_complete',
  'v4_generation_start', 'v4_generation_complete', 'v4_generation_leave', 'v4_offer_edit', 'v4_offer_field_change',
  'v4_upload_result', 'v4_assistant_request', 'v4_assistant_result', 'v4_assistant_undo', 'v4_voice_start', 'v4_voice_result',
  'v4_offer_complete', 'v4_audience_select', 'v4_wishes_change', 'v4_save_start', 'v4_save_result', 'v4_setup_complete',
  'v4_draft_restore', 'v4_draft_error', 'v4_step_leave', 'v4_step_back', 'v4_route_blocked', 'v4_flow_exit',
] as const
export type Goal = typeof goals[number]

export const pages = {
  '/v4': ['v4_landing_view', 'Партнёрская платформа'],
  '/v4/create/business': ['v4_business_view', 'Информация о компании'],
  '/v4/create/details': ['v4_details_view', 'Данные компании'],
  '/v4/create/offer': ['v4_offer_view', 'Дизайн оффера'],
  '/v4/create/audience': ['v4_audience_view', 'Выбор клиентов'],
  '/v4/create/success': ['v4_success_view', 'Настройка завершена'],
  '/login': ['v4_login_view', 'Вход'],
  '/v4/offer': ['v4_document_view', 'Оферта'],
  '/v4/privacy': ['v4_document_view', 'Обработка данных'],
} as const
export type AnalyticsPage = keyof typeof pages

// Only fixed labels, flags and bounded counts may leave the application.
export function safeParams(input: EventParams) {
  const output: Record<string, string | number | boolean> = { product: 'campaign_v4', schema: 1 }
  for (const [key, value] of Object.entries(input)) {
    if (Object.hasOwn(values, key) && (values[key as keyof typeof values] as readonly unknown[]).includes(value)) output[key] = value
    else if (['online', 'resumed', 'has_image', 'has_logo', 'has_promo', 'has_discount', 'has_wishes'].includes(key) && typeof value === 'boolean') output[key] = value
    else if (['duration_ms', 'address_count', 'error_count', 'choice'].includes(key) && typeof value === 'number' && Number.isFinite(value)) {
      const max = key === 'duration_ms' ? 86400000 : key === 'choice' ? 2 : 100
      output[key] = Math.min(max, Math.max(0, Math.round(value)))
    }
  }
  return output
}

type Delivery = (method: 'hit' | 'reachGoal', target: string, params: Record<string, unknown>) => void
export function createFunnelTracker(deliver: Delivery, now = Date.now) {
  let previous: AnalyticsPage | null = null
  let enteredAt = now()
  const pending: [Goal, EventParams][] = []
  const event = (goal: Goal, params: EventParams = {}) => {
    if (!goals.includes(goal)) return
    if (!previous) { pending.push([goal, params]); return }
    const step = previous.startsWith('/v4/create/') ? previous.split('/').at(-1) as EventParams['step'] : undefined
    try { deliver('reachGoal', goal, safeParams({ step, ...params })) } catch { /* Analytics must never block setup. */ }
  }
  return {
    event,
    view(page: AnalyticsPage | null, params: EventParams = {}) {
      if (page === previous) return false
      if (previous?.startsWith('/v4/create/')) event('v4_step_leave', { step: previous.split('/').at(-1) as EventParams['step'], duration_ms: now() - enteredAt })
      const referer = previous ? `/#${previous}` : ''
      previous = page
      enteredAt = now()
      if (!page) return false
      try { deliver('hit', `/#${page}`, { title: pages[page][1], referer }) } catch { /* No dependency on the tracker. */ }
      event(pages[page][0], params)
      for (const [goal, detail] of pending.splice(0)) event(goal, detail)
      return true
    },
  }
}

type Ym = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number }
let initialized = false
const config = import.meta.env ?? {}
const counter = Number(config.VITE_METRIKA_ID)
export function acquisitionTags(search: string) {
  const query = new URLSearchParams(search)
  const safe = new URLSearchParams()
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid']) {
    const value = query.get(key)
    if (value && /^[\p{L}\p{N}_.~-]{1,100}$/u.test(value)) safe.set(key, value)
  }
  return safe.size ? '?' + safe.toString() : ''
}
export const analytics = createFunnelTracker((method, target, params) => {
  if (config.VITE_METRIKA_DEBUG === 'true') console.info('[metrika] ' + JSON.stringify({ method, target, params }))
  if (!Number.isSafeInteger(counter) || counter <= 0 || typeof window === 'undefined') return
  if (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) || window.location.hostname.endsWith('.localhost')) return
  const browser = window as Window & { ym?: Ym }
  if (!browser.ym) {
    const queue: Ym = (...args) => { (queue.a ??= []).push(args) }
    queue.l = Date.now()
    browser.ym = queue
  }
  if (!initialized) {
    initialized = true
    browser.ym(counter, 'init', { defer: true, trackHash: false, clickmap: false, trackLinks: false, webvisor: false, sendTitle: false, accurateTrackBounce: true })
    const script = document.createElement('script')
    script.async = true
    script.src = 'https://mc.yandex.ru/metrika/tag.js'
    document.head.append(script)
  }
  let referrer = ''
  try { if (document.referrer) referrer = new URL(document.referrer).origin + '/' } catch { /* No usable referrer. */ }
  // Keep only campaign tags; never forward form or router query parameters.
  const url = window.location.origin + '/' + acquisitionTags(window.location.search) + target.slice(1)
  browser.ym(counter, method, method === 'hit' ? url : target,
    method === 'hit' ? { ...params, referer: params.referer ? window.location.origin + params.referer : referrer } : params)
})
