import { create } from 'zustand'
import { answerQuestion } from '@/mock-api/faq'
import { askAssistant, AiClientError, type ChatMessage } from '@/lib/aiClient'

export interface ChatEntry {
  id: number
  role: 'user' | 'assistant'
  text: string
  link?: { label: string; to: string }
  fallback?: boolean
}

export const ASSISTANT_INTRO =
  'Здравствуйте! Я AI-помощник МЁД. Отвечу на любые вопросы о платформе: модели офферов и кто кому платит, уровни интеграции, оферта, расчёты и выплаты, заказы, модерация. Спрашивайте своими словами.'

export const ASSISTANT_SUGGESTIONS = [
  'Какие бывают модели офферов и кто кому платит?',
  'Какой уровень интеграции мне выбрать?',
  'Как и когда мне платят?',
  'Как проходит модерация оффера?',
  'Что в оферте про возвраты?',
]

interface AssistantState {
  open: boolean
  entries: ChatEntry[]
  pending: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  ask: (query: string) => Promise<void>
}

/** Диалог живёт в памяти и общий для кнопки в шапке и страницы /assistant — не теряется
 *  при переходах между разделами. */
export const useAssistantStore = create<AssistantState>()((set, get) => ({
  open: false,
  entries: [{ id: 0, role: 'assistant', text: ASSISTANT_INTRO }],
  pending: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  async ask(query) {
    const trimmed = query.trim()
    if (!trimmed || get().pending) return
    const userEntry: ChatEntry = { id: get().entries.length, role: 'user', text: trimmed }
    set((s) => ({ entries: [...s.entries, userEntry], pending: true }))

    try {
      const history: ChatMessage[] = get()
        .entries.slice(1)
        .map((e) => ({ role: e.role, content: e.text }))
        .slice(-10)
      const { reply } = await askAssistant(history, window.location.pathname)
      set((s) => ({ entries: [...s.entries, { id: s.entries.length, role: 'assistant', text: reply }] }))
    } catch (e) {
      const found = answerQuestion(trimmed)
      set((s) => ({
        entries: [
          ...s.entries,
          {
            id: s.entries.length,
            role: 'assistant',
            fallback: true,
            text: found
              ? found.answer
              : `AI сейчас недоступен (${e instanceof AiClientError ? e.message : 'ошибка сети'}). Точного ответа в заготовленном FAQ нет — обратитесь в «Поддержку».`,
            link: found?.link,
          },
        ],
      }))
    } finally {
      set({ pending: false })
    }
  },
}))
