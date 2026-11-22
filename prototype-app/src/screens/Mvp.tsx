import { marketOfferPath } from '../../shared/market'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, NavLink, useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Building2, Megaphone, Plus, ClipboardList, MousePointerClick, Repeat, Ticket, TicketPercent, type LucideIcon } from 'lucide-react'
import { Check, toast } from '../ui'
import { OfferSurfaces } from './OfferSurfaces'
import { CampaignCreative } from './CampaignCreative'
import type { OfferAiInput, OfferAiResponse } from '../../shared/offer-ai'
import { emptyOffer } from '../../shared/campaign-offer'
import { MvpAudience } from './MvpAudience'
import { audienceText, submittedTargeting, designs, promoDay, promoErrors, type MvpSession, type Profile, type Promo, type Receipt, type ReceiptSummary } from '../../shared/mvp-promo'
import { CompanyInnForm, Head, LogoutButton, useMvpSession, mvpRequest, errorMessage, draftKey } from './MvpSession'
import { partnerDemo } from './mvp-demo'
import { AccountCabinet, CampaignStatus } from './AccountCabinet'
import { queryClient } from '../api'
import { analytics } from '../analytics'
import { MvpPhoto } from './MvpPhoto'
import './offer-editor.css'
import './mvp-campaign.css'
import { rub } from '../data'

function readDraft(session: MvpSession) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(draftKey(session)) ?? 'null')
    const legacy = JSON.parse(sessionStorage.getItem('mvp-me') ?? 'null')
    const sameCompany = legacy?.email?.toLowerCase() === session.email && legacy.inn === session.profile!.inn
    const promo = stored?.promo ?? (sameCompany && JSON.parse(sessionStorage.getItem('mvp-promo-draft') ?? 'null'))
    if (!promo || !['code','off','cond','site','till'].every(key => typeof promo[key] === 'string')) return null
    if (promo.addresses && (!Array.isArray(promo.addresses) || !promo.addresses.every((a: unknown) => typeof a === 'string'))) return null
    if (!stored?.attempted) {
      promo.design = 'plain'
      delete promo.fee
      delete promo.check
      delete promo.via
    } else {
      // A retry from an older tab must match the originally submitted design.
      promo.design ??= designs[0].file
    }
    if (promo.usePhoto === false) delete promo.photo
    delete promo.usePhoto
    return { key: stored?.key ?? crypto.randomUUID(), attempted: stored?.attempted === true, promo: { ...promo, addresses: promo.addresses ?? [''] } as Promo }
  } catch { return null }
}

/* ───────── шаг 1: тип кампании, как «новая кампания» в Директе ───────── */
const TYPES: { id: string; t: string; d: string; icon: LucideIcon; on?: boolean }[] = [
  { id: 'promo', t: 'промокод на покупку', d: 'Абонент получает ваш код и покупает со скидкой. Платите процент только с оплаченных покупок.', icon: TicketPercent, on: true },
  { id: 'click', t: 'клиенты на сайт', d: 'Приведём абонентов на сайт или в Карты, оплата за переход.', icon: MousePointerClick },
  { id: 'coupon', t: 'купон со скидкой', d: 'Клиент покупает купон в приложении и гасит у вас на кассе.', icon: Ticket },
  { id: 'lead', t: 'заявки', d: 'Имя и телефон клиента — в почту или CRM, оплата за заявку.', icon: ClipboardList },
  { id: 'sub', t: 'подписка на сервис', d: 'Оплата со счёта телефона каждый месяц, вам — доля платежа.', icon: Repeat },
]

function PartnerCabinet({children}:{children:ReactNode}) {
  const session = useMvpSession()
  const navClass = ({isActive}:{isActive:boolean}) => isActive ? 'is-active' : ''
  return <AccountCabinet home="/app/campaigns" label="Кабинет партнёра"
    navigation={<>
      <NavLink to="/app/campaigns" className={navClass}><Megaphone size={20}/>Мои кампании</NavLink>
      <NavLink to="/app/company" className={navClass}><Building2 size={20}/>Компания</NavLink>
    </>}
    account={<><strong>{session.profile!.company}</strong><span className="bl-caption">{session.email}</span></>}
    logout={<LogoutButton/>}>{children}</AccountCabinet>
}

