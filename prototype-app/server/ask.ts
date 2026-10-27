// ИИ-поиск витрины «лучшее рядом» (POST /showcase/ask): Claude подбирает офферы из присланного каталога
// и предлагает уточнения кнопками. Без ANTHROPIC_API_KEY, при сбое или отказе модели отвечает поиск по словам —
// абонент не остаётся без ответа. Модель меняется переменной NEAR_AI_MODEL, например на claude-haiku-5-5.
import Anthropic from '@anthropic-ai/sdk'
import type { components } from '../src/api.gen.ts'

type S = components['schemas']
type Ask = S['AskRequest']

const MODEL = process.env.NEAR_AI_MODEL ?? 'claude-opus-5-5'
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ maxRetries: 1 }) : null

const RULES = `Ты — помощник витрины «лучшее рядом» в приложении билайна. Абонент ищет скидки, купоны и промокоды от мест рядом с ним.
Подбирай только из каталога ниже и называй офферы их id в offerIds, лучшие первыми, не больше 6. Не выдумывай офферы, цены и условия.
Учитывай контекст: ближе — лучше; вечером уместнее ужин и развлечения, утром кофе и завтраки; сигналы абонента подсказывают повод.
Если похожий оффер уже смотрел, сначала предложи новый.
Если запрос размытый («что-нибудь», «куда сходить»), всё равно подбери 3–4 варианта и добавь уточнения.
Уточнения в questions — готовые ответы абонента в 1–4 слова, которые сужают выбор: «до 500 ₽», «в подарок», «на вечер», «пешком».
Не больше 4, без повторов уже сказанного; если уточнять нечего — пустой список.
Если ничего не подходит, скажи об этом честно и предложи ближайшее похожее.
reply — 1–2 коротких предложения на «ты», со строчной буквы, без списков и эмодзи: что подобрал и почему.`

const offerLine = (o: S['AskOffer']) =>
  `${o.id} | ${o.partner} | ${o.title} | ${o.small} | ${o.cat} | ${o.type} | ${o.dist} м${o.price ? ` | ${o.price} ₽` : ''} | ${o.till}${o.bee ? ' | только для клиентов билайна' : ''}`

const schema = (ids: string[]) => ({
  type: 'object',
  properties: {
    reply: { type: 'string' },
    offerIds: { type: 'array', items: { type: 'string', enum: ids } },
    questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['reply', 'offerIds', 'questions'],
  additionalProperties: false,
})

// Проверка тела запроса: на витрину ходят без входа, поэтому размеры ограничены
export function checkAsk(b: unknown): string | null {
  const r = b as Ask
  if (!r || !Array.isArray(r.turns) || !Array.isArray(r.offers) || !r.context) return 'нужны turns, offers и context'
  if (!r.turns.length || r.turns.length > 12 || r.turns.at(-1)!.role !== 'user') return 'диалог от 1 до 12 ходов, последний — абонента'
  if (r.turns.some(t => (t.role !== 'user' && t.role !== 'assistant') || typeof t.text !== 'string' || !t.text.trim() || t.text.length > 500)) return 'реплика — непустой текст до 500 знаков'
  if (r.offers.length > 60 || r.offers.some(o => typeof o.id !== 'string' || typeof o.title !== 'string')) return 'каталог — до 60 офферов с id и title'
  return null
}

// ponytail: лимиты в памяти процесса, сбрасываются при перезапуске; хватит для одного сервера прототипа
const recent = new Map<string, number[]>()
let day = '', spentToday = 0
export function allow(cid: string, now = Date.now()) {
  const hits = (recent.get(cid) ?? []).filter(t => now - t < 10 * 60e3)
  if (hits.length >= 20) return false
  recent.set(cid, [...hits, now])
  return true
}
// общий потолок вызовов модели в сутки: витрина открыта без пароля
const aiBudgetLeft = () => {
  const today = new Date().toISOString().slice(0, 10)
  if (today !== day) (day = today), (spentToday = 0)
  return spentToday < 1000
}

export async function ask(r: Ask): Promise<S['AskAnswer']> {
  if (!client || !aiBudgetLeft()) return byWords(r)
  spentToday++
  const now = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'long', hour: '2-digit', minute: '2-digit' })
  const ids = r.offers.map(o => o.id)
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // при отказе модели ответит резервная, выбранная Anthropic
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schema(ids) } },
      system: [
        { type: 'text', text: `${RULES}\n\nКаталог (id | партнёр | предложение | условие | категория | тип | расстояние | цена | срок | доступ):\n${r.offers.map(offerLine).join('\n')}` },
        { type: 'text', text: `Контекст: район ${r.context.district}; сейчас ${now} по Москве; сигналы абонента: ${r.context.signals.join(', ') || 'нет'}; уже смотрел: ${r.context.viewed.join(', ') || 'ничего'}.` },
      ],
      messages: r.turns.map(t => ({ role: t.role, content: t.text })),
    }, { timeout: 25_000 })
    const text = res.stop_reason === 'refusal' ? null : res.content.find(b => b.type === 'text')?.text
    if (!text) return byWords(r)
    const out = JSON.parse(text) as Omit<S['AskAnswer'], 'source'>
    return { reply: out.reply, offerIds: out.offerIds.filter(id => ids.includes(id)).slice(0, 6), questions: out.questions.slice(0, 4), source: 'ai' }
  } catch (e) {
    console.error('ИИ-поиск: модель недоступна, отвечаем поиском по словам', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e)
    return byWords(r)
  }
}

const STOP = new Set(['для', 'всё', 'все', 'что', 'как', 'где', 'или', 'хочу', 'нужно', 'надо', 'куда', 'мне', 'меня', 'себя', 'рядом', 'пешком', 'близко'])
// Запасной поиск по словам: совпадение начала слова в партнёре, предложении и условии, плюс «рядом» и «до N ₽»
export function byWords(r: Ask): S['AskAnswer'] {
  const q = r.turns.filter(t => t.role === 'user').map(t => t.text).join(' ').toLowerCase()
  const stems = q.split(/[^a-zа-яё0-9]+/).filter(w => w.length >= 3 && !STOP.has(w)).map(w => w.slice(0, 5))
  const near = /рядом|пешком|близко/.test(q), max = +(q.match(/до\s*(\d[\d\s]*)\s*₽?/)?.[1]?.replace(/\s/g, '') ?? 0)
  const score = (o: S['AskOffer']) => {
    const hay = `${o.partner} ${o.title} ${o.small}`.toLowerCase()
    return stems.filter(s => hay.includes(s)).length + (near && o.dist <= 500 ? 1 : 0) + (max && o.price && o.price <= max ? 1 : 0)
  }
  const ranked = r.offers.map(o => ({ o, s: score(o) })).filter(x => x.s > 0 && (!max || !x.o.price || x.o.price <= max)).sort((a, b) => b.s - a.s || a.o.dist - b.o.dist)
  const found = ranked.length > 0
  const pick = (found ? ranked.map(x => x.o) : [...r.offers].sort((a, b) => a.dist - b.dist)).slice(0, found ? 6 : 4)
  return {
    reply: found ? `нашёл ${pick.length} по словам из вопроса` : 'по этим словам ничего не нашёл — вот что ближе всего',
    offerIds: pick.map(o => o.id),
    questions: ['пешком', 'до 500 ₽', 'на вечер', 'в подарок'].filter(x => !q.includes(x)),
    source: 'rules',
  }
}
