import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, Outlet, useLocation, useOutletContext } from 'react-router'
import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowLeft, Building2 } from 'lucide-react'
import { Brand, toast } from '../ui'
import { autocompleteInn, queryClient } from '../api'
import { analytics } from '../analytics'
import { innError } from '../../shared/campaign-business'
import { normalizeCampaignEmail } from '../../shared/campaign-draft'
import type { MvpSession, Profile } from '../../shared/mvp-promo'
import { demoCode, demoCompany, demoEmail, demoStaffEmail, mockPartnerRequest, partnerDemo } from './mvp-demo'
import { LoginAside } from './Entry'

const base = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '') + '/mvp'
export const sessionKey = ['mvp-partner-session']
export async function mvpRequest<T>(path: string, body?: object, owner?: string): Promise<T> {
  if (partnerDemo) return mockPartnerRequest(path,body) as T
  const response = await fetch(base + path, { credentials: 'include', cache: 'no-store',
    headers: { ...(body && { 'Content-Type': 'application/json' }), ...(owner && { 'X-Mvp-Account': owner }) },
    ...(body && { method: 'POST', body: JSON.stringify(body) }) })
  if (response.status === 401 && path === '/session') return null as T
  if (!response.ok) {
    if (response.status === 401 && path !== '/verify') queryClient.setQueryData(sessionKey, null)
    const error = await response.json().catch(() => null)
    throw new Error(error?.message ?? 'Сервер недоступен. Попробуйте ещё раз')
  }
  return response.json()
}
export const useMvpSession = () => useOutletContext<MvpSession>()
export const draftKey = (session: MvpSession) => 'mvp-draft-' + session.email + '-' + session.profile!.inn
export const errorMessage = (e: unknown) => e instanceof Error ? e.message : 'Попробуйте ещё раз'
export function MvpShell() {
  const { pathname, search } = useLocation()
  const session = useQuery({ queryKey: sessionKey, queryFn: () => mvpRequest<MvpSession | null>('/session'), retry: false, gcTime: 0 })
  if (session.isPending) return <p role="status" className="bl-page wrap">Открываем кабинет…</p>
  if (session.error) return <div className="bl-page wrap"><p role="alert">{errorMessage(session.error)}</p><button className="bl-btn" onClick={() => void session.refetch()}>Повторить</button></div>
  const entry = pathname === '/app/' || pathname === '/app'
  const staff = pathname === '/app/staff' || pathname.startsWith('/app/staff/')
  const choice = new URLSearchParams(search).get('preview')
  if (partnerDemo && entry && session.data && ((choice === 'staff' && !session.data.role) || (choice === 'partner' && session.data.role))) {
    return <Outlet key={choice} context={null}/>
  }
  if (session.data?.role && !staff) return <Navigate to="/app/staff" replace/>
  if (!session.data?.role && staff) return <Navigate to={partnerDemo && !session.data ? '/app/?preview=staff' : '/app/'} replace/>
  if (!session.data?.role && !session.data?.profile && !entry) return <Navigate to="/app/" replace/>
  if (session.data?.profile && entry) return <Navigate to="/app/campaigns" replace/>
  return <Outlet key={JSON.stringify([session.data?.email, session.data?.profile?.inn])} context={session.data}/>
}

export function LogoutButton() {
  const session = useMvpSession()
  const [busy, setBusy] = useState(false)
  async function logout() {
    setBusy(true)
    try {
      await mvpRequest('/logout', {}, session.email)
      try { sessionStorage.removeItem(draftKey(session)) } catch { /* Storage may be unavailable. */ }
      queryClient.removeQueries({queryKey:['mvp-campaigns']})
      queryClient.removeQueries({queryKey:['mvp-receipt']})
      queryClient.setQueryData(sessionKey, null)
      location.assign('/')
    } catch (e) { toast(errorMessage(e)); setBusy(false) }
  }
  return <button className="bl-btn bl-btn--s" disabled={busy} onClick={logout}>Выйти</button>
}

export function Head() {
  const session = useMvpSession()
  return <header className="bl-header"><div className="bl-header__side"><Brand to="/"/></div>
    <div className="bl-row mvp-me"><Link className="bl-btn bl-btn--s" to="/app/campaigns">Мои кампании</Link>
      <Link to="/app/company" className="mvp-account ym-hide-content" aria-label={'Компания · ' + session.profile!.company} title="Компания">
        <Building2 size={18} aria-hidden="true"/><span className="bl-caption"><b>{session.profile!.company}</b><br/>{session.email}</span>
      </Link>
      <LogoutButton/></div></header>
}

const pendingLoginKey = partnerDemo ? 'mvp-demo-email-challenge' : 'mvp-email-challenge'
type PendingLogin = {email:string; challenge:string; expiresAt:number}

function pendingLogin(): PendingLogin | null {
  try {
    const item = JSON.parse(sessionStorage.getItem(pendingLoginKey) ?? 'null')
    return item && typeof item.email === 'string' && normalizeCampaignEmail(item.email)
      && typeof item.challenge === 'string' && item.expiresAt > Date.now() ? item : null
  } catch { return null }
}

