import { readFileSync } from 'node:fs'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { emptyOffer, offerErrors, offerLayouts, type OfferDraft } from '../shared/campaign-offer.ts'
import type { OfferAiAnswer, OfferAiInput, OfferAiResponse } from '../shared/offer-ai.ts'

const modes = ['auto', 'manual'] as const
const tones = ['red', 'green', 'blue', 'violet', 'magenta', 'teal', 'dark', 'light'] as const
const layouts = Object.keys(offerLayouts)
const fields = [...Object.keys(emptyOffer), 'layout'] as (keyof OfferDraft)[]
const statuses = ['draft', 'ideas', 'needs_input'] as const
const actions = ['keep', 'suggest_asset', 'generate', 'remove_background', 'text_only'] as const

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function string(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.length <= limit
}

function choice<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T)
}

function patchOf(value: unknown): Partial<OfferDraft> | null {
  const patch = object(value)
  if (!patch || Object.keys(patch).some(key => !fields.includes(key as keyof OfferDraft))) return null
  for (const [key, item] of Object.entries(patch)) {
    if (item === null) continue
    const valid = key === 'tone' ? choice(item, tones) : key === 'layout' ? choice(item, layouts)
      : key === 'gift' || key === 'zoom' ? typeof item === 'boolean'
      : string(item, key === 'title' ? 90 : key === 'promo' ? 24 : 10)
    if (!valid) return null
  }
  return Object.fromEntries(Object.entries(patch).filter(([, item]) => item !== null))
}

function inputOf(value: unknown): OfferAiInput | null {
  const input = object(value)
  if (!input || !choice(input.mode, modes) || !string(input.name, 80) || !string(input.category, 100)
    || !string(input.request, 400) || (input.mode === 'manual' && !input.request.trim())
    || typeof input.hasImage !== 'boolean' || typeof input.hasLogo !== 'boolean') return null
  const clarification = object(input.clarification)
  const options = Array.isArray(clarification?.options) && clarification.options.length <= 3
    && clarification.options.every(item => string(item, 90)) ? clarification.options : undefined
  const offer = patchOf(input.offer)
  if (!offer) return null
  const lockedFields = input.mode === 'auto'
    ? fields.filter(key => key !== 'title' || (Array.isArray(input.lockedFields) && input.lockedFields.includes('title')))
    : []
  return {
    mode: input.mode, name: input.name, category: input.category, request: input.request,
    offer: { ...emptyOffer, ...offer }, lockedFields, hasImage: input.hasImage, hasLogo: input.hasLogo,
    ...(clarification && string(clarification.request, 400) && string(clarification.question, 300)
      ? { clarification: { request: clarification.request, question: clarification.question, options } } : {}),
  }
}

