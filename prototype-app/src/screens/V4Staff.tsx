import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Download, FileText, LogOut, Plus } from 'lucide-react'
import { Link, Navigate, useLocation, useMatch, useNavigate, useParams, useSearchParams } from 'react-router'
import { offerTheme, normalizeBusinessWebsite } from '../../shared/campaign-business.ts'
import { audienceGroups } from '../../shared/campaign-draft.ts'
import { partnerDetailsRows, providedDetailsRows, type RegistryDetails } from '../../shared/partner-details.ts'
import { offerLayouts } from '../../shared/campaign-offer.ts'
import type { V4StaffMember, V4Submission } from '../../shared/v4-staff.ts'
import { analytics } from '../analytics'
import { marketOfferPath, reviewLabels, type Review } from '../../shared/market'
import { mvpRequest, useMvpSession, sessionKey } from './MvpSession'
import { queryClient } from '../api'
import { AccountCabinet, CampaignStatus } from './AccountCabinet'
import { partnerDemo } from './mvp-demo'
import { ContractDocument } from './CampaignContract'
import type { ContractRecord } from '../../shared/campaign-contract'
import { CampaignBoard } from './CampaignBoard'
import { StaffOffers } from './StaffOffers'
import { CampaignCreative } from './CampaignCreative'
import { MarketCardPreview } from './BenefitCard'
import { campaignMarketCard } from '../../shared/campaign-market'

import { base as staffBase, StaffError, staffRequest } from './staff-request'

const home = '/app/staff'
const catalogPath = home + '?catalog=1'
const queryKey = 'v4-staff'
const dateTime = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Moscow' })
const tones = { red: 'Красный', green: 'Зелёный', blue: 'Синий', violet: 'Фиолетовый', magenta: 'Розовый', teal: 'Бирюзовый', dark: 'Тёмный', light: 'Светлый' }

function errorText(error: unknown) {
  return error instanceof StaffError || (partnerDemo && error instanceof Error) ? error.message : 'Не удалось связаться с сервером. Попробуйте ещё раз'
}

function Retry({ error, retry }: { error: unknown; retry: () => void }) {
  return <div role="alert" className="bl-notice staff-retry">
    {errorText(error)} <button className="bl-btn bl-btn--s" type="button" onClick={retry}>Повторить</button>
  </div>
}

function Fields({ rows }: { rows: [string, ReactNode][] }) {
  return <dl className="staff-fields">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
}

function ContractDetails({ value }: { value: V4Submission }) {
  const session = useMvpSession()
  const lookup = useQuery({
    queryKey: [queryKey, session.email, 'registry', value.id],
    queryFn: ({ signal }) => staffRequest<RegistryDetails>('/submissions/' + encodeURIComponent(value.id) + '/registry', { signal, body: {} }),
    enabled: !value.registryDetails && !partnerDemo,
    retry: false, staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false,
  })
  const registry = value.registryDetails ?? lookup.data
  return <section className="bl-section pad staff-panel">
    <h2 className="bl-h3">Реквизиты для партнёрского договора</h2>
    {registry ? <Fields rows={partnerDetailsRows(value.business.inn, registry, value.partnerDetails)}/> : <>
      {partnerDemo ? <p className="bl-secondary">В демоверсии сведения из DaData недоступны.</p>
        : lookup.isFetching ? <p role="status" className="bl-secondary">Загружаем реквизиты из DaData…</p>
        : lookup.error && <Retry error={lookup.error} retry={() => void lookup.refetch()}/>}
      <Fields rows={providedDetailsRows(value.business.inn, null, value.partnerDetails)}/>
    </>}
  </section>
}

