import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileText, LogOut, Mail, Plus, RefreshCw, Search, Users } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { offerTheme, normalizeBusinessWebsite } from '../../shared/campaign-business.ts'
import { audienceGroups } from '../../shared/campaign-draft.ts'
import { partnerDetailsRows } from '../../shared/partner-details.ts'
import { offerLayouts } from '../../shared/campaign-offer.ts'
import { v4StaffPageSize, type V4StaffMember, type V4StaffSession, type V4Submission, type V4SubmissionList } from '../../shared/v4-staff.ts'
import { queryClient } from '../api'
import { Brand } from '../ui'
import { CampaignCreative } from './CampaignCreative'
import './v4-staff.css'

const home = '/v4/staff'
const team = home + '/team'
const base = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '') + home
const queryKey = 'v4-staff'
const dateTime = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Moscow' })
const tones = { red: 'Красный', green: 'Зелёный', blue: 'Синий', violet: 'Фиолетовый', magenta: 'Розовый', teal: 'Бирюзовый', dark: 'Тёмный', light: 'Светлый' }

class StaffError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function staffRequest<T>(path: string, options: { body?: object; signal?: AbortSignal } = {}): Promise<T> {
  const { body, signal } = options
  const response = await fetch(base + path, {
    credentials: 'include', cache: 'no-store', signal,
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new StaffError(response.status, error?.message ?? 'Не удалось выполнить запрос. Попробуйте ещё раз')
  }
  return response.json() as Promise<T>
}

function errorText(error: unknown) {
  return error instanceof StaffError ? error.message : 'Не удалось связаться с сервером. Попробуйте ещё раз'
}

function StaffLogin({ onLogin }: { onLogin: (session: V4StaffSession) => void }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [requested, setRequested] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(Date.now)
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000))

  useEffect(() => {
    if (!requested || !wait) return
    const timer = window.setTimeout(() => setNow(Date.now()), 1000)
    return () => window.clearTimeout(timer)
  }, [requested, wait, now])

  async function requestCode() {
    if (pending || (requested && wait > 0)) return
    setPending(true); setError('')
    try {
      await staffRequest('/code', { body: { email } })
      const sent = Date.now()
      setNow(sent); setResendAt(sent + 60_000)
      setCode(''); setRequested(true)
    } catch (failure) { setError(errorText(failure)) }
    finally { setPending(false) }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!requested) { await requestCode(); return }
    if (pending) return
    setPending(true); setError('')
    try { onLogin(await staffRequest<V4StaffSession>('/verify', { body: { email, code } })) }
    catch (failure) { setError(errorText(failure)) }
    finally { setPending(false) }
  }

  return <main className="staff-login wrap">
    <header><Brand/></header>
    <section className="bl-section pad staff-login-card" aria-labelledby="staff-login-title">
      <span className="staff-login-icon"><Mail size={22} aria-hidden="true"/></span>
      <h1 id="staff-login-title" className="bl-h1">Вход для сотрудников</h1>
      <p className="bl-secondary">{requested ? 'Если у этого адреса есть доступ, письмо с кодом придёт на рабочую почту.' : 'Введите рабочую почту, чтобы открыть заявки партнёров.'}</p>
      <form className="bl-stack" onSubmit={event => void submit(event)}>
        {requested ? <>
          <p className="staff-login-address">{email}</p>
          <label className="bl-field"><span className="bl-field__label">Код из письма</span>
            <input autoFocus className="bl-input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required
              value={code} onChange={event => { setCode(event.target.value.replace(/\D/g, '')); setError('') }} disabled={pending}/>
          </label>
        </> : <label className="bl-field"><span className="bl-field__label">Рабочая почта</span>
          <input className="bl-input" name="email" type="email" required maxLength={254} autoComplete="email" placeholder="name@company.ru"
            value={email} onChange={event => { setEmail(event.target.value); setError('') }} disabled={pending}/>
        </label>}
        {error && <p className="bl-notice" role="alert">{error}</p>}
        <button className="bl-btn bl-btn--primary bl-btn--l" disabled={pending}>
          {pending ? 'Подождите…' : requested ? 'Войти' : 'Получить код'}
        </button>
      </form>
      {requested && <div className="staff-login-actions bl-row">
        <button className="bl-btn bl-btn--s" type="button" disabled={pending} onClick={() => { setRequested(false); setCode(''); setError('') }}>Изменить адрес</button>
        <button className="bl-btn bl-btn--s" type="button" disabled={pending || wait > 0} onClick={() => void requestCode()}>
          {wait ? `Запросить снова через ${wait} с` : 'Отправить код ещё раз'}
        </button>
      </div>}
    </section>
  </main>
}

