import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { animate, motion, useInView, useReducedMotion, AnimatePresence } from 'motion/react'
import { Check as CheckIcon, X } from 'lucide-react'
import logoUrl from '../../design-system/assets/beeline-logo.svg'
import { OFFER_TYPES, type OfferType, type ProviderId } from './data'
import { pickType, reset, update, useStore, type State } from './store'

/* ───────── бренд и шапка сценария ───────── */
export function Brand({ to = '/' }: { to?: string }) {
  return (
    <Link className="brand" to={to} aria-label="Рекламная платформа билайна, на главную">
      <img className="bl-logo" src={logoUrl} alt="" width={44} height={44} />
      <span className="brand__name">рекламная<br />платформа</span>
    </Link>
  )
}

const STEPS = [['охват', '/reach'], ['кампания', '/build'], ['оплата', '/checkout'], ['запуск', '/launch']] as const
export function FlowHead({ step }: { step: number }) {
  return (
    <header className="flow-head">
      <Brand />
      <ol className="bl-steps" aria-label="Шаги">
        {STEPS.map(([t, to], i) => (
          <li key={t} className={i < step ? 'is-done' : i === step ? 'is-current' : ''} aria-current={i === step ? 'step' : undefined}>
            {i < step ? <Link to={to} className="step-link">{t}</Link> : t}
          </li>
        ))}
      </ol>
      <Link className="bl-btn bl-btn--s" to="/cab/campaigns">сохранить и выйти</Link>
    </header>
  )
}

/* ───────── поля выбора ───────── */
type Path = string
function getPath(s: State, path: Path): unknown { return path.split('.').reduce<any>((o, k) => o?.[k], s) }
export function setPath(path: Path, v: unknown) {
  update(s => {
    const ks = path.split('.'); const last = ks.pop()!
    ks.reduce<any>((o, k) => o[k], s)[last] = v
  })
}

export function Check({ path, label, sub, disabled }: { path: Path; label: ReactNode; sub?: ReactNode; disabled?: boolean }) {
  const s = useStore()
  return (
    <label className="bl-check" style={disabled ? { cursor: 'default' } : undefined}>
      <input type="checkbox" checked={!!getPath(s, path)} disabled={disabled} onChange={e => setPath(path, e.target.checked)} />
      <span className="bl-check__box" />
      <span>{label}{sub && <span className="bl-caption" style={{ display: 'block' }}>{sub}</span>}</span>
    </label>
  )
}

export function Radio<T extends string>({ path, value, label, sub, disabled }: { path: Path; value: T; label: ReactNode; sub?: ReactNode; disabled?: boolean }) {
  const s = useStore()
  return (
    <label className={`bl-radio${disabled ? ' is-disabled' : ''}`}>
      <input type="radio" name={path} checked={getPath(s, path) === value} disabled={disabled} onChange={() => setPath(path, value)} />
      <span className="bl-radio__dot" />
      <span>{label}{sub && <span className="bl-caption" style={{ display: 'block' }}>{sub}</span>}</span>
    </label>
  )
}

