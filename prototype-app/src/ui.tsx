import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { animate, motion, useInView, useReducedMotion, AnimatePresence } from 'motion/react'
import { Check as CheckIcon, X } from 'lucide-react'
import logoUrl from '../../design-system/assets/beeline-logo.svg'
import { $api, act, queryClient, useCampaigns, useCatalog, useCompany, type S } from './api'

/* ───────── бренд и шапка сценария ───────── */
export function Brand({ to = '/' }: { to?: string }) {
  return (
    <Link className="brand" to={to} aria-label="Рекламная платформа билайна, на главную">
      <img className="bl-logo" src={logoUrl} alt="" width={44} height={44} />
      <span className="brand__name">рекламная<br />платформа</span>
    </Link>
  )
}

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

// Значки провайдеров в стиле иконок приложений, по мотивам оригиналов
const ID_ICONS: Record<Exclude<S['ProviderId'], 'inn'>, ReactNode> = {
  gos: <svg viewBox="0 0 28 28"><rect width="28" height="28" rx="8" fill="#fff" stroke="#E2E6ED" /><path d="M8 7h12v3.6h-8.2V21H8z" fill="#0D4CD3" /><path d="M14.4 13.4H20V21h-5.6z" fill="#EE3F58" /></svg>,
  sber: <svg viewBox="0 0 28 28"><rect width="28" height="28" rx="8" fill="#21A038" /><path d="M21.6 11.2a8 8 0 1 1-2.9-4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" /><path d="m9.4 13.6 3.2 3 8.4-8.2" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  alfa: <svg viewBox="0 0 28 28"><rect width="28" height="28" rx="8" fill="#EF3124" /><path d="M12.4 6h3.2l5 13h-3.1l-1.1-3.1h-4.9L10.4 19H7.4zm-.1 7.6h3.3L14 8.9z" fill="#fff" /><rect x="7.4" y="20.6" width="13.2" height="2" fill="#fff" /></svg>,
}
export function IdBadge({ id }: { id: Exclude<S['ProviderId'], 'inn'> }) {
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
export function TypePicker({ open, value, onClose, onPick }: { open: boolean; value?: S['OfferType']; onClose: () => void; onPick: (t: S['OfferType']) => void }) {
  const { offerTypes } = useCatalog()
  return (
    <Modal open={open} onClose={onClose} label="Тип оффера">
      <h2 className="bl-h2">какой оффер запускаем?</h2>
      <div className="type-grid" role="radiogroup" aria-label="Тип оффера">
        {offerTypes.map(o => (
          <button key={o.id} role="radio" aria-checked={value === o.id} className={`bl-card choice type-opt${o.id === 'click' ? ' type-opt--main' : ''}`} onClick={() => { onClose(); onPick(o.id) }}>
            <span className="bl-row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><span className="bl-h4">{o.t}</span>{o.id === 'click' && <span className="bl-tag bl-tag--dark">основной</span>}</span>
            <span className="bl-caption">{o.d}</span>
            <span className="bl-caption">вы платите: <b className="bl-medium">{o.pay}</b></span>
          </button>
        ))}
      </div>
      <p className="bl-micro">Путь одинаковый: охват, условия, оплата или оферта, запуск. Тип можно сменить до запуска.</p>
    </Modal>
  )
}

// Метка типа с кнопкой смены: на охвате, в сборке
export function TypeTag({ c }: { c: S['Campaign'] }) {
  const [open, setOpen] = useState(false)
  const T = useCatalog().offerTypes.find(t => t.id === c.type)!
  const patch = $api.useMutation('patch', '/campaigns/{id}', act)
  return (
    <span className="bl-row" style={{ gap: 8 }}>
      <span className={`bl-tag${c.type === 'click' ? ' bl-tag--dark' : ' bl-tag--soft-violet'}`}>{T.t}</span>
      {c.status === 'draft' && <button className="bl-btn bl-btn--ghost bl-caption" onClick={() => setOpen(true)}>сменить тип</button>}
      <TypePicker open={open} value={c.type} onClose={() => setOpen(false)} onPick={type => patch.mutate({ params: { path: { id: c.id } }, body: { type } })} />
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
// :id — последняя кампания, :token — её ссылка на подтверждение
export const SCREENS: [string, string, string][] = [
  ['вход и ага-момент', '/', '1 · лендинг'], ['вход и ага-момент', '/login', '2.1 · вход по бизнес-ID'], ['вход и ага-момент', '/inn', '2.1 · без входа: ИНН или сайт'],
  ['вход и ага-момент', '/consent', '2.2 · согласия'], ['вход и ага-момент', '/c/:id/reach', '2.3 · охват и прогноз'],
  ['сборка кампании', '/c/:id/build', '3 · автопилот, вручную, медиаплан, спецпроект'],
  ['оплата', '/c/:id/checkout', '4.1 · чекаут'], ['оплата', '/approve/:token', '4.2 · подтверждение руководителем'],
  ['кампания и рост', '/c/:id/launch', '5 · ИИ-модерация и запуск'], ['кампания и рост', '/cab/stats', '6 · статистика'],
  ['кампания и рост', '/cab/campaigns', 'кабинет · кампании'], ['кампания и рост', '/cab/balance', 'кабинет · баланс'],
  ['кампания и рост', '/cab/docs', 'кабинет · документы и ЭДО'], ['кампания и рост', '/cab/company', 'кабинет · компания'], ['кампания и рост', '/cab/help', 'кабинет · помощь'],
]
export const screenName = (pathname: string) => SCREENS.find(s => s[1] === pathname.replace(/^\/c\/\d+/, '/c/:id').replace(/^\/approve\/.+/, '/approve/:token'))?.[2]

export function DemoMenu() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="bl-pill-dark demo-fab" onClick={() => setOpen(true)} aria-haspopup="dialog">экраны прототипа</button>
      <Modal open={open} onClose={() => setOpen(false)} label="Карта экранов">{open && <DemoMap close={() => setOpen(false)} />}</Modal>
    </>
  )
}

function DemoMap({ close }: { close: () => void }) {
  const nav = useNavigate()
  const cat = useCatalog(), co = useCompany(), all = useCampaigns(), last = all[0], token = all.find(c => c.approvalToken)?.approvalToken
  const patchCo = $api.useMutation('patch', '/company', act)
  const patchC = $api.useMutation('patch', '/campaigns/{id}', act)
  const reset = $api.useMutation('post', '/session/reset', { onSuccess: () => { queryClient.clear(); close(); nav('/') } })
  const groups = [...new Set(SCREENS.map(x => x[0]))]
  const href = (to: string) => to.replace(':id', String(last?.id ?? '')).replace(':token', token ?? '')
  return (
    <>
      <h2 className="bl-h2">карта экранов</h2>
      <div className="demo-map">
        {groups.map(g => (
          <div key={g}>
            <h3 className="bl-h4">{g}</h3>
            {SCREENS.filter(x => x[0] === g).map(([, to, t]) => (to.includes(':id') && !last) || (to.includes(':token') && !token)
              ? <span key={to} className="bl-secondary" title={to.includes(':token') ? 'появится, когда сотрудник отправит кампанию руководителю' : 'нет кампаний'}>{t}</span>
              : <Link key={to} to={href(to)} onClick={close}>{t}</Link>)}
          </div>
        ))}
      </div>
      <hr className="bl-divider" />
      {last && (
        <label className="bl-field"><span className="bl-field__label">тип оффера последней кампании</span>
          <select className="bl-select" value={last.type} onChange={e => patchC.mutate({ params: { path: { id: last.id } }, body: { type: e.target.value as S['OfferType'] } })}>{cat.offerTypes.map(t => <option key={t.id} value={t.id}>{t.t}</option>)}</select>
        </label>
      )}
      <div className="bl-row" style={{ justifyContent: 'space-between' }}>
        <Segmented label="Сегмент" value={co.segment} options={[['small', 'малый'], ['medium', 'средний'], ['large', 'крупный']]} onChange={v => patchCo.mutate({ body: { segment: v } })} />
        <button className="bl-btn bl-btn--s" onClick={() => reset.mutate({})}>сбросить демо</button>
      </div>
    </>
  )
}

export function Done({ size = 16 }: { size?: number }) { return <CheckIcon size={size} strokeWidth={2.4} aria-hidden="true" /> }
