import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Send, TriangleAlert, User } from 'lucide-react'
import { ASSISTANT_SUGGESTIONS, useAssistantStore } from '@/stores/assistantStore'

/** Минимум разметки из ответа модели: **жирный** и списки. Остальное — обычный текст. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-medium">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length === 0) return
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-1 flex list-disc flex-col gap-0.5 pl-5">
        {list.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ul>,
    )
    list = []
  }
  for (const line of text.split('\n')) {
    const item = line.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/)
    if (item) {
      list.push(item[1])
      continue
    }
    flush()
    if (line.trim()) blocks.push(<p key={`p-${blocks.length}`}>{inline(line)}</p>)
  }
  flush()
  return <div className="flex flex-col gap-1.5">{blocks}</div>
}

export function AssistantChat({ className = '' }: { className?: string }) {
  const entries = useAssistantStore((s) => s.entries)
  const pending = useAssistantStore((s) => s.pending)
  const ask = useAssistantStore((s) => s.ask)
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [entries.length, pending])

  function submit(query: string) {
    if (!query.trim() || pending) return
    setInput('')
    void ask(query)
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-3 ${className}`}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {entries.map((e) => (
          <div key={e.id} className={`flex items-start gap-2.5 ${e.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                e.role === 'user' ? 'bg-bee-el-secondary' : 'bg-bee-brand-primary'
              }`}
            >
              {e.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </span>
            <div
              className={`max-w-[85%] rounded-bee-md p-3 text-body-sm ${
                e.role === 'user'
                  ? 'bg-bee-el-secondary text-bee-content-primary'
                  : 'bg-bee-surface-yellow/40 text-bee-content-primary'
              }`}
            >
              {e.fallback && (
                <p className="mb-1 flex items-center gap-1 text-caption text-bee-content-tertiary">
                  <TriangleAlert size={12} /> резервный ответ (FAQ)
                </p>
              )}
              {e.role === 'assistant' ? <RichText text={e.text} /> : <p className="whitespace-pre-line">{e.text}</p>}
              {e.link && (
                <Link to={e.link.to} className="mt-1 inline-block text-caption font-medium text-bee-link-primary hover:underline">
                  {e.link.label} →
                </Link>
              )}
            </div>
          </div>
        ))}
        {pending && <p className="pl-10 text-caption text-bee-content-tertiary">Печатает…</p>}
        <div ref={endRef} />
      </div>

      {entries.length === 1 && (
        <div className="flex flex-wrap gap-2">
          {ASSISTANT_SUGGESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => submit(q)}
              disabled={pending}
              className="rounded-bee-pill border border-bee-border-secondary px-3 py-1.5 text-left text-caption text-bee-content-secondary hover:bg-bee-el-secondary disabled:opacity-60"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit(input)
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Спросите что угодно о платформе…"
          aria-label="Вопрос помощнику"
          disabled={pending}
          className="h-11 min-w-0 flex-1 rounded-bee-pill border border-bee-border-secondary bg-bee-bg-secondary px-4 text-body-sm focus:outline-none focus:ring-2 focus:ring-bee-brand-tertiary disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          aria-label="Отправить"
          className="flex size-11 shrink-0 items-center justify-center rounded-bee-pill bg-bee-brand-primary text-bee-content-primary hover:bg-bee-brand-secondary disabled:opacity-60"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  )
}