export function Switch({ path, label }: { path: Path; label: ReactNode }) {
  const s = useStore()
  return (
    <label className="bl-switch">
      <input type="checkbox" checked={!!getPath(s, path)} onChange={e => setPath(path, e.target.checked)} />
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

// Значки провайдеров в стиле иконок приложений, по мотивам оригиналов
const ID_ICONS: Record<ProviderId, ReactNode> = {
  gos: <svg viewBox="0 0 28 28"><rect width="28" height="28" rx="8" fill="#fff" stroke="#E2E6ED" /><path d="M8 7h12v3.6h-8.2V21H8z" fill="#0D4CD3" /><path d="M14.4 13.4H20V21h-5.6z" fill="#EE3F58" /></svg>,
  sber: <svg viewBox="0 0 28 28"><rect width="28" height="28" rx="8" fill="#21A038" /><path d="M21.6 11.2a8 8 0 1 1-2.9-4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" /><path d="m9.4 13.6 3.2 3 8.4-8.2" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  alfa: <svg viewBox="0 0 28 28"><rect width="28" height="28" rx="8" fill="#EF3124" /><path d="M12.4 6h3.2l5 13h-3.1l-1.1-3.1h-4.9L10.4 19H7.4zm-.1 7.6h3.3L14 8.9z" fill="#fff" /><rect x="7.4" y="20.6" width="13.2" height="2" fill="#fff" /></svg>,
}
export function IdBadge({ id }: { id: ProviderId }) {
  return <span className="id-badge" aria-hidden="true">{ID_ICONS[id]}</span>
}

export function DemoNote({ children }: { children: ReactNode }) {
  return <span className="demo-note">{children}</span>
}

/* ───────── фото: файл из public/img или подписанная заглушка ───────── */
export function Photo({ name, label, ratio = '4 / 3', className = '', children }: { name: string; label: string; ratio?: string; className?: string; children?: ReactNode }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={`photo ${className}`} style={{ aspectRatio: ratio }}>
      {!failed
        ? <img src={`${import.meta.env.BASE_URL}img/${name}`} alt={label} loading="lazy" onError={() => setFailed(true)} />
        : <div className="photo__stub" role="img" aria-label={label}><span>{label}</span><code>img/{name}</code></div>}
      {children}
    </div>
  )
}

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

/* ───────── появление при прокрутке ───────── */
export function Reveal({ children, delay = 0, className, as = 'div' }: { children: ReactNode; delay?: number; className?: string; as?: 'div' | 'section' | 'article' }) {
  const M = motion[as]
  return (
    <M className={className} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.5, delay, ease: [0.2, 0.7, 0.2, 1] }}>
      {children}
    </M>
  )
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
          <motion.div className="bl-modal bl-stack" role="dialog" aria-modal="true" aria-label={label} style={{ ['--bl-gap' as string]: '16px' }}
            onClick={e => e.stopPropagation()} initial={{ y: 24, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 24, opacity: 0 }}>
            {onClose && <button className="bl-icon-btn modal-close" onClick={onClose} aria-label="Закрыть"><X size={20} /></button>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ───────── выбор типа оффера: новая кампания и смена типа в сценарии ───────── */
export function TypePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick?: (t: OfferType) => void }) {
  const s = useStore()
  return (
    <Modal open={open} onClose={onClose} label="Тип оффера">
      <h2 className="bl-h2">какой оффер запускаем?</h2>
      <div className="type-grid" role="radiogroup" aria-label="Тип оффера">
        {(Object.entries(OFFER_TYPES) as [OfferType, (typeof OFFER_TYPES)[OfferType]][]).map(([id, o]) => (
          <button key={id} role="radio" aria-checked={s.otype === id} className={`bl-card choice type-opt${id === 'click' ? ' type-opt--main' : ''}`} onClick={() => { pickType(id); onClose(); onPick?.(id) }}>
            <span className="bl-row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><span className="bl-h4">{o.t}</span>{id === 'click' && <span className="bl-tag bl-tag--dark">основной</span>}</span>
            <span className="bl-caption">{o.d}</span>
            <span className="bl-caption">вы платите: <b className="bl-medium">{o.pay}</b></span>
          </button>
        ))}
      </div>
      <p className="bl-micro">Путь одинаковый: охват, условия, оплата или оферта, запуск. Тип можно сменить до запуска.</p>
    </Modal>
  )
}

// Метка типа с кнопкой смены: на охвате, в сборке и в чекауте
export function TypeTag() {
  const s = useStore()
  const [open, setOpen] = useState(false)
  return (
    <span className="bl-row" style={{ gap: 8 }}>
      <span className={`bl-tag${s.otype === 'click' ? ' bl-tag--dark' : ' bl-tag--soft-violet'}`}>{OFFER_TYPES[s.otype].t}</span>
      <button className="bl-btn bl-btn--ghost bl-caption" onClick={() => setOpen(true)}>сменить тип</button>
      <TypePicker open={open} onClose={() => setOpen(false)} />
    </span>
  )
}

