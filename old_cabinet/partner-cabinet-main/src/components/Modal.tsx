import { type ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { IconButton } from './Button'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Element | null>(null)

  // Открытие: запомнить элемент, вернувший фокус, и перевести фокус в диалог.
  useEffect(() => {
    if (!open) return
    triggerRef.current = document.activeElement
    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    return () => {
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus()
      }
    }
  }, [open])

  // Escape закрывает, Tab держит фокус внутри диалога (focus trap).
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bee-bg-overlay p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-bee-xl bg-bee-bg-secondary p-6 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id="modal-title" className="text-headline-sm font-medium text-bee-content-primary">
            {title}
          </h2>
          <IconButton
            aria-label="Закрыть"
            icon={<X size={18} />}
            size="m"
            priority="tertiary"
            onClick={onClose}
          />
        </div>
        <div className="text-body-sm text-bee-content-primary">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