function SubmissionDetails({ email, id, onExpired }: { email: string; id: string; onExpired: () => void }) {
  const [params]=useSearchParams()
  const location=useLocation()
  const fromCatalog=!!location.state?.staffCatalogFilters
  const editing=params.get('edit')==='1'
  const path = '/submissions/' + encodeURIComponent(id)
  const result = useQuery({
    queryKey: [queryKey, email, 'submission', id],
    queryFn: ({ signal }) => staffRequest<V4Submission>(path, { signal }),
    retry: false, gcTime: 0,
  })
  const expired = result.error instanceof StaffError && result.error.status === 401
  useEffect(() => { if (expired) onExpired() }, [expired, onExpired])
  const submission = result.data
  useEffect(() => { if (submission && !result.error) analytics.view('/app/staff/detail') }, [submission, result.error])
  return <>
    <Link className="bl-btn staff-back" to={fromCatalog?catalogPath:home} state={fromCatalog?location.state:undefined}><ArrowLeft size={18} aria-hidden="true"/>{fromCatalog?'Реестр витрины':'Все кампании'}</Link>
    {result.isPending && <p role="status" className="bl-secondary">Открываем кампанию…</p>}
    {result.error && !expired && <Retry error={result.error} retry={() => void result.refetch()}/>}
    {submission && !result.error && <>
      <div className="staff-case-title">
        <h1 className="bl-display-l">{submission.business.name}</h1>
        <div className="staff-case-status"><CampaignStatus status={submission.status}/></div>
        <p className="bl-secondary">Кампания получена <time dateTime={new Date(submission.submittedAt).toISOString()}>{dateTime.format(submission.submittedAt)}</time> МСК</p>
      </div>
      <nav className="bl-row staff-case-links" aria-label="Разделы кампании">
        <a className="bl-btn bl-btn--s" href="#staff-publication">Публикация</a>
        {submission.contract&&<a className="bl-btn bl-btn--s" href="#staff-contract">Договор</a>}
        <a className="bl-btn bl-btn--s" href="#staff-materials">Материалы кампании</a>
      </nav>
      <ReviewForm key={id + ':' + submission.review.version} review={submission.review} path={path}
        refresh={() => result.refetch()} onExpired={onExpired}/>
      <Link className="bl-btn staff-back" state={location.state} to={editing?'?':'?edit=1'}>{editing?'Закрыть редактор витрины':'Редактировать на витрине'}</Link>
      {editing && <StaffOffers embedded offerKey={id} email={email} request={staffRequest} onExpired={onExpired}/>}
      {submission.contract&&<StaffContractPanel record={submission.contract} onChange={()=>void result.refetch()}/>}
      <SubmissionCard value={submission} assetBase={staffBase + path}/>
    </>}
  </>
}

function ReviewForm({review,path,refresh,onExpired}:{review:Review;path:string;refresh:()=>Promise<unknown>;onExpired:()=>void}) {
  const [reviewed,setReviewed] = useState(review.reviewed), [paid,setPaid] = useState(review.paid)
  const [erid,setErid] = useState(review.erid), [busy,setBusy] = useState(false), [error,setError] = useState('')
  const [conflict,setConflict] = useState(false)
  const validErid = /^[A-Za-z0-9]{1,100}$/.test(erid.trim())
  const invalidErid = !!erid.trim() && !validErid
  const changed = reviewed !== review.reviewed || paid !== review.paid || erid.trim() !== review.erid
  const completed = Number(reviewed) + Number(paid) + Number(validErid)
  const originalReady = review.reviewed && review.paid && !!review.erid
  const publishing = !originalReady && completed===3
  const withdrawing = review.status==='published' && completed<3
  const buttonLabel = withdrawing?'Приостановить показ':publishing?'Опубликовать на витрине':'Сохранить проверку'
  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy || !changed || invalidErid || conflict) return
    setBusy(true); setError('')
    try {
      const result = await staffRequest<{review:Review;changed:boolean}>(path+'/review',{body:{reviewed,paid,erid:erid.trim(),version:review.version}})
      if (result.changed) {
        void queryClient.invalidateQueries({queryKey:[queryKey],predicate:q=>['submissions','dashboard','offers','offer','board'].includes(String(q.queryKey[2]))})
        analytics.event('staff_review_saved')
        if (result.review.status === 'published' && review.status !== 'published') analytics.event('staff_offer_published')
        if (review.status === 'published' && result.review.status !== 'published') analytics.event('staff_offer_withdrawn')
      }
      await refresh()
    } catch (e) {
      if (e instanceof StaffError && e.status === 401) onExpired()
      else { setError(errorText(e)); setConflict(e instanceof StaffError && e.status === 409) }
    } finally { setBusy(false) }
  }
  return <section className="bl-section pad staff-panel staff-review" id="staff-publication">
    <div className="staff-panel-head"><h2 className="bl-h3">Публикация на витрине</h2>
      <span className="crm-status" data-status={review.status} role="status">{reviewLabels[review.status]}</span></div>
    <form className="bl-stack staff-form" onSubmit={save} aria-busy={busy}>
      <fieldset className="staff-offer-fields" disabled={busy}>
        <legend className="staff-review-legend">Условия публикации <span>{completed} из 3</span></legend>
        <label className="staff-check"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>
          <span>Предложение проверено<small>Сверьте текст, условия и материалы кампании.</small></span></label>
        <label className="bl-field">Идентификатор рекламы (erid)
          <input className="bl-input" value={erid} maxLength={100} spellCheck={false} autoCapitalize="none" autoComplete="off"
            aria-invalid={invalidErid} aria-describedby="staff-erid-hint" onChange={e=>setErid(e.target.value)}/>
          <small id="staff-erid-hint" className="staff-field-hint">{invalidErid?'Используйте только латинские буквы и цифры.':'Скопируйте идентификатор рекламы из ОРД.'}</small>
        </label>
        <label className="staff-check"><input type="checkbox" checked={paid} onChange={e=>setPaid(e.target.checked)}/>
          <span>Оплата подтверждена<small>Поставьте отметку после поступления оплаты.</small></span></label>
      </fieldset>
      <p className="bl-caption">{withdrawing?'После сохранения предложение исчезнет с витрины.':publishing?'После сохранения предложение появится на витрине при действующем сроке и оформленном договоре.':'Для публикации нужны проверка предложения, erid и подтверждение оплаты.'}</p>
      {error && <div className="bl-notice bl-notice--error staff-retry" role="alert">{error}{(conflict||partnerDemo)&&<button type="button" className="bl-btn bl-btn--s" onClick={()=>void refresh()}>Обновить кампанию</button>}</div>}
      <div className="bl-row staff-form-actions"><button className="bl-btn bl-btn--primary" disabled={busy || !changed || invalidErid || conflict}>{busy?'Сохраняем…':buttonLabel}</button>
        {review.publicId && <Link className="bl-btn" to={marketOfferPath(review.publicId)}>Открыть на витрине</Link>}</div>
    </form></section>
}