function Retry({ error, retry }: { error: unknown; retry: () => void }) {
  return <div role="alert" className="bl-notice staff-retry">
    {errorText(error)} <button className="bl-btn bl-btn--s" type="button" onClick={retry}>Повторить</button>
  </div>
}

function SubmissionList({ email, query, page, onSearch, onPage, onExpired }: {
  email: string; query: string; page: number; onSearch: (query: string) => void; onPage: (page: number) => void; onExpired: () => void
}) {
  const [input, setInput] = useState(query)
  const result = useQuery({
    queryKey: [queryKey, email, 'submissions', query, page],
    queryFn: ({ signal }) => staffRequest<V4SubmissionList>('/submissions/search', { body: { query, page }, signal }),
    retry: false, gcTime: 0,
  })
  const expired = result.error instanceof StaffError && result.error.status === 401
  useEffect(() => { if (expired) onExpired() }, [expired, onExpired])
  const data = result.data
  const pages = data ? Math.max(1, Math.ceil(data.total / v4StaffPageSize)) : 1
  const current = Math.min(page, pages)
  return <>
    <div className="page-title staff-page-title">
      <div><h1 className="bl-display-l">Заявки с лендинга</h1><p className="bl-secondary">Рекламные кампании, которые партнёры отправили на рассмотрение</p></div>
      <button type="button" className="bl-btn" disabled={result.isFetching} onClick={() => void result.refetch()}><RefreshCw size={17} aria-hidden="true"/>Обновить</button>
    </div>
    <section className="bl-section pad staff-panel" aria-label="Список заявок">
      <form className="staff-search bl-row" onSubmit={event => { event.preventDefault(); onSearch(input.trim()) }}>
        <label className="staff-search-field"><Search size={18} aria-hidden="true"/><input className="bl-input" type="search" aria-label="Поиск по названию компании, ИНН или почте" placeholder="Название компании, ИНН или почта" maxLength={120} value={input} onChange={event => setInput(event.target.value)}/></label>
        <button className="bl-btn bl-btn--primary">Найти</button>
        {query && <button type="button" className="bl-btn" onClick={() => { setInput(''); onSearch('') }}>Сбросить</button>}
      </form>
      {result.isPending && <p role="status" className="bl-secondary">Загружаем заявки…</p>}
      {result.error && !expired && <Retry error={result.error} retry={() => void result.refetch()}/>}
      {data && !result.error && <>
        {data.total === 0 ? <p className="staff-empty bl-secondary">{query ? 'По этому запросу заявок нет.' : 'Новые заявки появятся здесь после отправки с лендинга.'}</p>
          : <div className="bl-table-wrap"><table className="bl-table staff-table">
            <thead><tr><th scope="col">Компания</th><th scope="col">Предложение</th><th scope="col">Почта</th><th scope="col">Получена, МСК</th></tr></thead>
            <tbody>{data.items.map(item => <tr key={item.id}>
              <td><Link className="staff-row-link" to={home + '/' + item.id}>{item.name}</Link><span className="bl-caption staff-subline">ИНН {item.inn}{item.city ? ' · ' + item.city : ''}</span></td>
              <td>{item.title}</td><td>{item.email ?? '—'}</td>
              <td><time dateTime={new Date(item.submittedAt).toISOString()}>{dateTime.format(item.submittedAt)}</time></td>
            </tr>)}</tbody>
          </table></div>}
        {data.total > 0 && <div className="staff-pagination bl-row">
          <span className="bl-caption" aria-live="polite">{(current - 1) * v4StaffPageSize + 1}–{Math.min(current * v4StaffPageSize, data.total)} из {data.total}</span>
          {pages > 1 && <div className="bl-row">
            <button className="bl-icon-btn" type="button" aria-label="Предыдущая страница" disabled={current <= 1} onClick={() => onPage(current - 1)}><ChevronLeft size={20} aria-hidden="true"/></button>
            <button className="bl-icon-btn" type="button" aria-label="Следующая страница" disabled={current >= pages} onClick={() => onPage(current + 1)}><ChevronRight size={20} aria-hidden="true"/></button>
          </div>}
        </div>}
      </>}
    </section>
  </>
}

