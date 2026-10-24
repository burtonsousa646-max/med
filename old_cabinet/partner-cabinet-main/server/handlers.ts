/// <reference types="node" />
import { buildPlatformKnowledge, pageNameByPath } from './knowledge.js'
/**
 * Общая логика вызовов OpenAI — переиспользуется и Vercel serverless-функциями (api/*.ts),
 * и локальным dev-middleware (vite-plugins/localApi.ts). Ключ читается ТОЛЬКО из
 * process.env на сервере — никогда не попадает в клиентский бандл.
 */

const MODEL_CHAT = process.env.OPENAI_CHAT_MODEL || 'gpt-4.1'
// Помощник отправляет большую базу знаний на каждый запрос, поэтому ему нужна модель с высоким лимитом токенов в минуту.
const MODEL_ASSISTANT = process.env.OPENAI_ASSISTANT_MODEL || 'gpt-4.1-mini'
const MODEL_IMAGE = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'

function requireApiKey(): string {
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    throw new Error(
      'OPENAI_API_KEY не настроен на сервере. Добавьте его в .env.local (локально) или в переменные окружения проекта на Vercel.',
    )
  }
  return key
}

async function openaiFetch(path: string, body: unknown): Promise<any> {
  const key = requireApiKey()
  // Лимит токенов в минуту (429) снимается за секунды — один-два повтора вместо ошибки пользователю.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.openai.com/v1/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (res.ok) return res.json()
    const text = await res.text().catch(() => '')
    if (res.status === 429 && attempt < 2) {
      const hinted = Number(text.match(/try again in ([\d.]+)s/i)?.[1])
      const waitMs = Math.min(Math.max(Number.isFinite(hinted) ? hinted * 1000 + 300 : 3000, 1000), 9000)
      await new Promise((r) => setTimeout(r, waitMs))
      continue
    }
    throw new Error(`OpenAI ${path} вернул ${res.status}: ${text.slice(0, 300)}`)
  }
}

const ASSISTANT_RULES = `Ты — AI-помощник платформы МЁД (демонстрационный прототип партнёрского кабинета). Ты отвечаешь на ЛЮБЫЕ вопросы о платформе: как она устроена, модели офферов и кто кому платит, уровни интеграции, оферта, комиссии, расчёты и выплаты, заказы, модерация, разделы кабинета.
Правила:
- Отвечай по-русски, дружелюбно и по делу: обычно 2–6 предложений; для перечислений используй короткие списки.
- Опирайся ТОЛЬКО на базу знаний ниже. Если там нет ответа, скажи об этом прямо и предложи раздел «Поддержка» — не выдумывай факты, цифры и сроки.
- Все юридические тексты и сроки в прототипе демонстрационные: при вопросах про оферту и деньги напомни об этом одной короткой фразой.
- Когда уместно, указывай, где это в кабинете, по названию раздела (например: «Офферы → Новый оффер», «Интеграция», «Расчёты»).
- Если вопрос про выбор модели оффера или уровня интеграции, а деталей мало, задай один уточняющий вопрос (что продаёте, как клиент получает услугу, есть ли сайт или касса) и дай предварительную рекомендацию.
- Всегда пиши название компании по-русски: «Билайн». Ты не официальная служба поддержки Билайна.
- Если вопрос совсем не о платформе, вежливо верни разговор к платформе МЁД.`

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** `page` — адрес страницы, на которой сейчас пользователь: помогает отвечать «про этот экран». */
export async function assistantReply(messages: ChatMessage[], page?: string): Promise<string> {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Пустой список сообщений')
  }
  const pageName = pageNameByPath(page)
  const system =
    ASSISTANT_RULES +
    (pageName ? `\n\nСейчас пользователь находится на странице «${pageName}» (${page}).` : '') +
    `\n\n=== БАЗА ЗНАНИЙ ===\n${buildPlatformKnowledge()}`
  const data = await openaiFetch('chat/completions', {
    model: MODEL_ASSISTANT,
    temperature: 0.3,
    max_tokens: 900,
    messages: [{ role: 'system', content: system }, ...messages.slice(-12)],
  })
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenAI вернул пустой ответ')
  return content as string
}

export interface OfferCopyInput {
  mechanic: string
  rawIdea: string
}

export type OfferModelId = 'voucher' | 'cpa' | 'cps' | 'subscription'
const OFFER_MODEL_IDS: OfferModelId[] = ['voucher', 'cpa', 'cps', 'subscription']

export interface OfferCopyResult {
  title: string
  benefit: string
  description: string
  usageRules: string
  refundRules: string
  imagePrompt: string
  badge: string
  model: OfferModelId
}

/** Партнёр описывает идею в одну-две фразы — GPT сам придумывает название и остальные
 *  тексты; заполнять название заранее не требуется (SOURCE: запрос — "сначала краткое
 *  описание идеи, дальше остальные поля"). */