function rememberLogin(value: PendingLogin | null) {
  try {
    if (value) sessionStorage.setItem(pendingLoginKey, JSON.stringify(value))
    else sessionStorage.removeItem(pendingLoginKey)
  } catch { /* The current tab can still complete sign-in without storage. */ }
}

const previewOrigin = 'http://127.0.0.1:5184'
const previewAccounts = {partner:'partner@example.test',staff:'staff@example.test'} as const

const perks = ['без пароля: код придёт на почту', 'ИНН понадобится при первом входе', 'оферту можно принять при отправке кампании']
export function MvpLogin() {
  const session = useOutletContext<MvpSession | null>()
  const localPreview = location.origin === previewOrigin || location.origin === 'http://localhost:5184'
  const previewRole = localPreview || partnerDemo ? new URLSearchParams(location.search).get('preview') : null
  const staffDemo = partnerDemo && previewRole === 'staff'
  const previewEmail = previewRole === 'partner' || previewRole === 'staff' ? previewAccounts[previewRole] : ''
  const [saved] = useState(() => {
    const item = pendingLogin()
    const expected = previewEmail || (partnerDemo ? demoEmail : '')
    return expected && item?.email !== expected ? null : item
  })
  const [email, setEmail] = useState(partnerDemo ? (staffDemo ? demoStaffEmail : demoEmail) : saved?.email ?? previewEmail), [code, setCode] = useState(''), [challenge, setChallenge] = useState(saved?.challenge ?? '')
  const testRole = email.toLowerCase() === previewAccounts.partner ? 'partner' : email.toLowerCase() === previewAccounts.staff ? 'staff' : null
  const openTestLogin = import.meta.env.DEV && location.origin === 'http://127.0.0.1:5173' && testRole
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const pending = useRef(false)
  const step = session ? 'inn' : challenge ? 'code' : 'email'
  useEffect(() => { analytics.view('/app/') }, [])
  async function submit(resend = false) {
    if (pending.current) return
    if (step === 'email' && openTestLogin) {
      location.assign(previewOrigin + '/app/?preview=' + testRole)
      return
    }
    pending.current = true; setBusy(true); setError('')
    try {
      if (step === 'email' || resend) {
        const result = await mvpRequest<{challenge:string}>('/code', { email })
        rememberLogin({email,challenge:result.challenge,expiresAt:Date.now()+600_000})
        setChallenge(result.challenge); setCode(''); analytics.event('mvp_code_sent')
      } else if (step === 'code') {
        await mvpRequest('/verify', { email, code, challenge })
        const verified = await mvpRequest<MvpSession | null>('/session')
        if (!verified) throw new Error('Не удалось сохранить вход. Проверьте, разрешены ли в браузере cookies для кабинета.')
        rememberLogin(null)
        analytics.event('mvp_email_verified')
        queryClient.setQueryData(sessionKey, verified)
      }
    } catch (e) { setError(errorMessage(e)) }
    finally { pending.current = false; setBusy(false) }
  }
  const allowed = step === 'email' ? !!normalizeCampaignEmail(email) : code.length === 6
  const requestLabel = partnerDemo ? 'Получить тестовый код' : openTestLogin ? 'Перейти к тестовому входу' : 'получить код'
  return <div className="login"><div className="login__form">
    <header className="login__head"><Brand to="/"/><Link className="bl-btn bl-btn--ghost" to="/"><ArrowLeft size={18}/>на главную</Link></header>
    <motion.main key={step} className="login__body bl-stack ym-hide-content ym-disable-keys" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}}>
      <ol className="mvp-dots" aria-label={'шаг ' + (['email','code','inn'].indexOf(step)+1) + ' из 3'}>
        {['email','code','inn'].map((s,i) => <li key={s} className={i <= ['email','code','inn'].indexOf(step) ? 'is-on' : ''}/>)}</ol>
      <h1 className="bl-h1">{{ email: 'вход в кабинет', code: partnerDemo ? 'тестовый код' : 'проверьте почту', inn: 'ваша компания' }[step]}</h1>
      <p className="bl-body bl-secondary">{{ email: partnerDemo ? (staffDemo ? 'Демо-вход сотрудника. ' : 'Демо-вход партнёра. ')+'Тестовый код появится на следующем шаге.' : 'Пришлём одноразовый код на вашу рабочую почту.', code: partnerDemo ? 'Введите тестовый код '+demoCode : localPreview ? 'Код для ' + email + ' доступен в тестовой почте и действует 10 минут.' : 'Отправили код на ' + email + '. Он действует 10 минут.', inn: 'Укажите ИНН, чтобы найти компанию.' }[step]}</p>
      {session ? <CompanyInnForm session={session}/> : <form className="bl-stack" onSubmit={e => { e.preventDefault(); if (allowed) void submit() }}>
        {step === 'email' && <label className="bl-field"><span className="bl-field__label">рабочая почта</span><input className="bl-input" type="email" autoComplete="email" readOnly={partnerDemo} required maxLength={254} autoFocus disabled={busy} value={email} onChange={e => { setEmail(e.target.value.trim()); setError('') }}/></label>}
        {step === 'code' && <label className="bl-field"><span className="bl-field__label">{partnerDemo ? 'код для демо-входа' : 'код из письма'}</span><input className="bl-input mvp-code" autoComplete="one-time-code" inputMode="numeric" maxLength={6} autoFocus disabled={busy} value={code} onChange={e => setCode(e.target.value.replace(/\D/g,''))}/></label>}
        {localPreview && step === 'code' && <a className="bl-btn bl-btn--ghost" target="_blank" rel="noopener noreferrer" href={'/local-inbox?challenge='+encodeURIComponent(challenge)}>Открыть тестовую почту</a>}
        {error && <p role="alert" className="bl-caption bl-error">{error}</p>}
        <button className="bl-btn bl-btn--primary bl-btn--l" disabled={!allowed || busy}>{busy ? 'Подождите…' : step === 'email' ? requestLabel : 'подтвердить'}</button>
        {step === 'code' && !partnerDemo && <div className="bl-row"><button type="button" disabled={busy} className="bl-btn" onClick={() => void submit(true)}>Получить новый код</button>
          <button type="button" disabled={busy} className="bl-btn bl-btn--ghost" onClick={() => { rememberLogin(null); setChallenge(''); setCode(''); setError('') }}>Изменить почту</button></div>}
      </form>}
      {partnerDemo && step === 'email' && <a href={'/app/?preview='+(staffDemo ? 'partner' : 'staff')}>{staffDemo ? 'Войти как партнёр' : 'Войти как сотрудник'}</a>}
    </motion.main></div><LoginAside perks={partnerDemo ? ['тестовый вход и компания','кампании сохраняются в этом браузере'] : perks}/></div>
}

