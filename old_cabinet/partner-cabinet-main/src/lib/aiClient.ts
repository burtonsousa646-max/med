/** Тонкий клиент к собственным serverless-эндпоинтам (api/*.ts) — ключ OpenAI сюда
 *  не попадает, браузер обращается только к нашему /api/*, не к api.openai.com напрямую. */

export class AiClientError extends Error {}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new AiClientError('Нет соединения с сервером')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new AiClientError(data.error || `Ошибка сервера (${res.status})`)
  }
  return data as T
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function askAssistant(messages: ChatMessage[], page?: string): Promise<{ reply: string }> {
  return postJson('/api/assistant', { messages, page })
}

export interface OfferCopyInput {
  mechanic: string
  rawIdea: string
}
export interface OfferCopyResult {
  title: string
  benefit: string
  description: string
  usageRules: string
  refundRules: string
  imagePrompt: string
  badge: string
  model: 'voucher' | 'cpa' | 'cps' | 'subscription'
}

export function generateOfferCopy(input: OfferCopyInput): Promise<OfferCopyResult> {
  return postJson('/api/offers/generate-copy', input)
}

export interface OfferIconInput {
  idea: string
  imagePrompt?: string
  badge?: string
}

export function generateOfferIcon(input: OfferIconInput): Promise<{ dataUrl: string }> {
  return postJson('/api/icons/generate', input)
}
