import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, X } from 'lucide-react'
import { useAssistantStore } from '@/stores/assistantStore'
import { AssistantChat } from './AssistantChat'

/** Кнопка «AI-помощник» для шапки любой страницы + панель с чатом справа. */
export function AssistantLauncher({ className = '' }: { className?: string }) {
  const open = useAssistantStore((s) => s.open)
  const setOpen = useAssistantStore((s) => s.setOpen)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="AI-помощник"
        className={`flex h-10 shrink-0 items-center gap-1.5 rounded-bee-pill bg-bee-brand-primary px-3.5 text-body-accent-sm font-medium text-bee-content-primary transition-colors hover:bg-bee-brand-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bee-brand-tertiary focus-visible:ring-offset-2 ${className}`}
      >
        <Sparkles size={16} />
        <span className="hidden sm:inline">AI-помощник</span>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex justify-end bg-bee-bg-overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
            <aside
              role="dialog"
              aria-label="AI-помощник"
              className="flex h-full w-full flex-col gap-3 bg-bee-bg-secondary p-4 shadow-xl sm:w-[440px]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-headline-sm font-medium text-bee-content-primary">
                    <Sparkles size={18} /> AI-помощник МЁД
                  </h2>
                  <p className="text-caption text-bee-content-tertiary">
                    Отвечает на вопросы о платформе. Демонстрационный помощник, не поддержка Билайна.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Закрыть"
                  className="flex size-9 shrink-0 items-center justify-center rounded-bee-pill hover:bg-bee-el-secondary"
                >
                  <X size={18} />
                </button>
              </div>
              <AssistantChat />
            </aside>
          </div>,
          document.body,
        )}
    </>
  )
}
