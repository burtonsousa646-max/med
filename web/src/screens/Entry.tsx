import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import { ArrowRight, Check, Loader2, MapPin } from 'lucide-react'
import { $api, act, client, queryClient, useCompany, useMe, type OfferType, type S } from '../api'
import { Brand, gap, toast, type IdProvider } from '../ui'
import { ReachMap } from '../mock'

// логотипы с Викисклада (общественное достояние): public/logos
const ID: Record<IdProvider, { logo: string; t: string }> = {
  gos: { logo: 'gosuslugi.svg', t: 'Госуслуги' },
  sber: { logo: 'sber.svg', t: 'СберБизнес ID' },
  alfa: { logo: 'alfabank.svg', t: 'Альфа ID для бизнеса' },
}

// Тип оффера, выбранный до входа (на лендинге), едет в адресе: /login?type=coupon — и запоминается до создания кампании
export function startType(): OfferType {
  const t = new URLSearchParams(location.search).get('type') ?? sessionStorage.getItem('startType')
  return (['click', 'coupon', 'lead', 'promo', 'sub'] as const).find(x => x === t) ?? 'click'
}

/** Вход через бизнес-ID: сервер отдаёт адрес провайдера, браузер уходит туда и возвращается на next. */
export async function loginWith(provider: IdProvider, next: string) {
  const { data, error } = await client.POST('/auth/start', { body: { provider, next } })
  if (error) return toast(error.message)
  location.assign(data.url)
}

export function IdButtons({ next }: { next: string }) {
  const [busy, setBusy] = useState<IdProvider | null>(null)
  return (
    <div className="bl-stack" style={gap('8px')}>
      {(Object.keys(ID) as IdProvider[]).map(id => (
        <button key={id} type="button" className={`id-btn id-btn--${id}`} disabled={!!busy} aria-label={`войти: ${ID[id].t}`}
          onClick={() => { setBusy(id); loginWith(id, next).finally(() => setBusy(null)) }}>
          <img src={`/logos/${ID[id].logo}`} alt="" />
          <span className="id-btn__text">{ID[id].t}</span>
          {busy === id ? <Loader2 size={18} className="spin" /> : <ArrowRight size={18} className="id-btn__go" />}
        </button>
      ))}
    </div>
  )
}

const fmt = (d: string) => '+7' + (d ? ` (${d.slice(0, 3)}` : '') + (d.length > 3 ? `) ${d.slice(3, 6)}` : '') + (d.length > 6 ? `-${d.slice(6, 8)}` : '') + (d.length > 8 ? `-${d.slice(8, 10)}` : '')

function PhoneForm({ next }: { next: string }) {
  const nav = useNavigate()
  const start = $api.useMutation('post', '/auth/phone/start', act)
  const verify = $api.useMutation('post', '/auth/phone/verify', act)
  const [digits, setDigits] = useState('')
  const [code, setCode] = useState('')
  const sent = start.isSuccess
  const phone = '+7' + digits
  const submit = () => sent
    ? verify.mutateAsync({ body: { phone, code } }).then(() => { queryClient.clear(); nav(next) })
    : start.mutate({ body: { phone } })
  return (
    <form className="bl-stack" style={gap('12px')} onSubmit={e => { e.preventDefault(); submit() }}>
      <label className="bl-field">
        <span className="bl-field__label">номер телефона</span>
        <input className="bl-input" type="tel" inputMode="tel" autoComplete="tel" value={digits ? fmt(digits) : ''} placeholder="+7 (900) 000-00-00" autoFocus
          onChange={e => { setDigits(e.target.value.replace(/\D/g, '').replace(/^7/, '').replace(/^8(?=\d)/, '').slice(0, 10)); setCode(''); start.reset() }} />
      </label>
      {sent && (
        <motion.label className="bl-field" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <span className="bl-field__label">код из SMS, отправили на {fmt(digits)}</span>
          <input className="bl-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" autoFocus />
          {start.data?.devCode && <span className="demo-note">SMS пока не отправляются, код: {start.data.devCode}</span>}
        </motion.label>
      )}
      <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={sent ? code.length < 6 || verify.isPending : digits.length < 10 || start.isPending}>{sent ? 'войти' : 'получить код'}</button>
    </form>
  )
}

// справа — так выглядит охват после входа: демо-точки кофейни
const DEMO_POINTS: S['Point'][] = [
  { id: 1, addr: 'Покровка, 12', normalized: '', lat: 55.7587, lon: 37.644, active: true },
  { id: 2, addr: 'Плющиха, 22', normalized: '', lat: 55.7413, lon: 37.5781, active: true },
]
const PERKS = ['охват по вашим точкам — сразу после входа', 'реквизиты подтянем из бизнес-ID', 'договор не нужен: оферта галочкой при оплате']