export function PartnerCompany() {
  const session = useMvpSession(), profile = session.profile!
  const [editing,setEditing] = useState(false)
  useEffect(() => { analytics.view('/app/company') }, [])
  return <PartnerCabinet>
    <div className="page-title staff-page-title"><h1 className="bl-display-l">Компания</h1></div>
    <section className="bl-section pad staff-panel bl-stack">
      <h2 className="bl-h3">{profile.company}</h2>
      <dl className="staff-fields"><div><dt>ИНН</dt><dd>{profile.inn}</dd></div>
        {profile.addr && <div><dt>Адрес</dt><dd>{profile.addr}</dd></div>}
      </dl>
      {editing ? <CompanyInnForm session={session} onClose={()=>setEditing(false)}/>
        : <div><button className="bl-btn" onClick={()=>setEditing(true)}>Сменить компанию</button></div>}
    </section>
  </PartnerCabinet>
}

export function PartnerCampaigns() {
  const session = useMvpSession()
  const [offset, setOffset] = useState(0)
  const list = useQuery({queryKey:['mvp-campaigns', session.email, offset], queryFn: () => mvpRequest<{items: ReceiptSummary[]; more: boolean}>('/campaigns?offset=' + offset, undefined, session.email), refetchInterval:15_000, gcTime:0, retry:false })
  useEffect(() => { analytics.view('/app/campaigns') }, [])
  return <PartnerCabinet>
    <div className="page-title staff-page-title"><h1 className="bl-display-l">Рекламные кампании</h1>
      <Link className="bl-btn bl-btn--primary" to="/app/campaigns/formats"><Plus size={18}/>Новая кампания</Link></div>
    <section className="bl-section pad staff-panel" aria-label="Список кампаний">
      {list.isPending && <p role="status">Загружаем кампании…</p>}
      {list.error && <p role="alert">{errorMessage(list.error)} <button className="bl-btn" onClick={() => void list.refetch()}>Повторить</button></p>}
      {list.data && <>
        {list.data.items.length ? <table className="bl-table partner-campaigns"><thead><tr>
          <th scope="col">Промокод</th><th scope="col">Отправлена</th><th scope="col">Статус</th>
        </tr></thead><tbody>{list.data.items.map(item => <tr key={item.id}>
          <td><Link className="staff-row-link" to={'/app/campaigns/'+item.id}>{item.code}</Link><span className="bl-caption staff-subline">{item.company}</span></td>
          <td>{new Date(item.submittedAt).toLocaleDateString('ru-RU')}</td><td><CampaignStatus status={item.status}/></td>
        </tr>)}</tbody></table> : <p className="bl-body bl-secondary">Здесь появятся ваши кампании после отправки на модерацию.</p>}
        {(offset > 0 || list.data.more) && <div className="staff-pagination bl-row">
          <button className="bl-btn" disabled={!offset} onClick={() => setOffset(offset-25)}>Назад</button>
          <button className="bl-btn" disabled={!list.data.more} onClick={() => setOffset(offset+25)}>Далее</button></div>}
      </>}
    </section>
    {partnerDemo && <div><a className="bl-btn" href="/app/?preview=staff" target="_blank" rel="noopener noreferrer">Открыть демо сотрудника</a></div>}
  </PartnerCabinet>
}

export function MvpNew() {
  const nav = useNavigate()
  useEffect(() => { analytics.view('/app/campaigns/formats') }, [])
  return <div className="bl-page wrap ym-hide-content">
        <Head />
        <section className="bl-section bl-section--wide mvp-sheet">
          <span className="bl-tag bl-tag--soft-violet">можно без опыта</span>
          <h1 className="bl-h1">новая кампания</h1>
          <p className="bl-lead">Покажем ваше предложение абонентам билайна рядом с вами: в витрине «лучшее рядом», в приложении и пушах.</p>
          <div className="mvp-types">
            {TYPES.map(({ id, t, d, icon: Icon, on }) => (
              <button key={id} className={`mvp-type${on ? ' is-on' : ''}`} aria-disabled={!on}
                onClick={() => on ? nav('/app/campaigns/new') : toast(`«${t}» ещё в разработке. Пока доступен промокод`)}>
                <span className="mvp-type__top"><span className="bl-h4">{t}</span>{!on && <span className="bl-tag">в разработке</span>}</span>
                <span className="bl-caption">{d}</span>
                <span className="mvp-type__icon"><Icon size={on ? 40 : 32} strokeWidth={1.6} aria-hidden="true" /></span>
              </button>
            ))}
          </div>
        </section>
      </div>
}

