import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { serve } from '@hono/node-server'
import { fileURLToPath } from 'node:url'
import { innError, normalizeBusinessWebsite, type BusinessProfile } from '../shared/campaign-business.ts'

// shortcut: common sectors when DaData omits the name; use a full classifier if coverage needs to grow.
const categories: Record<string, string> = {
  '45': 'автобизнес', '46': 'оптовая торговля', '47': 'розничная торговля',
  '55': 'гостиницы и размещение', '56': 'кафе и рестораны', '62': 'разработка и ИТ',
  '63': 'информационные услуги', '64': 'финансовые услуги', '68': 'недвижимость',
  '69': 'юридические и бухгалтерские услуги', '73': 'реклама и маркетинг', '74.20': 'фотоуслуги',
  '79': 'туризм', '81.2': 'уборка и клининг', '85': 'обучение', '86': 'медицина',
  '93.1': 'спорт и фитнес', '93.2': 'развлечения и отдых', '95': 'ремонт техники',
  '96.02': 'парикмахерские и салоны красоты',
}

export function createAutocomplete({ token = () => process.env.DADATA_API_KEY, request = fetch }: { token?: () => string | undefined; request?: typeof fetch } = {}) {
  const router = new Hono().basePath('/api')
  router.get('/health', c => c.json({ status: 'ok' }))
  let recent: number[] = []
  const lookup = async (c: Context) => {
    c.header('Cache-Control', 'no-store')
    let input: unknown
    try { input = await c.req.json() } catch { return c.json({ message: 'Не удалось прочитать ИНН.' }, 400) }
    const inn = typeof input === 'object' && input !== null && 'inn' in input && typeof input.inn === 'string' ? input.inn : ''
    if (innError(inn)) return c.json({ message: innError(inn) }, 400)
    const key = token()
    if (!key) return c.json({ message: 'Поиск сейчас недоступен. Попробуйте позже или заполните данные вручную.' }, 503)
    recent = recent.filter(at => Date.now() - at < 60_000)
    if (recent.length >= 30) return c.json({ message: 'Слишком много запросов. Попробуйте через минуту.' }, 429)
    recent.push(Date.now())
    try {
      // Only the INN goes to the provider. The contact phone never leaves this form.
      const response = await request('https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Token ${key}` },
        body: JSON.stringify({ query: inn, ...(inn.length === 10 ? { branch_type: 'MAIN' } : { type: 'INDIVIDUAL' }), count: 1 }),
        signal: AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(8000)]), redirect: 'error',
      })
      if (!response.ok) return c.json({ message: 'Не удалось загрузить бизнес. Повторите поиск или заполните данные вручную.' }, 502)
      const result = await response.json()
      if (!Array.isArray(result.suggestions)) throw new Error('Invalid provider response')
      const suggestion = result.suggestions[0]
      const item = suggestion?.data
      if (!item) return c.json({ message: 'Бизнес с таким ИНН не найден. Проверьте номер или заполните данные вручную.' }, 404)
      const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
      const name = text(item.name?.short_with_opf) || text(suggestion.value) || text(item.name?.full_with_opf)
      if (item.inn !== inn || !name) throw new Error('Mismatched company')
      if (item.state?.status !== 'ACTIVE') return c.json({ message: 'Статус бизнеса требует проверки. Укажите действующий ИНН.' }, 409)
      const addr = item.address?.data
      const okved = text(item.okved)
      const mainActivity = Array.isArray(item.okveds) ? item.okveds.find((activity: { main?: unknown; code?: unknown; name?: unknown } | null) => activity?.main === true && (!okved || activity.code === okved)) : undefined
      const code = okved || text(mainActivity?.code)
      const group = code.split('.').slice(0, 2).join('.')
      const category = text(mainActivity?.name) || categories[group] || categories[group.slice(0, 4)] || categories[code.slice(0, 2)] || ''
      const website = Array.isArray(item.sites)
        ? item.sites.map((site: { data?: { domain?: unknown } } | null) => normalizeBusinessWebsite(text(site?.data?.domain))).find(Boolean) : undefined
      const profile: BusinessProfile = {
        inn, name: name.slice(0,80), category: category.slice(0,100), ...(website && { website }),
        city: (text(addr?.city) || text(addr?.settlement) || text(addr?.region)).slice(0,80),
        registeredAddress: text(item.address?.value).slice(0,200), source: 'dadata',
      }
      return c.json({ profile })
    } catch {
      return c.json({ message: 'Поиск не ответил вовремя. Повторите попытку или заполните данные вручную.' }, 502)
    }
  }
  const limit = bodyLimit({ maxSize: 1024, onError: c => c.json({ message: 'Слишком большой запрос' }, 413) })
  router.post('/autocomplete/inn', limit, lookup)
  router.post('/business/lookup', limit, lookup)
  return router
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.AUTOCOMPLETE_PORT ?? 8788)
  const hostname = process.env.AUTOCOMPLETE_HOST ?? '127.0.0.1'
  serve({ fetch: createAutocomplete().fetch, port, hostname }, () => console.log(`Autocomplete: http://${hostname}:${port}/api`))
}