export function Login() {
  const [q] = useSearchParams()
  const next = q.get('next') ?? '/cabinet'
  useEffect(() => { const t = q.get('type'); if (t) sessionStorage.setItem('startType', t) }, [q])
  return (
    <div className="login">
      <div className="login__form">
        <header className="login__head"><Brand to="/login" /></header>
        <motion.main className="login__body bl-stack" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bl-stack" style={gap('8px')}>
            <h1 className="bl-h1">вход в кабинет</h1>
            <p className="bl-body bl-secondary">Войдите, и мы сразу покажем охват по вашим точкам.</p>
          </div>
          <PhoneForm next={next} />
          <div className="or"><span>или через бизнес-ID — реквизиты заполним сами</span></div>
          <IdButtons next={next} />
          <p className="bl-caption">Договор и ЭДО не нужны. Оферту примете галочкой при оплате.</p>
        </motion.main>
      </div>
      <aside className="v2-backdrop login__aside" aria-hidden="true">
        <motion.div className="v2-window login__preview" initial={{ opacity: 0, y: 30, rotate: 1.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: 0.15, duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}>
          <div className="v2-window__bar"><MapPin size={16} /> охват · кофейня «Зерно»</div>
          <div className="login__map"><ReachMap points={DEMO_POINTS} r={105} /></div>
          <div className="login__stat"><b className="bl-h1">24 800</b><span className="bl-caption">подходящих людей в 1 км от двух точек</span></div>
        </motion.div>
        <ul className="login__perks">
          {PERKS.map(x => <li key={x}><span className="login__check"><Check size={14} strokeWidth={3} /></span>{x}</li>)}
        </ul>
      </aside>
    </div>
  )
}

/** Экраны кабинета — только для вошедших. Не вошёл — на вход с возвратом сюда же. */
export function RequireAuth({ children, company = true }: { children: ReactNode; company?: boolean }) {
  const loc = useLocation()
  const { data: me, isPending, isError } = $api.useQuery('get', '/auth/me', {}, { retry: false })
  if (isPending) return <div className="bl-page wrap" aria-busy="true" />
  const back = encodeURIComponent(loc.pathname + loc.search)
  if (isError || !me) return <Navigate to={`/login?next=${back}`} replace />
  if (me.kind !== 'partner') return <Navigate to="/admin" replace />
  if (company && !me.companyId) return <Navigate to={`/onboarding?next=${back}`} replace />
  return <>{children}</>
}

/** Куда вести после входа: нет компании — добавить; первый раз — проверить данные; иначе — кампании. */
export function Home() {
  const co = useCompany()
  const done = co.consents.some(c => c.kind === 'company') && co.consents.some(c => c.kind === 'signer')
  return <Navigate to={done ? '/cab/campaigns' : '/consent'} replace />
}

export function Onboarding() {
  const nav = useNavigate(), me = useMe()
  const [q] = useSearchParams()
  const add = $api.useMutation('post', '/auth/companies', act)
  const pick = $api.useMutation('post', '/auth/company', act)
  const [inn, setInn] = useState('')
  const ok = /^\d{10}(\d{2})?$/.test(inn)
  const next = q.get('next') ?? '/cabinet'
  const companies = me.kind === 'partner' ? me.companies : []
  return (
    <div className="bl-page">
      <header className="bl-header"><div className="bl-header__side"><Brand to="/login" /></div></header>
      <main className="center">
        <div className="bl-modal bl-stack" style={gap('16px')}>
          {companies.length > 0 && <>
            <h1 className="bl-h2">выберите компанию</h1>
            {companies.map(c => (
              <button key={c.id} className="bl-btn bl-btn--l bl-btn--block" onClick={() => pick.mutateAsync({ body: { companyId: c.id } }).then(() => nav(next))}>{c.name} · ИНН {c.inn}</button>
            ))}
            <hr className="bl-divider" />
          </>}
          <h2 className="bl-h2">добавьте компанию по ИНН</h2>
          <form className="bl-stack" style={gap('12px')} onSubmit={e => { e.preventDefault(); if (ok) add.mutateAsync({ body: { inn } }).then(() => nav('/consent')) }}>
            <label className="bl-field">
              <span className="bl-field__label">ИНН компании или ИП</span>
              <input className="bl-input" inputMode="numeric" value={inn} onChange={e => setInn(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="7701234567" autoFocus />
            </label>
            <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={!ok || add.isPending}>добавить</button>
          </form>
          <p className="bl-caption">Реквизиты проверим по ЕГРЮЛ. Оферту и оплату подтвердит руководитель через бизнес-ID. Если компания уже подключена — попросите владельца пригласить вас.</p>
        </div>
      </main>
    </div>
  )
}

export function Invite() {
  const token = useParams().token!, nav = useNavigate()
  const accept = $api.useMutation('post', '/auth/invitations/{token}/accept', {
    onSuccess: () => { queryClient.clear(); toast('Вы в компании'); nav('/cab/campaigns') },
    onError: (e: unknown) => toast((e as { message?: string })?.message ?? 'приглашение не найдено'),
  })
  return (
    <div className="bl-page">
      <header className="bl-header"><div className="bl-header__side"><Brand /></div></header>
      <main className="center">
        <div className="bl-modal bl-stack" style={gap('16px')}>
          <h1 className="bl-h2">вас пригласили в компанию</h1>
          <p className="bl-body bl-secondary">Примите приглашение, и компания появится в кабинете.</p>
          <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={accept.isPending} onClick={() => accept.mutate({ params: { path: { token } } })}>принять приглашение</button>
          <Link to="/cab/campaigns" className="bl-caption">не сейчас</Link>
        </div>
      </main>
    </div>
  )
}