/* ───────── шаг 2: оффер промокода, оферта и запуск ───────── */
const SUGGEST: Promo = { design: 'plain', code: 'START15', off: '15', cond: 'на первый заказ от 800 ₽', site: '', till: promoDay(30) }

function Field({ label, err, wide, children }: { label: string; err?: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`bl-field${err ? ' is-error' : ''}${wide ? ' is-wide' : ''}`}>
      <span className="bl-field__label">{label}</span>
      {children}
      {err && <span className="bl-field__caption">{err}</span>}
    </label>
  )
}

function previewProps(me: Profile, p: Promo, submitted = false) {
  const design = submitted ? designs.find(d => d.file === p.design) : undefined
  return {
    name: me.company, image: p.photo && p.usePhoto !== false ? p.photo.src : design ? import.meta.env.BASE_URL + 'img/offer-variants/' + design.file : '', logo: '', legalNameBelow: true, illustration: '',
    offer: { ...emptyOffer, title: p.cond.trim() || 'Скидка по промокоду', promo: p.code, until: p.till, discount: p.off, tone: design?.tone ?? emptyOffer.tone },
  }
}

function OfferSuggestion({session, promo, draftId, onApply}:{session:MvpSession; promo:Promo; draftId:string; onApply:(text:string)=>void}) {
  const [busy,setBusy] = useState(false), [suggestion,setSuggestion] = useState(''), [message,setMessage] = useState('')
  async function generate() {
    setBusy(true); setSuggestion(''); setMessage('')
    try {
      const profile = session.profile!
      const input: OfferAiInput = { mode:'manual', name:'', category:profile.category ?? '',
        offer:{ ...emptyOffer, title:promo.cond, discount:promo.off, until:promo.till },
        request:'Предложи одну короткую формулировку для карточки на русском, до шестидесяти символов. Сохрани указанные условия и суммы. Верни текст в patch.title. Не придумывай ограничений.',
        hasImage:false, hasLogo:false }
      const result = await mvpRequest<OfferAiResponse>('/offer-ai',input,session.email,draftId)
      const answer = result.source === 'disabled' ? undefined : result.answer
      const text = answer?.patch.title?.trim()
      if (text && text.length <= 60) setSuggestion(text)
      else setMessage(answer?.question || (result.source === 'disabled' ? 'Генерация пока не настроена. Введите условие вручную.' : 'Новой короткой формулировки пока нет. Уточните условие и попробуйте ещё раз.'))
    } catch (e) { setMessage(errorMessage(e)) }
    finally { setBusy(false) }
  }
  return <div className="bl-stack">
    <div><button type="button" className="bl-btn bl-btn--s" disabled={busy} onClick={generate}>{busy ? 'Готовим вариант…' : 'Предложить текст оффера'}</button></div>
    <div aria-live="polite">{suggestion && <><p>{suggestion}</p><button type="button" className="bl-btn bl-btn--s" onClick={()=>{onApply(suggestion);setSuggestion('')}}>Использовать текст</button></>}{message && <p className="bl-caption">{message}</p>}</div>
  </div>
}