export function offerAnswer(value: unknown, input: OfferAiInput): OfferAiAnswer | null {
  const answer = object(value)
  const patch = patchOf(answer?.patch)
  const visual = object(answer?.visual)
  if (!answer || !patch || !choice(answer.status, statuses) || !Array.isArray(answer.options)
    || answer.options.length > 3 || (answer.question !== null && !string(answer.question, 300))
    || !visual || !choice(visual.action, actions) || (visual.prompt !== null && !string(visual.prompt, 1500))) return null
  if (answer.status === 'needs_input' && (typeof answer.question !== 'string' || !answer.question.trim())) return null

  const options: OfferAiAnswer['options'] = []
  for (const item of answer.options) {
    const option = object(item)
    if (!option || !string(option.mechanic, 100) || !string(option.headline, 90) || !option.headline.trim()
      || !Array.isArray(option.missingFacts) || option.missingFacts.length > 5
      || !option.missingFacts.every(fact => string(fact, 180))) return null
    options.push({ mechanic: option.mechanic, headline: option.headline, missingFacts: option.missingFacts })
  }

  if (answer.status === 'ideas' && !options.length) return null
  const changes = Object.fromEntries(Object.entries(patch).filter(([key, item]) => item !== input.offer[key as keyof OfferDraft])) as Partial<OfferDraft>
  const locked = input.mode === 'auto' ? input.lockedFields ?? fields.filter(key => key !== 'title') : []
  if ((answer.status !== 'draft' && Object.keys(changes).length) || locked.some(key => key in changes)) return null
  if (input.mode === 'auto' && changes.title && /\d|бесплат|в подарок|скидк|₽/i.test(changes.title)) return null
  const userText = [input.request, input.clarification?.request].filter(Boolean).join(' ')
  if (changes.promo && !userText.includes(changes.promo)) return null
  if (changes.promo === '' && !/промокод|промо.код/i.test(userText)) return null
  if (changes.gift === true && !/1\s*\+\s*1|втор(?:ой|ая|ое).*подар|подар.*втор/i.test(userText)) return null
  if (changes.discount && !userText.match(/\d+/g)?.includes(changes.discount)) return null
  const knownNumbers: string[] = (input.offer.title + ' ' + userText).match(/\d+/g) ?? []
  if (changes.title?.match(/\d+/g)?.some(number => !knownNumbers.includes(number))) return null
  const merged = { ...input.offer, ...changes }
  const cappedDiscount = /(?:^|\s)до\s*(\d{1,2})\s*%/i.exec(userText)
  if (cappedDiscount && (changes.discount || (changes.title && !new RegExp('до\\s*' + cappedDiscount[1] + '\\s*%', 'i').test(changes.title)))) return null
  const promo = merged.promo.toLowerCase()
  if (changes.title && promo && changes.title.toLowerCase().split(/[^a-zа-яё0-9_-]+/i).includes(promo)) return null
  const errors = offerErrors(merged)
  if (answer.status === 'draft' && (errors.title || errors.promo || errors.discount || (changes.until !== undefined && errors.until)
    || (merged.gift && merged.discount))) return null

  const assetId = visual.assetId === 'current-image' && input.hasImage ? 'current-image' : null
  const action = (visual.action === 'suggest_asset' || visual.action === 'remove_background') && !assetId ? 'keep' : visual.action
  return {
    status: answer.status, patch: changes, options, question: answer.question,
    visual: { action, assetId, prompt: visual.prompt },
    logoAssetId: answer.logoAssetId === 'current-logo' && input.hasLogo ? 'current-logo' : null,
  }
}

const nullable = (type: string) => ({ type: [type, 'null'] })
const enumOf = (values: readonly string[], optional = false) => optional
  ? { type: ['string', 'null'], enum: [...values, null] } : { type: 'string', enum: values }
const schemaObject = (properties: Record<string, unknown>) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
})
const textField = { type: 'string' }
const schema = schemaObject({
  status: enumOf(statuses),
  patch: schemaObject({
    title: nullable('string'), promo: nullable('string'), discount: nullable('string'), until: nullable('string'),
    tone: enumOf(tones, true), gift: nullable('boolean'), zoom: nullable('boolean'), layout: enumOf(layouts, true),
  }),
  options: { type: 'array', items: schemaObject({
    mechanic: textField, headline: textField, missingFacts: { type: 'array', items: textField },
  }) },
  question: nullable('string'),
  visual: schemaObject({ action: enumOf(actions), assetId: nullable('string'), prompt: nullable('string') }),
  logoAssetId: nullable('string'),
})

function promptText() {
  const file = readFileSync(new URL('../docs/campaign-offer-rules.md', import.meta.url), 'utf8')
  const split = file.indexOf('\n---\n')
  if (split === -1) throw new Error('Offer prompt missing delimiter')
  return file.slice(split + 5).trim() + '\n\nВ схеме API ставь null для каждого поля patch, которое оставляешь прежним. ' +
    'В авто редактируй только незакреплённый нейтральный заголовок. Идеи и вопросы не меняют черновик. ' +
    'У тебя нет доступа к изображениям, сайту или файловым инструментам. Возвращай задания на обработку в visual.'
}

