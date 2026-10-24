import { useEffect } from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { useUiStore, type ToastItem, type ToastTone } from '@/stores/uiStore'

const toneIcon: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
}

const toneClasses: Record<ToastTone, string> = {
  success: 'border-bee-success-primary/30 text-bee-success-tertiary',
  error: 'border-bee-error-primary/30 text-bee-error-tertiary',
  info: 'border-bee-link-primary/30 text-bee-link-tertiary',
}

function ToastCard({ toast }: { toast: ToastItem }) {
  const dismissToast = useUiStore((s) => s.dismissToast)
  const Icon = toneIcon[toast.tone]

  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), 3900)
    return () => clearTimeout(timer)
  }, [toast.id, dismissToast])

  return (
    <div
      className={clsx(
        'flex items-start gap-3 rounded-bee-lg border bg-bee-bg-secondary p-4 shadow-lg',
        toneClasses[toast.tone],
      )}
    >
      <Icon size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-body-accent-sm font-medium text-bee-content-primary">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-caption text-bee-content-secondary">{toast.description}</p>
        )}
      </div>
      <button
        aria-label="Закрыть уведомление"
        onClick={() => dismissToast(toast.id)}
        className="shrink-0 text-bee-content-tertiary hover:text-bee-content-primary"
      >
        <X size={16} />
      </button>
    </div>
  )
}

export function ToastStack() {
  const toasts = useUiStore((s) => s.toasts)
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:right-4 sm:left-auto"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto w-full sm:w-96">
          <ToastCard toast={toast} />
        </div>
      ))}
    </div>
  )
}