export function MvpPromo() {
  const session = useMvpSession(), me = session.profile!, nav = useNavigate()
  const storageKey = draftKey(session)
  const [draft] = useState(() => {
    const saved = readDraft(session)
    return saved ?? { key: crypto.randomUUID(), attempted:false, promo: { ...SUGGEST, site: me.website ?? '', addresses: [''] } }
  })
  const [p, setP] = useState<Promo>(draft.promo)
  const [agree, setAgree] = useState(false), [uploading, setUploading] = useState(false)
  const [storageError, setStorageError] = useState(''), [sendError, setSendError] = useState('')
  const [sending, setSending] = useState(false), pending = useRef(false)
  const attempted = useRef(draft.attempted)
  useEffect(() => { analytics.view('/app/campaigns/new') }, [])
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify({key:draft.key, attempted:attempted.current, promo:p}))
      const old = JSON.parse(sessionStorage.getItem('mvp-me') ?? 'null')
      if (old?.email?.toLowerCase() === session.email && old.inn === me.inn) {
        for (const key of ['mvp-promo-draft','mvp-promo','mvp-me']) sessionStorage.removeItem(key)
      }
      setStorageError('') }
    catch { setStorageError('Черновик не сохранился в этой вкладке. Вы можете отправить его на проверку.') }
  }, [p, storageKey, draft, me.inn, session.email])
  const set = (k: keyof Promo, num?: boolean) => (e: { target: { value: string } }) =>
    setP({ ...p, [k]: num ? e.target.value.replace(/\D/g, '') : k === 'code' ? e.target.value.toUpperCase().replace(/\s/g, '') : e.target.value })
  const err = promoErrors(p), ok = Object.values(err).every(x => !x)
  async function launch() {
    if (pending.current) return
    pending.current = true; setSending(true); setSendError('')
    const retrying = attempted.current
    attempted.current = true
    try { sessionStorage.setItem(storageKey, JSON.stringify({key:draft.key, attempted:true, promo:p})) } catch { /* In-memory retries still work. */ }
    analytics.event('mvp_submit_attempt')
    try {
      const promo = { ...p, ...submittedTargeting(p) }
      const result = await mvpRequest<{id: string; created: boolean}>('/campaigns', { key: draft.key, inn: me.inn, promo, accepted: agree }, session.email)
      if (result.created || retrying) analytics.event('mvp_campaign_submitted', { online: !!p.online, has_image: !!promo.photo, address_count: promo.addresses?.length ?? 0 })
      try { sessionStorage.removeItem(storageKey) } catch { /* The receipt is already on the server. */ }
      void queryClient.invalidateQueries({queryKey:['mvp-campaigns',session.email]})
      toast('Кампания '+p.code+' отправлена на модерацию')
      nav('/app/campaigns', {replace:true})
    } catch (e) { setSendError(errorMessage(e)); analytics.event('mvp_submit_error') }
    finally { pending.current = false; setSending(false) }
  }
  return (
    <div className="bl-page wrap">
      <Head />
      <div className="mvp-title">
        <Link className="bl-btn bl-btn--ghost bl-caption" to="/app/campaigns/formats"><ArrowLeft size={16} />все форматы</Link>
        <h1 className="bl-h2">промокод на покупку</h1>
      </div>
      <form className="two mvp-promo mvp-combined ym-hide-content ym-disable-keys" inert={sending} aria-busy={sending} onSubmit={e => { e.preventDefault(); if (ok && agree && !uploading) void launch() }}>
        <div className="mvp-card-stack">
          <section className="bl-section mvp-sheet">
            <fieldset className="mvp-group">
              <legend className="bl-h4">предложение для клиента</legend>
              <div className="mvp-terms">
                <Field label="промокод" err={err.code}><input className="bl-input" value={p.code} onChange={set('code')} maxLength={20} /></Field>
                <Field label="скидка, %" err={err.off}><input className="bl-input" inputMode="numeric" value={p.off} onChange={set('off', true)} maxLength={2} /></Field>
                <Field label="условие для клиента" wide><input className="bl-input" value={p.cond} onChange={set('cond')} placeholder="например, на первый заказ от 800 ₽" maxLength={60} /></Field>
                <Field label="сайт, где применить код" err={err.site}><input className="bl-input" value={p.site} maxLength={250} onChange={set('site')} placeholder="mycoffee.ru" /></Field>
                <Field label="действует до" err={err.till}><input className="bl-input" type="date" value={p.till} min={promoDay(1)} onChange={set('till')} /></Field>
              </div>
              <OfferSuggestion key={JSON.stringify([p.cond,p.off,p.till])} session={session} promo={p} draftId={draft.key}
                onApply={cond=>setP(current=>({...current,cond}))}/>
            </fieldset>
          </section>
          <section className="bl-section mvp-sheet">
            <fieldset className="mvp-group">
              <legend className="bl-h4">Фото для карточки</legend>
              <MvpPhoto photo={p.photo} busy={uploading} onBusy={setUploading} onChange={photo => setP(current => ({ ...current, photo, design: 'plain' }))}/>
            </fieldset>
          </section>
        </div>

        <aside className="bl-section mvp-sheet mvp-live-preview">
          <OfferSurfaces compact inlinePlaces {...previewProps(me, p)} />
        </aside>

        <div className="mvp-card-stack">
          <MvpAudience value={p} onChange={patch => {
            if (patch.mode) analytics.event('mvp_audience_mode', {method: patch.mode === 'auto' ? 'automatic' : 'manual'})
            setP(current => ({ ...current, ...patch }))
          }}/>
          <section className="bl-section mvp-sheet">
            <div className="mvp-go">
              <Check checked={agree} onChange={value => { setAgree(value); if (value) analytics.event('mvp_terms_accepted') }} label={<>Принимаю <Link to="/v4/offer" target="_blank" rel="noopener noreferrer">оферту на размещение рекламы</Link></>} sub="маркировку и erid оформим сами" />
              <button type="submit" className="bl-btn bl-btn--primary bl-btn--l" disabled={!ok || !agree || uploading || sending}>{sending ? 'Отправляем…' : 'отправить на проверку'}</button>
            </div>
            {sendError && <p role="alert" className="bl-caption bl-error">{sendError}</p>}
            {storageError && <p className="bl-caption bl-error" role="alert">{storageError}</p>}
            {!ok && <p className="bl-caption bl-error" role="status">Проверьте поля, отмеченные красным</p>}
            <p className="bl-caption">{partnerDemo ? 'Это демо. Кампания сохранится в этом браузере.' : 'После проверки пришлём счёт на почту. Показы начнутся после оплаты.'}</p>
          </section>
        </div>
      </form>
    </div>
  )
}

