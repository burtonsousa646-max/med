import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { animate, motion, useInView, useReducedMotion, AnimatePresence } from 'motion/react'
import { Check as CheckIcon, X } from 'lucide-react'
import logoUrl from '../design-system/assets/beeline-logo.svg'
import { useCatalog, type Campaign, type OfferType } from './api'

export const gap = (v: string) => ({ ['--bl-gap' as string]: v })
export const n = (v: number) => Math.round(v).toLocaleString('ru-RU')
export const rub = (v: number) => `${n(v)} ₽`
export const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export const day = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

/* ───────── бренд и шапка сценария ───────── */
export function Brand({ to = '/cab/campaigns' }: { to?: string }) {
  return (
    <Link className="brand" to={to} aria-label="Рекламная платформа билайна, в кабинет">
      <img className="bl-logo" src={logoUrl} alt="" width={44} height={44} />
      <span className="brand__name">рекламная<br />платформа</span>
    </Link>
  )
}
export { logoUrl }

const STEPS = [['охват', 'reach'], ['кампания', 'build'], ['оплата', 'checkout'], ['запуск', 'launch']] as const
export function FlowHead({ step, id }: { step: number; id: number }) {
  return (
    <header className="flow-head">
      <Brand />
      <ol className="bl-steps" aria-label="Шаги">
        {STEPS.map(([t, to], i) => (
          <li key={t} className={i < step ? 'is-done' : i === step ? 'is-current' : ''} aria-current={i === step ? 'step' : undefined}>
            {i < step ? <Link to={`/c/${id}/${to}`} className="step-link">{t}</Link> : t}
          </li>
        ))}
      </ol>
      <Link className="bl-btn bl-btn--s" to="/cab/campaigns">сохранить и выйти</Link>
    </header>
  )
}

/* ───────── поля выбора: управляемые, значение и запись — снаружи ───────── */
type Field = { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; sub?: ReactNode; disabled?: boolean }
export function Check({ checked, onChange, label, sub, disabled }: Field) {
  return (
    <label className="bl-check" style={disabled ? { cursor: 'default' } : undefined}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="bl-check__box" />
      <span>{label}{sub && <span className="bl-caption" style={{ display: 'block' }}>{sub}</span>}</span>
    </label>
  )
}

export function Switch({ checked, onChange, label }: Field) {
  return (
    <label className="bl-switch">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="bl-switch__track" />
      <span>{label}</span>
    </label>
  )
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="bl-segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, t]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} aria-selected={value === v} onClick={() => onChange(v)}>{t}</button>
      ))}
    </div>
  )
}

export function Chip({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: ReactNode }) {
  return <button type="button" className={`bl-chip${on ? ' is-active' : ''}`} aria-pressed={on} onClick={onClick}>{children}</button>
}

export type IdProvider = 'gos' | 'sber' | 'alfa'

export const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => toast(`${what} скопирован`), () => toast('Не получилось скопировать, выделите вручную'))

/* ───────── анимированное число ───────── */
export function Num({ value, suffix = '', from }: { value: number; suffix?: string; from?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const reduce = useReducedMotion()
  const last = useRef(from ?? 0)
  const fmt = (v: number) => Math.round(v).toLocaleString('ru-RU') + suffix
  useEffect(() => {
    const el = ref.current
    if (!el || !inView) return
    if (reduce) { el.textContent = fmt(value); last.current = value; return }
    const c = animate(last.current, value, { duration: 0.8, ease: 'easeOut', onUpdate: v => (el.textContent = fmt(v)) })
    last.current = value
    return () => c.stop()
  }, [value, inView, reduce])
  return <span ref={ref} className="bl-nums">{fmt(from ?? value)}</span>
}

/* ───────── тосты и модалки ───────── */
let pushToast: (m: string) => void = () => {}
export const toast = (m: string) => pushToast(m)
export function Toaster() {
  const [msg, setMsg] = useState<{ id: number; t: string } | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    pushToast = t => { setMsg({ id: Date.now(), t }); clearTimeout(timer); timer = setTimeout(() => setMsg(null), 3200) }
    return () => clearTimeout(timer)
  }, [])
  return (
    <div className="toast-host" aria-live="polite">
      <AnimatePresence>
        {msg && <motion.div key={msg.id} className="bl-toast" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}>{msg.t}</motion.div>}
      </AnimatePresence>
    </div>
  )
}

export function Modal({ open, onClose, children, label }: { open: boolean; onClose?: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open || !onClose) return
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', f)
    return () => removeEventListener('keydown', f)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="bl-overlay" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="bl-modal bl-stack" role="dialog" aria-modal="true" aria-label={label} style={gap('16px')}
            onClick={e => e.stopPropagation()} initial={{ y: 24, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 24, opacity: 0 }}>
            {onClose && <button className="bl-icon-btn modal-close" onClick={onClose} aria-label="Закрыть"><X size={20} /></button>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ───────── выбор типа оффера для новой кампании ───────── */
export function TypePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (t: OfferType) => void }) {
  const { offerTypes } = useCatalog()
  return (
    <Modal open={open} onClose={onClose} label="Тип оффера">
      <h2 className="bl-h2">какой оффер запускаем?</h2>
      <div className="type-grid" role="radiogroup" aria-label="Тип оффера">
        {offerTypes.map(o => (
          <button key={o.id} role="radio" aria-checked={false} className={`bl-card choice type-opt${o.id === 'click' ? ' type-opt--main' : ''}`} onClick={() => { onClose(); onPick(o.id) }}>
            <span className="bl-row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><span className="bl-h4">{o.t}</span>{o.id === 'click' && <span className="bl-tag bl-tag--dark">основной</span>}</span>
            <span className="bl-caption">{o.d}</span>
            <span className="bl-caption">вы платите: <b className="bl-medium">{o.pay}</b></span>
          </button>
        ))}
      </div>
      <p className="bl-micro">Путь одинаковый: охват, условия, оплата или оферта, запуск.</p>
    </Modal>
  )
}

export function TypeTag({ c }: { c: Campaign }) {
  const T = useCatalog().offerTypes.find(t => t.id === c.type)!
  return <span className={`bl-tag${c.type === 'click' ? ' bl-tag--dark' : ' bl-tag--soft-violet'}`}>{T.t}</span>
}

export const STATUS: Record<Campaign['status'], [string, string]> = {
  draft: ['черновик', ''], approval: ['ждёт руководителя', ''], invoice: ['ждём оплату', ''], moderation: ['на проверке', ''],
  rejected: ['нужна правка', 'bl-tag--soft-violet'], live: ['показывается', 'bl-tag--success'], paused: ['на паузе', ''],
  finished: ['завершена', ''], archived: ['в архиве', ''],
}
export const StatusTag = ({ s }: { s: Campaign['status'] }) => <span className={`bl-tag ${STATUS[s][1]}`}>{STATUS[s][0]}</span>

export function Done({ size = 16 }: { size?: number }) { return <CheckIcon size={size} strokeWidth={2.4} aria-hidden="true" /> }

/** Подсветка стоп-слова в тексте объявления. */
export function Highlight({ text, word }: { text: string; word?: string }) {
  if (!word || !text.includes(word)) return <>{text}</>
  const [a, ...rest] = text.split(word)
  return <>{a}<mark className="stop">{word}</mark>{rest.join(word)}</>
}
