import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import { Loader2 } from 'lucide-react'
import { $api, act, client, queryClient, useCompany, useMe, type OfferType } from '../api'
import { Brand, IdBadge, gap, toast, type IdProvider } from '../ui'

const LABEL: Record<IdProvider, string> = { gos: 'войти через Госуслуги', sber: 'войти по СберБизнес ID', alfa: 'войти через Альфа ID' }

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
      {(Object.keys(LABEL) as IdProvider[]).map(id => (
        <button key={id} className={`bl-btn bl-btn--l bl-btn--block id-btn id-btn--${id}`} disabled={!!busy} onClick={() => { setBusy(id); loginWith(id, next).finally(() => setBusy(null)) }}>
          <IdBadge id={id} /><span className="id-btn__text">{LABEL[id]}</span>
          {busy === id && <Loader2 size={20} className="spin" />}
        </button>
      ))}
    </div>
  )
}

function EmailForm({ next }: { next: string }) {
  const nav = useNavigate()
  const start = $api.useMutation('post', '/auth/email/start', act)
  const verify = $api.useMutation('post', '/auth/email/verify', act)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const sent = start.isSuccess
  const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
  const submit = () => sent
    ? verify.mutateAsync({ body: { email, code } }).then(() => { queryClient.clear(); nav(next) })
    : start.mutate({ body: { email } })
  return (
    <form className="bl-stack" style={gap('12px')} onSubmit={e => { e.preventDefault(); submit() }}>
      <label className="bl-field">
        <span className="bl-field__label">рабочая почта</span>
        <input className="bl-input" type="email" autoComplete="email" value={email} onChange={e => { setEmail(e.target.value); start.reset() }} placeholder="you@company.ru" />
      </label>
      {sent && (
        <motion.label className="bl-field" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <span className="bl-field__label">код из письма, отправили на {email}</span>
          <input className="bl-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" autoFocus />
        </motion.label>
      )}
      <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={sent ? code.length < 6 || verify.isPending : !ok || start.isPending}>{sent ? 'войти' : 'получить код'}</button>
    </form>
  )
}

export function Login() {
  const [q] = useSearchParams()
  const next = q.get('next') ?? '/cabinet'
  useEffect(() => { const t = q.get('type'); if (t) sessionStorage.setItem('startType', t) }, [q])
  return (
    <div className="bl-page">
      <header className="bl-header"><div className="bl-header__side"><Brand to="/login" /></div></header>
      <main className="center">
        <motion.div className="bl-modal bl-stack" style={gap('16px')} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="bl-h2">войдите, и мы покажем охват по вашим точкам</h1>
          <IdButtons next={next} />
          <p className="bl-caption">Через бизнес-ID реквизиты заполнятся сами, и вы сразу сможете принять оферту.</p>
          <div className="or"><span>или по почте — например, для бухгалтера</span></div>
          <EmailForm next={next} />
          <p className="bl-micro">Договор и ЭДО не нужны. Оферту примете галочкой при оплате.</p>
        </motion.div>
      </main>
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