/* ───────── шаг 3: отправлено. Дальше — бэкофис: проверка, счёт на предоплату, запуск ───────── */
export function MvpDone() {
  const session = useMvpSession(), {id} = useParams()
  const receipt = useQuery({queryKey:['mvp-receipt', session.email, id], queryFn: () => mvpRequest<Receipt>('/campaigns/' + encodeURIComponent(id!), undefined, session.email), enabled:!!id, refetchInterval:15_000, retry:false, gcTime:0})
  useEffect(() => { if (receipt.data) analytics.view('/app/campaigns/detail') }, [receipt.data])
  if (!id) return <Navigate to="/app/campaigns" replace/>
  if (receipt.isPending) return <p className="bl-page wrap" role="status">Открываем кампанию…</p>
  if (receipt.error) return <div className="bl-page wrap"><Head/><p role="alert">{errorMessage(receipt.error)}</p><button className="bl-btn" onClick={() => void receipt.refetch()}>Повторить</button></div>
  const {promo:p, profile:me} = receipt.data
  const {status,publicId} = receipt.data
  const note = {review:'Сотрудник проверит условия предложения и маркировку.', awaiting_payment:'Предложение проверено. После подтверждения оплаты оно появится на витрине.', published:'Предложение опубликовано на витрине «Лучшее рядом».', expired:'Срок действия предложения закончился.', stopped:'Показы остановлены. Предложение снято с витрины.'}[status]
  return (
    <div className="bl-page wrap">
      <Head />
      <div className="two mvp-done ym-hide-content">
        <section className="bl-section mvp-sheet">
          <CampaignStatus status={status}/>
          <h1 className="bl-h1">Кампания {p.code}</h1>
          <p className="bl-lead">{note}</p>
          {publicId && <Link className="bl-btn bl-btn--primary" to={marketOfferPath(publicId)}>Открыть на витрине</Link>}
          <div className="bl-row">
            <Link className="bl-btn bl-btn--dark" to="/app/campaigns/formats">Создать ещё кампанию</Link>
            <Link className="bl-btn" to="/app/campaigns/new" onClick={e => {
              try { sessionStorage.setItem(draftKey(session), JSON.stringify({ key: crypto.randomUUID(), promo: p })) }
              catch { e.preventDefault(); toast('Не удалось скопировать условия в черновик') }
            }}>Создать на основе этой кампании</Link>
          </div>
        </section>
        <aside className="bl-section mvp-sheet mvp-preview">
          <h2 className="bl-h4">ваше предложение</h2>
          <div className="mvp-submitted-creative"><CampaignCreative {...previewProps(me, p, true)} disabled={false}/></div>
          <dl className="kv kv--narrow mvp-kv"><dt>сайт</dt><dd>{p.site}</dd>{p.check && <><dt>средний чек</dt><dd>{rub(+p.check)}</dd></>}{p.fee && <><dt>комиссия</dt><dd>{p.fee} %</dd></>}{p.via && <><dt>передача заказов</dt><dd>{p.via}</dd></>}<dt>аудитория</dt><dd>{audienceText(p)}</dd>
            {p.online ? <><dt>точки продаж</dt><dd>только онлайн</dd></> : !!p.addresses?.length && <><dt>точки продаж</dt><dd><ul className="mvp-submitted-points">{p.addresses.map(a => <li key={a}>{a}</li>)}</ul></dd></>}
          </dl>
        </aside>
      </div>
    </div>
  )
}
