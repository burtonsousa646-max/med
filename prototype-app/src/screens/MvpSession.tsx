import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, Outlet, useLocation, useOutletContext } from 'react-router'
import { useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, Building2 } from 'lucide-react'
import { Brand, toast } from '../ui'
import { autocompleteInn, queryClient } from '../api'
import { analytics } from '../analytics'
import { innError } from '../../shared/campaign-business'
import { normalizeCampaignEmail } from '../../shared/campaign-draft'
import type { MvpSession, Profile } from '../../shared/mvp-promo'
import type { ContractInput } from '../../shared/partner-campaign-draft'
import { demoCode, demoCompany, demoEmail, demoStaffEmail, mockPartnerRequest, partnerDemo } from './mvp-demo'
import { LoginAside } from './Entry'
import './cabinet-entry.css'

const base = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '') + '/mvp'
export const sessionKey = ['mvp-partner-session']
export async function mvpRequest<T>(path: string, body?: object, owner?: string, offerSession?: string, signal?: AbortSignal): Promise<T> {
  if (partnerDemo) return mockPartnerRequest(path,body) as T
  const response = await fetch(base + path, { credentials: 'include', cache: 'no-store', signal,
    headers: { ...(body && { 'Content-Type': 'application/json' }), ...(owner && { 'X-Mvp-Account': owner }), ...(offerSession && { 'X-Offer-Session': offerSession }) },
    ...(body && { method: 'POST', body: JSON.stringify(body) }) })
  if (response.status === 401 && path === '/session') return null as T
  if (!response.ok) {
    if (response.status === 401 && path !== '/verify') queryClient.setQueryData(sessionKey, null)
    const error = await response.json().catch(() => null)
    throw Object.assign(new Error(error?.message ?? 'Сервер недоступен. Попробуйте ещё раз'),{status:response.status})
  }
  return response.json()
}
export const useMvpSession = () => useOutletContext<MvpSession>()
export const draftKey = (session: MvpSession) => 'mvp-draft-' + session.email + '-' + (session.profile?.inn??'pending')
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
  const params=new URLSearchParams(search)
  const back=params.get('return')??''
  const cabinetPath=back.startsWith('/app/') && !/[\\#]/.test(back) && !back.startsWith('/app/?')
  if (!session.data && !entry) {
    const next=new URLSearchParams({return:pathname+search})
    if(partnerDemo && staff)next.set('preview','staff')
    return <Navigate to={'/app/?'+next} replace/>
  }
  if (session.data && entry && cabinetPath && !!session.data.role===/^\/app\/staff(?:[/?]|$)/.test(back)) return <Navigate to={back} replace/>
  if (session.data?.role && !staff) return <Navigate to="/app/staff" replace/>
  if (session.data && !session.data.role && staff) return <Navigate to="/app/campaigns" replace/>
  if (session.data && !session.data.profile && pathname==='/app/materials') return <Navigate to={'/app/company?'+new URLSearchParams({return:pathname+search})} replace/>
  if (session.data && entry) {
    if (params.get('start') === 'materials') {
      const campaign = params.get('campaign')
      return <Navigate to={'/app/materials'+(campaign ? '?campaign='+encodeURIComponent(campaign) : '')} replace/>
    }
    return <Navigate to={params.get('start') === 'campaign' || (!session.data.profile && !session.data.hasDrafts) ? '/app/campaigns/formats' : '/app/campaigns'} replace/>
  }
  return <Outlet key={session.data?.email} context={session.data}/>
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
  return <button className="bl-btn bl-btn--s" disabled={busy} onClick={logout}>{busy ? 'выходим…' : 'выйти'}</button>
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

const perks = ['без пароля: код придёт на почту', 'после входа выберите тип кампании', 'сначала оффер и аудитория, затем договор']
export function MvpLogin() {
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
  const openTestLogin = !partnerDemo && import.meta.env.DEV && location.origin === 'http://127.0.0.1:5173' && testRole
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [emailTouched,setEmailTouched] = useState(false)
  const [codeRejected,setCodeRejected] = useState(false)
  const [resent,setResent] = useState(false)
  const codeField=useRef<HTMLInputElement>(null)
  const hintId=useId(), errorId=useId()
  const pending = useRef(false)
  const step = challenge ? 'code' : 'email'
  useEffect(() => { analytics.view('/app/') }, [])
  async function submit(resend = false) {
    if (pending.current) return
    if (step === 'email' && openTestLogin) {
      const current = new URLSearchParams(location.search)
      const next = new URLSearchParams({preview:testRole})
      if(current.has('return'))next.set('return',current.get('return')!)
      const start = current.get('start')
      if (start === 'campaign' || start === 'materials') next.set('start',start)
      const campaign = current.get('campaign')
      if (start === 'materials' && campaign) next.set('campaign',campaign)
      location.assign(previewOrigin + '/app/?' + next)
      return
    }
    pending.current = true; setBusy(true); setError(''); setCodeRejected(false); setResent(false)
    try {
      if (step === 'email' || resend) {
        const result = await mvpRequest<{challenge:string}>('/code', { email })
        rememberLogin({email,challenge:result.challenge,expiresAt:Date.now()+600_000})
        setChallenge(result.challenge); setCode(''); setResent(resend); analytics.event('mvp_code_sent')
      } else if (step === 'code') {
        await mvpRequest('/verify', { email, code, challenge })
        const verified = await mvpRequest<MvpSession | null>('/session')
        if (!verified) throw new Error('Не удалось сохранить вход. Проверьте, разрешены ли в браузере cookies для кабинета.')
        rememberLogin(null)
        analytics.event('mvp_email_verified')
        queryClient.setQueryData(sessionKey, verified)
      }
    } catch (e) {
      setError(errorMessage(e))
      const status=(e as {status?:number})?.status
      if(step==='code' && !resend && (status===400 || status===401 || status===422)) setCodeRejected(true)
    }
    finally { pending.current = false; setBusy(false) }
  }
  const allowed = step === 'email' ? !!normalizeCampaignEmail(email) : code.length === 6
  const invalidEmail=step==='email' && emailTouched && !!email && !allowed
  useEffect(()=>{
    if(codeRejected || resent) { codeField.current?.focus(); codeField.current?.select() }
  },[codeRejected,resent])
  const requestLabel = partnerDemo ? 'Получить тестовый код' : openTestLogin ? 'Перейти к тестовому входу' : 'получить код'
  return <div className="login cabinet-entry"><div className="login__form">
    <header className="login__head"><Brand to="/"/><Link className="bl-btn bl-btn--ghost" to="/"><ArrowLeft size={18}/>на главную</Link></header>
    <main key={step} className="login__body bl-stack ym-hide-content ym-disable-keys" data-step={step}>
      <ol className="mvp-dots" aria-label={'шаг ' + (['email','code'].indexOf(step)+1) + ' из 2'}>
        {['email','code'].map((s,i) => <li key={s} className={i <= ['email','code'].indexOf(step) ? 'is-on' : ''}/>)}</ol>
      <h1 className="bl-h1">{{ email: 'вход в кабинет', code: partnerDemo ? 'тестовый код' : 'проверьте почту' }[step]}</h1>
      <p id={hintId} className="bl-body bl-secondary">{{ email: partnerDemo ? (staffDemo ? 'Демо-вход сотрудника. ' : 'Демо-вход партнёра. ')+'Тестовый код появится на следующем шаге.' : 'Пришлём одноразовый код на вашу рабочую почту.', code: partnerDemo ? 'Введите тестовый код '+demoCode : localPreview ? 'Код для ' + email + ' доступен в тестовой почте и действует 10 минут.' : 'Отправили код на ' + email + '. Он действует 10 минут.' }[step]}</p>
      <form className="bl-stack" onSubmit={e => { e.preventDefault(); if (allowed) void submit() }}>
        {step === 'email' && <label className="bl-field"><span className="bl-field__label">рабочая почта</span><input className="bl-input" type="email" autoComplete="email" readOnly={partnerDemo} required maxLength={254} autoFocus disabled={busy} value={email}
          aria-invalid={invalidEmail||undefined} aria-describedby={invalidEmail?errorId:hintId} onBlur={()=>setEmailTouched(true)}
          onChange={e => { setEmail(e.target.value.trim()); setError('') }}/></label>}
        {step === 'code' && <label className="bl-field"><span className="bl-field__label">{partnerDemo ? 'код для демо-входа' : 'код из письма'}</span><input className="bl-input mvp-code" ref={codeField} autoComplete="one-time-code" inputMode="numeric" autoFocus disabled={busy} value={code}
          aria-invalid={codeRejected||undefined} aria-describedby={error?hintId+' '+errorId:hintId}
          onChange={e => {setCode(e.target.value.replace(/\D/g,'').slice(0,6));setError('');setCodeRejected(false);setResent(false)}}/></label>}
        {localPreview && step === 'code' && <a className="bl-btn bl-btn--ghost" target="_blank" rel="noopener noreferrer" href={'/local-inbox?challenge='+encodeURIComponent(challenge)}>Открыть тестовую почту</a>}
        {(error || invalidEmail) && <p role="alert" id={errorId} className="bl-caption bl-error">{error || 'Введите почту в формате name@company.ru.'}</p>}
        {resent && <p role="status" className="bl-caption">Новый код отправлен. Введите код из последнего письма.</p>}
        <button className="bl-btn bl-btn--primary bl-btn--l" disabled={!allowed || busy}>{busy ? 'Подождите…' : step === 'email' ? requestLabel : 'подтвердить'}</button>
        {step === 'code' && !partnerDemo && <div className="bl-row"><button type="button" disabled={busy} className="bl-btn" onClick={() => void submit(true)}>Получить новый код</button>
          <button type="button" disabled={busy} className="bl-btn bl-btn--ghost" onClick={() => { rememberLogin(null); setChallenge(''); setCode(''); setError('');setResent(false);setCodeRejected(false) }}>Изменить почту</button></div>}
      </form>
      {partnerDemo && step === 'email' && <a href={'/app/?preview='+(staffDemo ? 'partner' : 'staff')}>{staffDemo ? 'Войти как партнёр' : 'Войти как сотрудник'}</a>}
    </main></div><LoginAside perks={partnerDemo ? ['тестовый вход и компания','кампании сохраняются в этом браузере'] : perks}/></div>
}

type CompanyDraft = Pick<ContractInput,'inn'|'companyName'>
async function lookupCompany(inn:string, signal:AbortSignal):Promise<Profile> {
  if (partnerDemo && inn!==demoCompany.inn) throw new Error('Для этого ИНН в демо можно указать название вручную.')
  const profile=partnerDemo?demoCompany:await autocompleteInn(inn,signal)
  return {inn,company:profile.name,addr:profile.registeredAddress,category:profile.category,website:profile.website}
}

export async function savePartnerCompany(session:MvpSession,company:Profile,binding:{draftId?:string;draftVersion?:number},signal?:AbortSignal) {
  const updated=await mvpRequest<MvpSession>('/company',{...company,...binding},session.email,undefined,signal)
  if(signal?.aborted)return
  if(!session.profile || !binding.draftId || session.profile.inn!==company.inn)analytics.event(session.profile?'mvp_company_changed':'mvp_company_confirmed')
  if(!session.profile){
    try {
      const guest=sessionStorage.getItem(draftKey(session))
      if(guest){sessionStorage.setItem(draftKey(updated),guest);sessionStorage.removeItem(draftKey(session))}
    } catch { /* The company was saved on the server. */ }
  }
  queryClient.setQueryData(sessionKey,updated)
}

export function CompanyInnForm({session,onClose,manualEntry=false,draft,onDraftChange,contractDraft,onConfirm,disabled=false,onBusy}:{
  session:MvpSession;onClose?:()=>void;manualEntry?:boolean;draft?:CompanyDraft;onDraftChange?:(values:CompanyDraft)=>void
  contractDraft?:{id:string;flush:()=>Promise<number>};onConfirm?:(profile:Profile,fromLookup:boolean)=>void;disabled?:boolean;onBusy?:(busy:boolean)=>void
}) {
  const [local,setLocal]=useState<CompanyDraft>({})
  const {inn='',companyName:manual=''}=draft??local
  const searchOnSubmit=!!contractDraft&&!manualEntry
  const hintId=useId(), errorId=useId()
  const update=onDraftChange??setLocal
  const [found,setFound]=useState<Profile|null>(null),[lookupError,setLookupError]=useState('')
  const [allowManual, setAllowManual] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const pending = useRef<AbortController|null>(null)
  const validInn = !innError(inn)
  useEffect(()=>()=>pending.current?.abort(),[])
  useEffect(() => {
    if (!validInn || manualEntry || searchOnSubmit) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void lookupCompany(inn,controller.signal).then(profile => {
        if (!controller.signal.aborted) setFound(profile)
      }).catch(e => {
        if (!controller.signal.aborted) { setLookupError(errorMessage(e)); setAllowManual((e as {status?: number})?.status !== 409) }
      })
    }, 350)
    return () => { clearTimeout(timer); controller.abort() }
  }, [inn,validInn,manualEntry,searchOnSubmit])
  const allowed = !disabled && validInn && (searchOnSubmit || found?.inn===inn || (manualEntry||allowManual) && manual.trim().length >= 2)
  async function save() {
    if (!allowed || pending.current) return
    const controller=new AbortController()
    pending.current=controller
    setBusy(true);onBusy?.(true);setError('')
    try {
      const registry=searchOnSubmit ? await lookupCompany(inn,controller.signal) : found
      if(controller.signal.aborted)return
      const company=registry ?? {inn,company:manual.trim(),addr:''}
      const binding=contractDraft ? {draftId:contractDraft.id,draftVersion:await contractDraft.flush()} : {}
      await savePartnerCompany(session,company,binding,controller.signal)
      if(controller.signal.aborted)return
      onConfirm?.(company,!!registry)
      onClose?.()
    } catch (e) { if(!controller.signal.aborted)setError(errorMessage(e)) }
    finally { pending.current=null;setBusy(false);onBusy?.(false) }
  }
  const [innTouched,setInnTouched]=useState(false)
  const invalid=!!inn && !validInn && (inn.length===12 || innTouched)
  return <form className="bl-stack" onSubmit={e=>{e.preventDefault(); void save()}}>
    <label className="bl-field"><span className="bl-field__label">ИНН компании или ИП</span><input className="bl-input" inputMode="numeric" maxLength={12} autoFocus={!contractDraft} disabled={disabled||busy} value={inn}
      aria-invalid={invalid||undefined} aria-describedby={[invalid?errorId:hintId,searchOnSubmit&&hintId+'-lookup'].filter(Boolean).join(' ')} onBlur={()=>setInnTouched(true)}
      onChange={e => {
        update({inn:e.target.value.replace(/\D/g,''),companyName:''});setFound(null);setAllowManual(false);setLookupError('');setError('')
      }}/></label>
    {invalid ? <small id={errorId} className="bl-error">{innError(inn)}</small> : <small id={hintId} className="bl-caption bl-secondary">10 цифр для организации или 12 для ИП.</small>}
    {partnerDemo&&!manualEntry&&!inn&&<small>ИНН для примера в демо · {demoCompany.inn}</small>}
    {validInn && !manualEntry && !searchOnSubmit && !found && <p className="bl-caption" role="status">{lookupError || 'Ищем компанию…'}</p>}
    {found && <div className="mvp-found"><Building2/><span><b>{found.company}</b><br/>{found.addr}</span></div>}
    {(manualEntry||allowManual) && <label className="bl-field">Название компании<input className="bl-input" required maxLength={80} value={manual} disabled={disabled||busy} onChange={e => {update({inn,companyName:e.target.value});setError('')}}/></label>}
    {contractDraft&&session.profile&&validInn&&session.profile.inn!==inn&&<p className="bl-caption">После подтверждения эта компания станет текущей в кабинете.</p>}
    {error && <p role="alert" className="bl-caption bl-error">{error}</p>}
    <div className={onClose ? "bl-row" : "bl-stack"}>
      <button className="bl-btn bl-btn--primary bl-btn--l" disabled={!allowed || busy}>{busy ? 'Подождите…' : searchOnSubmit ? 'Далее' : 'Это моя компания'}</button>
      {onClose && <button type="button" className="bl-btn" disabled={busy} onClick={onClose}>Отмена</button>}
    </div>
    {searchOnSubmit&&<p id={hintId+'-lookup'} className="bl-caption">По ИНН мы автоматически заполним реквизиты для договора.</p>}
  </form>
}