async function openAi(input: OfferAiInput, model: string, key: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model, store: false, instructions: promptText(), max_output_tokens: 2400,
      input: JSON.stringify({
        mode: input.mode, business: { name: input.name, category: input.category },
        offer: { ...input.offer, promo: undefined }, hasPromo: Boolean(input.offer.promo),
        request: input.request, lockedFields: input.lockedFields, clarification: input.clarification,
        today: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(),
        assets: [
          ...(input.hasImage ? [{ id: 'current-image', kind: 'creative', confirmed: true }] : []),
          ...(input.hasLogo ? [{ id: 'current-logo', kind: 'logo', confirmed: true }] : []),
        ],
      }),
      text: { format: { type: 'json_schema', name: 'med_offer', strict: true, schema } },
    }),
  })
  if (!response.ok) throw new Error('Offer provider request failed')
  const body = await response.json() as { status?: string; output?: { type: string; content?: { type: string; text?: string }[] }[] }
  const text = body.output?.find(item => item.type === 'message')?.content?.find(item => item.type === 'output_text')?.text
  if (body.status !== 'completed' || !text) throw new Error('Offer provider response incomplete')
  return JSON.parse(text)
}

type Config = { provider?: string; key?: string; model?: string; replayFile?: string; production?: boolean }

export function createOfferAi(config: Config) {
  let active = 0, requests = 0, day = ''
  return new Hono().post('/offer-ai', bodyLimit({ maxSize: 4096, onError: c => c.json({ message: 'Запрос слишком большой' }, 413) }), async c => {
    if (c.req.header('content-type')?.split(';')[0] !== 'application/json') return c.json({ message: 'Ожидается JSON' }, 400)
    const input = inputOf(await c.req.json().catch(() => null))
    if (!input) return c.json({ message: 'Проверьте данные для сборки оффера' }, 400)
    if (!config.provider || config.provider === 'off') return c.json<OfferAiResponse>({ source: 'disabled' })
    if (config.provider === 'codex-replay' && !config.production && config.replayFile) {
      try {
        const cases = JSON.parse(readFileSync(config.replayFile, 'utf8')) as {
          mode: OfferAiInput['mode']; category: string; title: string; request: string; answer: unknown
        }[]
        const match = cases.find(item => item.mode === input.mode && item.category === input.category
          && item.title === input.offer.title && item.request === input.request)
        if (!match) return c.json<OfferAiResponse>({ source: 'disabled' })
        const answer = offerAnswer(match.answer, input)
        if (answer) return c.json<OfferAiResponse>({ source: 'codex-replay', answer })
      } catch { /* Rejected replay data. */ }
      return c.json({ message: 'Тестовый ответ не прошёл проверку' }, 502)
    }
    if (config.provider !== 'openai' || !config.model || !config.key) return c.json({ message: 'Помощник пока не настроен' }, 503)
    const today = new Date().toISOString().slice(0, 10)
    if (day !== today) { day = today; requests = 0 }
    if (active >= 3 || requests >= 300) return c.json({ message: 'Помощник занят. Попробуйте позже' }, 429)
    requests++
    active++
    try {
      const signal = AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(25_000)])
      const answer = offerAnswer(await openAi(input, config.model, config.key, signal), input)
      if (answer) return c.json<OfferAiResponse>({ source: 'api', answer })
    } catch { /* Provider errors may contain request data. */ }
    finally { active-- }
    return c.json({ message: 'Помощник не вернул подходящий ответ. Попробуйте ещё раз' }, 502)
  })
}

export const offerAi = createOfferAi({
  provider: process.env.OFFER_AI_PROVIDER, key: process.env.OPENAI_API_KEY, model: process.env.OFFER_AI_MODEL,
  replayFile: process.env.OFFER_AI_REPLAY_FILE, production: process.env.NODE_ENV === 'production',
})
