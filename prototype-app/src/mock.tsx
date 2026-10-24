import { useMemo } from 'react'
import { motion } from 'motion/react'
import { BatteryLow, Check, Gift, Wifi } from 'lucide-react'
import { CO, IMAGES, type Point } from './data'

export type Surface = 'showcase' | 'main' | 'paid' | 'rest'
export type Ad = { brand: string; text: string; offer: string; img: number; addr?: string; cta?: string }

export const DEMO_AD: Ad = { brand: CO.brand, text: 'Свежая обжарка каждый день — в двух шагах от дома', offer: '−20% до 10:00', img: 0, addr: 'ул. Покровка, 12 · 300 м' }

/* Экран приложения билайна с рекламным слотом. Нарисован токенами, без картинок. */
export function PhoneSurface({ kind, ad = DEMO_AD, compact }: { kind: Surface; ad?: Ad; compact?: boolean }) {
  return (
    <div className={`phone-mock${compact ? ' phone-mock--compact' : ''}`}>
      <div className="phone-mock__status"><span>9:41</span><span className="bl-row" style={{ gap: 4 }}><Wifi size={12} /><BatteryLow size={14} /></span></div>
      {kind === 'main' && (
        <>
          <div className="pm-title">билайн</div>
          <div className="pm-tiles"><span /><span /><span /></div>
          <div className="pm-banner">
            <div className={`ad-img ad-img--${ad.img}`}>{IMAGES[ad.img]}</div>
            <div className="pm-banner__text"><b>{ad.brand}</b><span>{ad.text}</span></div>
            <span className="pm-label">реклама</span>
          </div>
          <div className="pm-lines"><span /><span /><span /></div>
        </>
      )}
      {kind === 'showcase' && (
        <>
          <div className="pm-title">витрина выгод</div>
          <div className="pm-chips"><span className="is-on">рядом</span><span>еда</span><span>авто</span></div>
          <div className="pm-card">
            <div className={`ad-img ad-img--${ad.img}`} style={{ aspectRatio: '2' }}>{IMAGES[ad.img]}</div>
            <b>{ad.offer}</b>
            <span className="pm-muted">{ad.brand}{ad.addr ? ` · ${ad.addr}` : ''}</span>
            <span className="pm-btn">{ad.cta ?? 'сохранить купон'}</span>
            <span className="pm-label">реклама</span>
          </div>
          <div className="pm-card pm-card--ghost"><span /><span /></div>
        </>
      )}
      {kind === 'paid' && (
        <>
          <div className="pm-ok"><i><Check size={22} strokeWidth={3} /></i><b>платёж прошёл</b><span className="pm-muted">500 ₽ · пополнение счёта</span></div>
          <div className="pm-card" style={{ marginTop: 'auto' }}>
            <span className="pm-muted">вам может пригодиться</span>
            <b>{ad.brand}</b>
            <span>{ad.text}</span>
            <span className="pm-btn">{ad.offer}</span>
            <span className="pm-label">реклама</span>
          </div>
        </>
      )}
      {kind === 'rest' && (
        <>
          <div className="pm-title">остатки</div>
          <div className="pm-meter"><span>интернет</span><b>0,4 ГБ</b><div className="pm-bar"><span style={{ width: '8%' }} /></div></div>
          <div className="pm-meter"><span>минуты</span><b>210</b><div className="pm-bar"><span style={{ width: '60%' }} /></div></div>
          <div className="pm-card pm-card--reward">
            <span className="bl-row" style={{ gap: 6 }}><Gift size={16} /><b>+1 ГБ за визит</b></span>
            <span>{ad.brand}: {ad.offer.toLowerCase()}</span>
            <span className="pm-btn">получить</span>
            <span className="pm-label">реклама</span>
          </div>
        </>
      )}
    </div>
  )
}

/* Карта охвата: улицы, точки, радиус 1 км и люди внутри */
export function ReachMap({ points, on, onToggle }: { points: Point[]; on: Record<string, boolean>; onToggle?: (id: string) => void }) {
  const dots = useMemo(() => {
    let seed = 7
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
    return points.flatMap(p => Array.from({ length: 34 }, (_, i) => {
      const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 100
      return { id: `${p.id}-${i}`, p: p.id, x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, d: rnd() }
    }))
  }, [points])
  return (
    <svg className="reach-map" viewBox="0 0 640 480" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Карта охвата: ${points.filter(p => on[p.id] !== false).length} точки и радиус 1 км`}>
      <rect width="640" height="480" fill="var(--color-background-primary)" />
      <g fill="var(--color-background-tertiary)" opacity=".55">
        {Array.from({ length: 48 }, (_, i) => <rect key={i} x={(i % 8) * 82 + 6} y={Math.floor(i / 8) * 82 + 6} width="66" height="62" rx="8" />)}
      </g>
      <path d="M-10 70 Q 140 30 270 80 T 540 50 L 660 60" stroke="var(--color-surface-03)" strokeWidth="26" fill="none" />
      <rect x="520" y="360" width="120" height="120" rx="16" fill="var(--color-surface-01)" />
      <g stroke="var(--color-background-secondary)" strokeWidth="10" fill="none" strokeLinecap="round">
        <path d="M-10 150 Q 200 120 320 230 T 660 270" /><path d="M80 -10 L 160 500" /><path d="M380 -10 Q 360 200 420 500" /><path d="M-10 400 L 660 350" />
      </g>
      {points.map(p => on[p.id] === false ? null : (
        <motion.circle key={`r-${p.id}`} cx={p.x} cy={p.y} r="105" fill="var(--color-static-blue-500)" fillOpacity=".08" stroke="var(--color-static-blue-500)" strokeDasharray="6 6" strokeWidth="2"
          initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6 }} style={{ transformOrigin: `${p.x}px ${p.y}px` }} />
      ))}
      {dots.map(d => on[d.p] === false ? null : (
        <motion.circle key={d.id} cx={d.x} cy={d.y} r="3.2" fill="var(--color-static-blue-500)"
          initial={{ opacity: 0 }} animate={{ opacity: [0.25, 0.75, 0.25] }} transition={{ duration: 3, delay: d.d * 2, repeat: Infinity }} />
      ))}
      {points.map(p => (
        <g key={p.id} opacity={on[p.id] === false ? 0.35 : 1} style={{ cursor: onToggle ? 'pointer' : undefined }} onClick={() => onToggle?.(p.id)}>
          <circle cx={p.x} cy={p.y} r="16" fill="var(--color-background-secondary-invert)" />
          <circle cx={p.x} cy={p.y} r="6" fill="var(--color-static-white)" />
          <rect x={p.x - 76} y={p.y - 50} width="152" height="26" rx="13" fill="var(--color-background-secondary)" />
          <text x={p.x} y={p.y - 32} textAnchor="middle" fontSize="14" fill="var(--color-text-primary)" fontFamily="var(--font-primary)">{p.addr}</text>
        </g>
      ))}
    </svg>
  )
}