export async function generateOfferCopy(input: OfferCopyInput): Promise<OfferCopyResult> {
  if (!input.rawIdea?.trim()) {
    throw new Error('Опишите, что партнёр хочет предложить')
  }
  const data = await openaiFetch('chat/completions', {
    model: MODEL_CHAT,
    temperature: 0.6,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Ты копирайтер купонной платформы МЁД (Билайн). По краткой идее партнёра и механике оффера придумай название и составь маркетинговые тексты на русском языке. ' +
          'Обязательно сохраняй конкретику идеи — товар/услугу, категорию, названия и детали (например, «пиццы и закуски», а не «блюда»); не обобщай. ' +
          'Верни строго JSON-объект с полями: title (короткое название оффера, до 60 символов, без кавычек), benefit (короткая выгода для клиента, до 60 символов), ' +
          'description (описание оффера, 1-3 предложения), usageRules (условия использования, 1-2 предложения), refundRules (условия возврата, 1 предложение), ' +
          'imagePrompt (НА АНГЛИЙСКОМ, 1-2 предложения — что изображено на яркой рекламной обложке оффера: КОНКРЕТНЫЙ главный предмет именно из этой идеи (пицца — pizza, туры на Камчатку — volcano and landscape of Kamchatka, кино — movie scenes), крупным планом и тематический фон; ' +
          'если в идее названа компания или бренд, не рисуй его логотип — рисуй тематику его продукта; ' +
          'для еды — аппетитное профессиональное фото крупным планом; для подписок и сервисов — глянцевая 3D-плитка-логотип на ярком градиентном фоне с коллажем тематических кадров; ' +
          'для путешествий — сочная сцена места назначения; без текста и логотипов реальных брендов), ' +
          'badge (короткая плашка скидки для обложки, до 12 символов, в идеале цифры и знаки, например "-20%", "2=1", "30 дней"; пустая строка, если в идее нет числовой выгоды), ' +
          'model (модель денег, ровно одно значение: "voucher" — клиент покупает купон у платформы, платформа делит выручку с партнёром; "cpa" — партнёр платит платформе за действие клиента: заявку, регистрацию, установку; ' +
          '"cps" — клиент покупает на сайте партнёра, партнёр платит платформе процент; "subscription" — подписка с регулярными платежами). ' +
          'Поле model выбирай ТОЛЬКО по смыслу идеи партнёра, а не по подсказке о механике: «N дней бесплатно, затем платно», «в месяц», «подписка» — subscription; ' +
          '«платим за заявку/регистрацию/установку/лид» — cpa; «процент с покупки на нашем сайте/в магазине» — cps; скидка или купон, который клиент покупает и гасит у партнёра — voucher. ' +
          'Без markdown, только сам JSON.',
      },
      {
        role: 'user',
        content: `Идея партнёра: ${input.rawIdea}\n(Подсказка по механике, может быть неточной и не влияет на выбор model: ${input.mechanic})`,
      },
    ],
  })
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenAI вернул пустой ответ')
  const parsed = JSON.parse(content)
  return {
    title: String(parsed.title ?? ''),
    benefit: String(parsed.benefit ?? ''),
    description: String(parsed.description ?? ''),
    usageRules: String(parsed.usageRules ?? ''),
    refundRules: String(parsed.refundRules ?? ''),
    imagePrompt: String(parsed.imagePrompt ?? ''),
    badge: String(parsed.badge ?? '').slice(0, 14),
    model: OFFER_MODEL_IDS.includes(parsed.model) ? parsed.model : 'voucher',
  }
}

export interface OfferIconInput {
  idea: string
  imagePrompt?: string
  badge?: string
}

/** Яркая обложка в стиле плиток каталога акций (фото/3D-иллюстрация + плашка скидки).
 *  JPEG вместо PNG: картинка хранится data-URL'ом в localStorage, PNG 1024² легко
 *  занимает 1.5–2 МБ и быстро упирается в квоту. */
export async function generateOfferIcon(input: OfferIconInput): Promise<string> {
  const idea = input?.idea?.trim()
  if (!idea) throw new Error('Опишите, какая нужна иконка')
  const subject = input.imagePrompt?.trim() || `an advertising visual for this offer: ${idea}`
  const badge = input.badge?.trim()
  const prompt = [
    'A vibrant, eye-catching square cover image for an offer tile in a mobile app promo catalog (cashback and coupons marketplace).',
    `Subject: ${subject}`,
    `The image must clearly match this offer (use it only to pick the subject, do not render this text): ${idea}.`,
    'Style: bold saturated colors, strong contrast, clean modern composition with one clear hero subject, soft studio lighting, high-quality commercial photography or glossy 3D illustration, rich colorful background (gradient or a relevant scene), never a plain white or flat minimal background. Keep the lower-left corner uncluttered.',
    badge
      ? `Add a rounded orange badge in the lower-left corner with the bold, perfectly legible white label "${badge}".`
      : 'Do not add any text.',
    'No watermarks, no small print, no real-brand logos.',
  ].join(' ')

  const data = await openaiFetch('images/generations', {
    model: MODEL_IMAGE,
    prompt,
    size: '1024x1024',
    quality: 'medium',
    output_format: 'jpeg',
    output_compression: 85,
    n: 1,
  })
  const b64 = data.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI не вернул изображение')
  return `data:image/jpeg;base64,${b64}`
}