export function CompanyInnForm({session,onClose}:{session:MvpSession;onClose?:()=>void}) {
  const [inn, setInn] = useState(partnerDemo && !session.profile ? demoCompany.inn : ''), [found, setFound] = useState<Profile | null>(null)
  const [lookupError, setLookupError] = useState(''), [manual, setManual] = useState('')
  const [allowManual, setAllowManual] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const pending = useRef(false)
  const validInn = !innError(inn)
  useEffect(() => {
    if (!validInn) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const lookup = partnerDemo
        ? inn === demoCompany.inn ? Promise.resolve(demoCompany) : Promise.reject(new Error('Для этого ИНН в демо можно указать название вручную.'))
        : autocompleteInn(inn, controller.signal)
      void lookup.then(profile => {
        if (!controller.signal.aborted) setFound({ inn, company: profile.name, addr: profile.registeredAddress, category:profile.category, website: profile.website })
      }).catch(e => {
        if (!controller.signal.aborted) { setLookupError(errorMessage(e)); setAllowManual((e as {status?: number})?.status !== 409) }
      })
    }, 350)
    return () => { clearTimeout(timer); controller.abort() }
  }, [inn, validInn])
  const allowed = validInn && (!!found || allowManual && manual.trim().length >= 2)
  async function save() {
    if (!allowed || pending.current) return
    pending.current = true; setBusy(true); setError('')
    try {
      const updated = await mvpRequest<MvpSession>('/company', found ?? {inn, company:manual.trim(), addr:''}, session.email)
      analytics.event(session.profile ? 'mvp_company_changed' : 'mvp_company_confirmed')
      queryClient.setQueryData(sessionKey, updated)
      onClose?.()
    } catch (e) { setError(errorMessage(e)) }
    finally { pending.current = false; setBusy(false) }
  }
  return <form className="bl-stack" onSubmit={e=>{e.preventDefault(); void save()}}>
    <label className="bl-field"><span className="bl-field__label">ИНН компании или ИП</span><input className="bl-input" inputMode="numeric" maxLength={12} autoFocus disabled={busy} value={inn} onChange={e => {
      setInn(e.target.value.replace(/\D/g,'')); setFound(null); setAllowManual(false); setLookupError(''); setManual('')
    }}/>{inn.length >= 10 && !validInn && <small>{innError(inn)}</small>}</label>
    {validInn && !found && <p className="bl-caption" role="status">{lookupError || 'Ищем компанию…'}</p>}
    {found && <div className="mvp-found"><Building2/><span><b>{found.company}</b><br/>{found.addr}</span></div>}
    {allowManual && <label className="bl-field">Название компании<input className="bl-input" required maxLength={80} value={manual} disabled={busy} onChange={e => setManual(e.target.value)}/></label>}
    {error && <p role="alert" className="bl-caption bl-error">{error}</p>}
    <div className={onClose ? "bl-row" : "bl-stack"}>
      <button className="bl-btn bl-btn--primary bl-btn--l" disabled={!allowed || busy}>{busy ? 'Подождите…' : 'Это моя компания'}</button>
      {onClose && <button type="button" className="bl-btn" disabled={busy} onClick={onClose}>Отмена</button>}
    </div>
  </form>
}