function SubmissionCard({ value, assetBase }: { value: V4Submission; assetBase: string }) {
  const { business, email, offer, offerImage, logoImage } = value
  const image = partnerDemo ? value.mvp?.photo?.src ?? '' : offerImage !== null ? assetBase + '/offer-image' : ''
  const logo = partnerDemo ? value.mvp?.logo?.src || '' : logoImage !== null ? assetBase + '/logo' : ''
  const theme = offerTheme(business.category)
  const site = normalizeBusinessWebsite(business.website)
  const illustration = !value.mvp && 'illustration' in theme ? import.meta.env.BASE_URL + 'img/near/' + theme.illustration + '.avif' : ''
  return <>
    <div className="staff-case" id="staff-materials">
      <div className="staff-case-column">
        <section className="bl-section pad staff-panel">
          <h2 className="bl-h3">Бизнес и контакты</h2>
          <Fields rows={[
            ['ИНН', business.inn], ['Сфера бизнеса', business.category],
            ['Представитель партнёра', value.contactName],
            ['Настройка', value.setupMode === 'quick' ? 'Быстрая' : value.setupMode === 'manual' ? 'Самостоятельная' : '—'],
            ['Телефон', business.phone && <a href={'tel:' + business.phone.replace(/[^+\d]/g, '')}>{business.phone}</a>],
            ['Почта', email ? <><a href={'mailto:' + email}>{email}</a> <span className="bl-tag bl-tag--success">Подтверждена</span></> : null],
            ['Сайт', site ? <a href={site} target="_blank" rel="noreferrer">{business.website}</a> : business.website],
            ...(value.mvpProfile?.addr ? [['Адрес при оформлении', value.mvpProfile.addr] as [string,string]] : []),
            ['Город бизнеса', business.city], ['Формат', value.online ? 'Только онлайн' : 'Точки продаж'],
            ['Адреса точек', value.addresses.some(Boolean) && <ul>{value.addresses.filter(Boolean).map((address, index) => <li key={index}>{address}</li>)}</ul>],
            ['Договор на размещение',value.contract?(value.contract.signedAt?'Получен подписанный экземпляр':'Ожидаем подписанный экземпляр'):value.offerAccepted?'Оферта принята по прежнему порядку':'Нет отметки'],
          ]}/>
        </section>
        <ContractDetails value={value}/>
        <section className="bl-section pad staff-panel">
          <h2 className="bl-h3">Аудитория</h2>
          <Fields rows={[
            ...(value.mvp ? [['Настройка аудитории', value.mvp.mode === 'manual' ? 'Вручную' : 'Автоматически'] as [string,string]] : []),
            ['География', audienceGroups[0].choices[value.audience[0]]],
            ...(value.audience[0] === 1 ? [['Город показа', value.audienceCity ?? business.city] as [string, string]] : []),
            ...audienceGroups.slice(1).map((group, i): [string, string] => [group.title[0].toUpperCase() + group.title.slice(1), group.choices[value.audience[i + 1]]]),
            ['Пожелания', value.triggers],
          ]}/>
        </section>
      </div>
      <section className="bl-section pad staff-panel staff-offer">
        <h2 className="bl-h3">{value.mvp?'На витрине «Лучшее рядом»':'Оффер'}</h2>
        {value.mvp ? <MarketCardPreview advertiser={value.contract?.company || business.name} offer={{...campaignMarketCard({
          id:value.id,name:value.contract?.company || business.name,offer,partner:value.mvp,image,logo,erid:value.review.erid,category:business.category,
          website:business.website,online:value.online,addresses:value.addresses}),...value.marketCopy}}/>
          : <CampaignCreative name={value.contract?.company || business.name} offer={offer} image={image} illustration={illustration} logo={logo} disabled={false}/>}
        <Fields rows={[
          ...(value.mvp?.check ? [['Средний чек', value.mvp.check + ' ₽'] as [string,string]] : []),
          ...(value.mvp?.fee ? [['Комиссия', value.mvp.fee + ' %'] as [string,string]] : []),
          ...(value.mvp?.via ? [['Передача заказов', value.mvp.via] as [string,string]] : []),
          ['Текст', offer.title], ['Скидка', offer.discount && offer.discount + '%'], ['Промокод', offer.promo],
          ['Действует до', offer.until && offer.until.split('-').reverse().join('.')], ['Акция 1 + 1', offer.gift ? 'Да' : 'Нет'],
          ...(!value.mvp ? [
            ['Макет', offer.layout ? offerLayouts[offer.layout] : 'Автоматически'], ['Цвет', offer.background ?? tones[offer.tone]],
            ['Увеличенный креатив', offer.zoom ? 'Да' : 'Нет'],
          ] as [string,string][] : []),
        ]}/>
        {(image || logo) && <div className="staff-attachments bl-row">
          {image && <a className="bl-btn bl-btn--s" href={partnerDemo ? image : image + '?download=1'} title={offerImage ?? undefined} download={offerImage ?? true}><Download size={16} aria-hidden="true"/>Скачать фото</a>}
          {logo && <a className="bl-btn bl-btn--s" href={partnerDemo?logo:logo + '?download=1'} title={logoImage ?? undefined} download><Download size={16} aria-hidden="true"/>Скачать логотип</a>}
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
    <div className="staff-case-title"><h1 className="bl-display-l">Сотрудники</h1><p className="bl-secondary">Рабочие адреса с доступом к кампаниям</p></div>
    <section className="bl-section pad staff-panel" aria-labelledby="staff-add-title">
      <h2 className="bl-h3" id="staff-add-title">Добавить сотрудника</h2>
      <form className="staff-member-form bl-row" onSubmit={event => void submit(event)}>
        <label className="bl-field"><span className="bl-field__label">Рабочая почта</span>
          <input className="bl-input" type="email" name="employeeEmail" autoComplete="off" placeholder="name@company.ru" aria-describedby="staff-member-hint" maxLength={254} required disabled={adding}
            value={input} onChange={event => { setInput(event.target.value); setError(''); setAdded('') }}/>
        </label>
        <button className="bl-btn bl-btn--primary" disabled={adding || !input.trim()}><Plus size={18} aria-hidden="true"/>{adding ? 'Добавляем…' : 'Добавить'}</button>
      </form>
      <p className="bl-caption staff-member-feedback" id="staff-member-hint">После добавления сотрудник сможет запросить код для входа на этот адрес.</p>
      {error && <p className="bl-notice bl-notice--error staff-member-feedback" role="alert">{error}</p>}
      {added && <p className="bl-notice bl-notice--success staff-member-feedback" role="status">Доступ добавлен для {added}. Сотрудник может войти по коду из письма.</p>}
    </section>
    <section className="bl-section pad staff-panel" aria-labelledby="staff-members-title">
      <h2 className="bl-h3" id="staff-members-title">У кого есть доступ</h2>
      {result.isPending && <p className="bl-secondary" role="status">Загружаем список…</p>}
      {result.error && !expired && <Retry error={result.error} retry={() => void result.refetch()}/>}
      {result.data && !result.error && <div className="bl-table-wrap"><table className="bl-table staff-members-table">
        <thead><tr><th scope="col">Рабочая почта</th><th scope="col">Роль</th><th scope="col">Добавлен, МСК</th></tr></thead>
        <tbody>{result.data.members.map(member => <tr key={member.email}>
          <td>{member.email}</td><td>{member.role === 'admin' ? 'Администратор' : 'Сотрудник'}</td>
          <td>{member.addedAt === null ? '—' : dateTime.format(member.addedAt)}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </>
}

function StaffContractPanel({record,onChange,standalone=false}:{record:ContractRecord;onChange:()=>void;standalone?:boolean}) {
  const Icon=record.signedAt?CheckCircle2:FileText
  const Heading=standalone?'h1':'h2'
  return <section className="bl-section pad staff-panel staff-contract" id="staff-contract">
    <div className="staff-panel-head"><Heading className={standalone?'bl-h2':'bl-h3'}>Договор кампании</Heading>
      <span className="crm-status" data-status={record.signedAt?'published':'contract'}><Icon size={15} aria-hidden="true"/>{record.signedAt?'Подписан':'Ожидает подписи'}</span></div>
    <ContractDocument staff record={record} onChange={onChange}/>
  </section>
}

function StaffContract({email,id,onExpired}:{email:string;id:string;onExpired:()=>void}){
  const result=useQuery({queryKey:[queryKey,email,'contract',id],queryFn:({signal})=>staffRequest<ContractRecord>('/contracts/'+encodeURIComponent(id),{signal}),retry:false})
  const expired=result.error instanceof StaffError && result.error.status===401
  useEffect(()=>{if(expired)onExpired()},[expired,onExpired])
  if(result.data?.submissionId)return <Navigate to={home+'/'+encodeURIComponent(result.data.submissionId)} replace/>
  return <>
    <Link className="bl-btn staff-back" to={home}><ArrowLeft size={18} aria-hidden="true"/>Все кампании</Link>
    {result.isPending?<p role="status" className="bl-secondary">Открываем договор…</p>:result.error?(!expired&&<Retry error={result.error} retry={()=>void result.refetch()}/>):<StaffContractPanel standalone record={result.data} onChange={()=>void result.refetch()}/>}
  </>
}

export default function V4Staff() {
  const { id, offerKey, contractId } = useParams()
  const [params]=useSearchParams()
  const location=useLocation()
  const offersPage=!!useMatch('/app/staff/offers/:offerKey?')
  const session = useMvpSession(), nav = useNavigate()
  const teamPage = id === 'team'
  const [error, setError] = useState<unknown>(null), [signingOut,setSigningOut] = useState(false)
  useEffect(() => {
    if (!id) analytics.view('/app/staff')
    else if (teamPage && session.role === 'admin') analytics.view('/app/staff/team')
  },[teamPage,id,session.role])
  const expired = useCallback(() => {
    queryClient.removeQueries({queryKey:[queryKey]})
    void queryClient.invalidateQueries({queryKey:sessionKey})
    nav('/app/',{replace:true})
  },[nav])
  async function logout() {
    setSigningOut(true); setError(null)
    try { await mvpRequest('/logout',{},session.email); queryClient.setQueryData(sessionKey,null); expired() }
    catch (e) { setError(e) }
    finally { setSigningOut(false) }
  }
  const { email, role } = session
  return <AccountCabinet logout={<button type="button" className="bl-btn bl-btn--s" disabled={signingOut} onClick={() => void logout()}><LogOut size={16} aria-hidden="true"/>выйти</button>}>
        {error != null && <Retry error={error} retry={() => void logout()}/>}
        {contractId ? <StaffContract email={email} id={contractId} onExpired={expired}/> : offersPage && !offerKey ? <Navigate replace to={{pathname:home,search:location.search}} state={location.state}/>
          : offerKey || (!id && params.get('catalog')==='1') ? <StaffOffers offerKey={offerKey} email={email} request={staffRequest} onExpired={expired}/> : teamPage ? role === 'admin'
          ? <StaffTeam adminEmail={email} onExpired={expired}/>
          : <p className="bl-notice" role="status">Управлять доступом могут администраторы. <Link to={home}>К кампаниям</Link></p>
          : id ? <SubmissionDetails email={email} id={id} onExpired={expired}/>
          : <CampaignBoard email={email} onExpired={expired}/>}
  </AccountCabinet>
}