/* ───────── QR-заглушка для СБП ───────── */
export function Qr() {
  const cells: ReactNode[] = []
  let seed = 3
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const finder = (x: number, y: number) => {
    const fx = x < 7 ? x : x - 14, fy = y < 7 ? y : y - 14
    if (!((x < 7 || x > 13) && (y < 7 || y > 13)) || (x > 13 && y > 13)) return null
    return fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4)
  }
  for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
    const f = finder(x, y)
    if (f ?? r() > 0.5) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />)
  }
  return <div className="qr"><svg viewBox="0 0 21 21" fill="currentColor" role="img" aria-label="QR-код для оплаты по СБП, заглушка">{cells}</svg></div>
}

/* ───────── карта экранов прототипа ───────── */
export const SCREENS: [string, string, string][] = [
  ['вход и ага-момент', '/', '1 · лендинг'], ['вход и ага-момент', '/login', '2.1 · вход по бизнес-ID'], ['вход и ага-момент', '/inn', '2.1 · без входа: ИНН или сайт'],
  ['вход и ага-момент', '/consent', '2.2 · согласия'], ['вход и ага-момент', '/reach', '2.3 · охват и прогноз'],
  ['сборка кампании', '/build', '3 · автопилот, вручную, медиаплан, спецпроект'],
  ['оплата', '/checkout', '4.1 · чекаут'], ['оплата', '/approve', '4.2 · подтверждение руководителем'],
  ['кампания и рост', '/launch', '5 · ИИ-модерация и запуск'], ['кампания и рост', '/cab/stats', '6 · статистика'],
  ['кампания и рост', '/cab/campaigns', 'кабинет · кампании'], ['кампания и рост', '/cab/balance', 'кабинет · баланс'],
  ['кампания и рост', '/cab/docs', 'кабинет · документы и ЭДО'], ['кампания и рост', '/cab/company', 'кабинет · компания'], ['кампания и рост', '/cab/help', 'кабинет · помощь'],
]
export function DemoMenu() {
  const [open, setOpen] = useState(false)
  const s = useStore()
  const nav = useNavigate()
  const groups = [...new Set(SCREENS.map(x => x[0]))]
  return (
    <>
      <button className="bl-pill-dark demo-fab" onClick={() => setOpen(true)} aria-haspopup="dialog">экраны прототипа</button>
      <Modal open={open} onClose={() => setOpen(false)} label="Карта экранов">
        <h2 className="bl-h2">карта экранов</h2>
        <div className="demo-map">
          {groups.map(g => (
            <div key={g}>
              <h3 className="bl-h4">{g}</h3>
              {SCREENS.filter(x => x[0] === g).map(([, to, t]) => <Link key={to} to={to} onClick={() => setOpen(false)}>{t}</Link>)}
            </div>
          ))}
        </div>
        <hr className="bl-divider" />
        <label className="bl-field"><span className="bl-field__label">тип оффера</span>
          <select className="bl-select" value={s.otype} onChange={e => pickType(e.target.value as OfferType)}>{(Object.keys(OFFER_TYPES) as OfferType[]).map(id => <option key={id} value={id}>{OFFER_TYPES[id].t}</option>)}</select>
        </label>
        <div className="bl-row" style={{ justifyContent: 'space-between' }}>
          <Segmented label="Сегмент" value={s.segment} options={[['small', 'малый'], ['medium', 'средний'], ['large', 'крупный']]} onChange={v => update(x => { x.segment = v; x.tab = null })} />
          <button className="bl-btn bl-btn--s" onClick={() => { reset(); setOpen(false); nav('/') }}>сбросить демо</button>
        </div>
      </Modal>
    </>
  )
}

export function Done({ size = 16 }: { size?: number }) { return <CheckIcon size={size} strokeWidth={2.4} aria-hidden="true" /> }
