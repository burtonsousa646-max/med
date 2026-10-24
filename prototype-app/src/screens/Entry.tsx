import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import { ArrowLeft, Loader2, Search } from 'lucide-react'
import { $api, act, useCatalog, useCompany, type S } from '../api'
import { Brand, IdBadge } from '../ui'

type IdProvider = Exclude<S['ProviderId'], 'inn'>
const LABEL: Record<IdProvider, string> = { gos: 'войти через Госуслуги', sber: 'войти по СберБизнес ID', alfa: 'войти через Альфа ID' }

// Тип оффера, выбранный на лендинге, едет через вход в адресе: /login?type=coupon
export function useStartType(): S['OfferType'] {
  const t = useSearchParams()[0].get('type')
  return useCatalog().offerTypes.some(o => o.id === t) ? (t as S['OfferType']) : 'click'
}

// Создать кампанию выбранного типа и перейти к охвату
export function useStart() {
  const nav = useNavigate(), type = useStartType()
  const create = $api.useMutation('post', '/campaigns', act)
  return () => create.mutateAsync({ body: { type } }).then(c => nav(`/c/${c.id}/reach`))
}

export function IdButtons({ onPick, busy }: { onPick: (id: IdProvider) => void; busy?: IdProvider | null }) {
  return (
    <div className="bl-stack" style={{ ['--bl-gap' as string]: '8px' }}>
      {(Object.keys(LABEL) as IdProvider[]).map(id => (
        <button key={id} className={`bl-btn bl-btn--l bl-btn--block id-btn id-btn--${id}`} disabled={!!busy} onClick={() => onPick(id)}>
          <IdBadge id={id} /><span className="id-btn__text">{LABEL[id]}</span>
          {busy === id && <Loader2 size={20} className="spin" />}
        </button>
      ))}
    </div>
  )
}

function PhoneForm() {
  const nav = useNavigate(), type = useStartType()
  const login = $api.useMutation('post', '/session/login', act)
  const [phone, setPhone] = useState('')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const digits = phone.replace(/\D/g, '').replace(/^[78]/, '').slice(0, 10)
  const fmt = (d: string) => '+7' + (d ? ` (${d.slice(0, 3)}` : '') + (d.length > 3 ? `) ${d.slice(3, 6)}` : '') + (d.length > 6 ? `-${d.slice(6, 8)}` : '') + (d.length > 8 ? `-${d.slice(8, 10)}` : '')
  const ok = digits.length === 10
  const enter = () => login.mutateAsync({ body: { provider: 'inn' } }).then(() => nav(`/inn?type=${type}`))
  return (
    <form className="bl-stack" style={{ ['--bl-gap' as string]: '12px' }} onSubmit={e => { e.preventDefault(); if (!sent && ok) setSent(true); else if (code.length === 4) enter() }}>
      <label className="bl-field">
        <span className="bl-field__label">номер телефона</span>
        <input className="bl-input" type="tel" inputMode="tel" autoComplete="tel" value={digits ? fmt(digits) : phone} onChange={e => { setPhone(e.target.value); setSent(false) }} placeholder="+7 (900) 000-00-00" autoFocus />
      </label>
      {sent && (
        <motion.label className="bl-field" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <span className="bl-field__label">код из SMS, отправили на {fmt(digits)}</span>
          <input className="bl-input" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="0000" autoFocus />
        </motion.label>
      )}
      <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={sent ? code.length < 4 : !ok}>{sent ? 'войти' : 'получить код'}</button>
    </form>
  )
}

export function Login() {
  const nav = useNavigate(), type = useStartType()
  const T = useCatalog().offerTypes.find(o => o.id === type)!
  const login = $api.useMutation('post', '/session/login', act)
  const [busy, setBusy] = useState<IdProvider | null>(null)
  // пауза — имитация окна бизнес-ID
  const pick = (id: IdProvider) => {
    setBusy(id)
    setTimeout(() => login.mutateAsync({ body: { provider: id } }).then(() => nav(`/consent?type=${type}`)), 1300)
  }
  const short = useCatalog().providers.find(p => p.id === busy)?.short
  return (
    <div className="bl-page">
      <header className="bl-header"><div className="bl-header__side"><Brand /></div><Link className="bl-btn" to="/"><ArrowLeft size={18} />на главную</Link></header>
      <main className="center">
        <motion.div className="bl-modal bl-stack" style={{ ['--bl-gap' as string]: '16px' }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          {type !== 'click' && <span className="bl-tag bl-tag--soft-violet" style={{ alignSelf: 'flex-start' }}>подключаем: {T.t}</span>}
          <h1 className="bl-h2">войдите, и мы покажем охват по вашим точкам</h1>
          <PhoneForm />
          <div className="or"><span>или через бизнес-ID, реквизиты заполним сами</span></div>
          <IdButtons onPick={pick} busy={busy} />
          {busy && <p className="bl-caption" role="status">Подтвердите вход в {short}. Обычно это 10 секунд.</p>}
          <hr className="bl-divider" />
          <Link to={`/inn?type=${type}`}>ввести ИНН или сайт без входа</Link>
          <p className="bl-micro">Договор и ЭДО не нужны. Оферту примете галочкой при оплате.</p>
        </motion.div>
      </main>
    </div>
  )
}

export function Inn() {
  const co = useCompany(), start = useStart(), type = useStartType()
  const login = $api.useMutation('post', '/session/login', act)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (q.trim().length < 3) return
    setLoading(true)
    const t = setTimeout(() => setLoading(false), 500)
    return () => clearTimeout(t)
  }, [q])
  const found = q.trim().length >= 3 && !loading
  return (
    <div className="bl-page">
      <header className="bl-header"><div className="bl-header__side"><Brand /></div><Link className="bl-btn" to={`/login?type=${type}`}>войти по бизнес-ID</Link></header>
      <main className="center">
        <div className="bl-modal bl-stack" style={{ ['--bl-gap' as string]: '16px' }}>
          <h1 className="bl-h2">найдём компанию по ИНН или сайту</h1>
          <label className="bl-field">
            <span className="bl-field__label">ИНН, название или сайт</span>
            <span className="bl-search" style={{ minHeight: 56, borderRadius: 'var(--radius-400)' }}>
              <Search aria-hidden="true" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="7701234567 или mycoffee.ru" autoComplete="off" autoFocus />
              {loading && <Loader2 size={18} className="spin" />}
            </span>
          </label>
          {found && (
            <motion.div className="suggest" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
              <button onClick={() => login.mutateAsync({ body: { provider: 'inn' } }).then(start)}>
                <span className="bl-medium">{co.name}</span>
                <span className="bl-caption" style={{ display: 'block' }}>ИНН {co.inn} · {co.site} · {co.points.length} точки в Москве</span>
              </button>
            </motion.div>
          )}
          {q.trim().length > 0 && q.trim().length < 3 && <p className="bl-caption">Введите хотя бы 3 символа</p>}
          <p className="bl-caption">Покажем охват по открытым данным. Для оплаты понадобится вход по бизнес-ID.</p>
        </div>
      </main>
    </div>
  )
}
