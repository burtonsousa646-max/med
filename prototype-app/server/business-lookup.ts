import { Hono } from 'hono'
import { innError, type BusinessProfile } from '../shared/campaign-business.ts'

const categories: Record<string, string> = { '56': 'кафе и рестораны', '45': 'автосервис и автомобили', '47': 'розничная торговля', '85': 'обучение', '86': 'здоровье', '93': 'спорт и отдых', '96': 'услуги для себя' }
export function createBusinessLookup({ token = () => process.env.DADATA_API_KEY, request = fetch }: { token?: () => string | undefined; request?: typeof fetch } = {}) {
  const router = new Hono()
  let recent: number[] = []
  router.post('/lookup', async c => {
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
        body: JSON.stringify({ query: inn, branch_type: 'MAIN', count: 1 }), signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) return c.json({ message: 'Не удалось загрузить бизнес. Повторите поиск или заполните данные вручную.' }, 502)
      const result = await response.json()
      if (!Array.isArray(result.suggestions)) throw new Error('Invalid provider response')
      const item = result.suggestions[0]?.data
      if (!item) return c.json({ message: 'Бизнес с таким ИНН не найден. Проверьте номер или заполните данные вручную.' }, 404)
      if (item.inn !== inn || typeof item.name?.short_with_opf !== 'string') throw new Error('Mismatched company')
      if (item.state?.status !== 'ACTIVE') return c.json({ message: 'Статус бизнеса требует проверки. Укажите действующий ИНН.' }, 409)
      const addr = item.address?.data
      const text = (value: unknown) => typeof value === 'string' ? value : ''
      const profile: BusinessProfile = {
        inn, name: item.name.short_with_opf.slice(0,80), category: categories[text(item.okved).slice(0,2)] || '',
        city: text(addr?.city || addr?.settlement || addr?.region).slice(0,80),
        registeredAddress: text(item.address?.value).slice(0,200), source: 'dadata',
      }
      return c.json({ profile })
    } catch {
      return c.json({ message: 'Поиск не ответил вовремя. Повторите попытку или заполните данные вручную.' }, 502)
    }
  })
  return router
}