function Fields({ rows }: { rows: [string, ReactNode][] }) {
  return <dl className="staff-fields">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
}

function SubmissionDetails({ email, id, onExpired }: { email: string; id: string; onExpired: () => void }) {
  const path = '/submissions/' + encodeURIComponent(id)
  const result = useQuery({
    queryKey: [queryKey, email, 'submission', id],
    queryFn: ({ signal }) => staffRequest<V4Submission>(path, { signal }),
    retry: false, gcTime: 0,
  })
  const expired = result.error instanceof StaffError && result.error.status === 401
  useEffect(() => { if (expired) onExpired() }, [expired, onExpired])
  const submission = result.data
  return <>
    <Link className="bl-btn staff-back" to={home}><ArrowLeft size={18} aria-hidden="true"/>Все заявки</Link>
    {result.isPending && <p role="status" className="bl-secondary">Открываем заявку…</p>}
    {result.error && !expired && <Retry error={result.error} retry={() => void result.refetch()}/>}
    {submission && !result.error && <SubmissionCard value={submission} assetBase={base + path}/>}
  </>
}

function SubmissionCard({ value, assetBase }: { value: V4Submission; assetBase: string }) {
  const { business, email, offer, offerImage, logoImage } = value
  const image = offerImage !== null ? assetBase + '/offer-image' : ''
  const logo = logoImage !== null ? assetBase + '/logo' : ''
  const theme = offerTheme(business.category)
  const site = normalizeBusinessWebsite(business.website)
  const illustration = 'illustration' in theme ? import.meta.env.BASE_URL + 'img/near/' + theme.illustration + '.avif' : ''
  return <>
    <div className="staff-case-title">
      <h1 className="bl-display-l">{business.name}</h1>
      <p className="bl-secondary">Заявка получена <time dateTime={new Date(value.submittedAt).toISOString()}>{dateTime.format(value.submittedAt)}</time> МСК</p>
    </div>
    <div className="staff-case">
      <div className="staff-case-column">
        <section className="bl-section pad staff-panel">
          <h2 className="bl-h3">Бизнес и контакты</h2>
          <Fields rows={[
            ['ИНН', business.inn], ['Сфера бизнеса', business.category],
            ['Телефон', business.phone && <a href={'tel:' + business.phone.replace(/[^+\d]/g, '')}>{business.phone}</a>],
            ['Почта', email ? <><a href={'mailto:' + email}>{email}</a> <span className="bl-tag bl-tag--success">Подтверждена</span></> : null],
            ['Сайт', site ? <a href={site} target="_blank" rel="noreferrer">{business.website}</a> : business.website],
            ['Город бизнеса', business.city], ['Формат', value.online ? 'Только онлайн' : 'Точки продаж'],
            ['Адреса точек', value.addresses.some(Boolean) && <ul>{value.addresses.filter(Boolean).map((address, index) => <li key={index}>{address}</li>)}</ul>],
            ['Оферта на размещение', value.offerAccepted ? 'Принята' : 'Нет отметки'],
          ]}/>
        </section>
        <section className="bl-section pad staff-panel">
          <h2 className="bl-h3">Реквизиты для партнёрского договора</h2>
          <Fields rows={partnerDetailsRows(business.inn, value.registryDetails, value.partnerDetails)}/>
        </section>
        <section className="bl-section pad staff-panel">
          <h2 className="bl-h3">Аудитория</h2>
          <Fields rows={[
            ['География', audienceGroups[0].choices[value.audience[0]]],
            ...(value.audience[0] === 1 ? [['Город показа', value.audienceCity ?? business.city] as [string, string]] : []),
            ...audienceGroups.slice(1).map((group, i): [string, string] => [group.title[0].toUpperCase() + group.title.slice(1), group.choices[value.audience[i + 1]]]),
            ['Пожелания', value.triggers],
          ]}/>
        </section>
      </div>
      <section className="bl-section pad staff-panel staff-offer">
        <h2 className="bl-h3">Оффер</h2>
        <CampaignCreative name={business.name} offer={offer} image={image} illustration={illustration} logo={logo} disabled={false}/>
        <Fields rows={[
          ['Текст', offer.title], ['Скидка', offer.discount && offer.discount + '%'], ['Промокод', offer.promo],
          ['Действует до', offer.until && offer.until.split('-').reverse().join('.')], ['Акция 1 + 1', offer.gift ? 'Да' : 'Нет'],
          ['Макет', offer.layout ? offerLayouts[offer.layout] : 'Автоматически'], ['Цвет', tones[offer.tone]],
          ['Увеличенный креатив', offer.zoom ? 'Да' : 'Нет'],
        ]}/>
        {(image || logo) && <div className="staff-attachments bl-row">
          {image && <a className="bl-btn bl-btn--s" href={image + '?download=1'} title={offerImage ?? undefined} download><Download size={16} aria-hidden="true"/>Скачать фото</a>}
          {logo && <a className="bl-btn bl-btn--s" href={logo + '?download=1'} title={logoImage ?? undefined} download><Download size={16} aria-hidden="true"/>Скачать логотип</a>}
        </div>}
      </section>
    </div>
  </>
}

function StaffTeam({ adminEmail, onExpired }: { adminEmail: string; onExpired: () => void }) {
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [added, setAdded] = useState('')
  const key = [queryKey, adminEmail, 'team']
  const result = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => staffRequest<{ members: V4StaffMember[] }>('/team', { signal }),
    retry: false, gcTime: 0,
  })
  const expired = result.error instanceof StaffError && result.error.status === 401
  useEffect(() => { if (expired) onExpired() }, [expired, onExpired])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (adding) return
    setAdding(true); setError(''); setAdded('')
    try {
      const { member } = await staffRequest<{ member: V4StaffMember }>('/team', { body: { email: input.trim() } })
      setInput(''); setAdded(member.email)
      void result.refetch()
    } catch (failure) {
      if (failure instanceof StaffError && failure.status === 401) onExpired()
      else setError(errorText(failure))
    } finally { setAdding(false) }
  }

  return <>
    <div className="staff-case-title"><h1 className="bl-display-l">Сотрудники</h1><p className="bl-secondary">Рабочие адреса с доступом к заявкам</p></div>
    <section className="bl-section pad staff-panel" aria-labelledby="staff-add-title">
      <h2 className="bl-h3" id="staff-add-title">Добавить сотрудника</h2>
      <form className="staff-member-form bl-row" onSubmit={event => void submit(event)}>
        <label className="bl-field"><span className="bl-field__label">Рабочая почта</span>
          <input className="bl-input" type="email" name="employeeEmail" autoComplete="off" placeholder="name@company.ru" maxLength={254} required disabled={adding}
            value={input} onChange={event => { setInput(event.target.value); setError(''); setAdded('') }}/>
        </label>
        <button className="bl-btn bl-btn--primary" disabled={adding || !input.trim()}><Plus size={18} aria-hidden="true"/>{adding ? 'Добавляем…' : 'Добавить'}</button>
      </form>
      {error && <p className="staff-member-feedback" role="alert">{error}</p>}
      {added && <p className="staff-member-feedback" role="status">Доступ добавлен для {added}. Сотрудник может войти по коду из письма.</p>}
    </section>
    <section className="bl-section pad staff-panel" aria-labelledby="staff-members-title">
      <h2 className="bl-h3" id="staff-members-title">У кого есть доступ</h2>
      {result.isPending && <p className="bl-secondary" role="status">Загружаем список…</p>}
      {result.error && !expired && <Retry error={result.error} retry={() => void result.refetch()}/>}
      {result.data && !result.error && <div className="bl-table-wrap"><table className="bl-table staff-members-table">
        <thead><tr><th scope="col">Почта</th><th scope="col">Роль</th><th scope="col">Добавлен, МСК</th></tr></thead>
        <tbody>{result.data.members.map(member => <tr key={member.email}>
          <td>{member.email}</td><td>{member.role === 'admin' ? 'Администратор' : 'Сотрудник'}</td>
          <td>{member.addedAt === null ? '—' : dateTime.format(member.addedAt)}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </>
}

export default function V4Staff() {
  const { id } = useParams()
  const [session, setSession] = useState<V4StaffSession | null | undefined>(undefined)
  const teamPage = id === 'team'
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  const [signingOut, setSigningOut] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  useEffect(() => {
    const request = new AbortController()
    staffRequest<V4StaffSession>('/session', { signal: request.signal })
      .then(setSession)
      .catch(failure => {
        if (request.signal.aborted) return
        if (failure instanceof StaffError && failure.status === 401) setSession(null)
        else setError(failure)
      })
    return () => request.abort()
  }, [attempt])

  const expired = useCallback(() => {
    setSession(null); setQuery(''); setPage(1)
    queryClient.removeQueries({ queryKey: [queryKey] })
  }, [])

  async function logout() {
    setSigningOut(true); setError(null)
    try { await staffRequest('/logout', { body: {} }); expired() }
    catch (failure) {
      if (failure instanceof StaffError && failure.status === 401) expired()
      else setError(failure)
    } finally { setSigningOut(false) }
  }

  if (session === null) return <StaffLogin onLogin={setSession}/>
  if (!session) return <main className="staff-login wrap"><Brand/>{error
    ? <Retry error={error} retry={() => { setError(null); setAttempt(value => value + 1) }}/>
    : <p role="status">Проверяем доступ…</p>}</main>
  const { email, role } = session
  return <div className="bl-page staff-page">
    <div className="cab">
      <aside className="cab-nav staff-nav">
        <Brand to={home}/>
        <nav aria-label="Кабинет сотрудника">
          <Link to={home} className={teamPage ? '' : 'is-active'} aria-current={teamPage ? undefined : id ? 'location' : 'page'}><FileText size={20} aria-hidden="true"/>Заявки</Link>
          {role === 'admin' && <Link to={team} className={teamPage ? 'is-active' : ''} aria-current={teamPage ? 'page' : undefined}><Users size={20} aria-hidden="true"/>Сотрудники</Link>}
        </nav>
        <div className="staff-account">
          <span className="bl-caption">{email}</span>
          <button type="button" className="bl-btn bl-btn--s" disabled={signingOut} onClick={() => void logout()}><LogOut size={16} aria-hidden="true"/>Выйти</button>
        </div>
      </aside>
      <main className="cab-main">
        {error != null && <Retry error={error} retry={() => void logout()}/>}
        {teamPage ? role === 'admin'
          ? <StaffTeam adminEmail={email} onExpired={expired}/>
          : <p className="bl-notice" role="status">Управлять доступом могут администраторы. <Link to={home}>К заявкам</Link></p>
          : id ? <SubmissionDetails email={email} id={id} onExpired={expired}/>
          : <SubmissionList email={email} query={query} page={page} onSearch={value => { setQuery(value); setPage(1) }} onPage={setPage} onExpired={expired}/>}
      </main>
    </div>
  </div>
}
