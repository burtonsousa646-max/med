import { marketOfferPath } from '../../shared/market'
import { cloneElement, useEffect, useId, useMemo, useRef, useState, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, CircleAlert, Clock3, Ellipsis, ClipboardList, MousePointerClick, Repeat, Ticket, TicketPercent, type LucideIcon } from 'lucide-react'
import { ContractStep, ContractDocument, contractKey } from './CampaignContract'
import type { ContractRecord } from '../../shared/campaign-contract'
import { useSearchParams } from 'react-router'
import { toast } from '../ui'
import { OfferSurfaces } from './OfferSurfaces'
import { MarketCardPreview, summaryFor } from './BenefitCard'
import { OfferTermsDialog } from './OfferTermsDialog'
import { promoMarketCard } from '../../shared/campaign-market'
import type { OfferAiInput, OfferAiResponse } from '../../shared/offer-ai'
import { emptyOffer } from '../../shared/campaign-offer'
import { MvpAudience, OfferLocations } from './MvpAudience'
import { audienceText, submittedTargeting, promoDay, promoErrors, type MvpSession, type Promo, type Receipt } from '../../shared/mvp-promo'
import { CompanyInnForm, LogoutButton, useMvpSession, mvpRequest, errorMessage, draftKey } from './MvpSession'
import { demoSiteProfile, partnerDemo } from './mvp-demo'
import { CabinetDashboard } from './CabinetDashboard'
import { AccountCabinet, CampaignStatus } from './AccountCabinet'
import { readSiteInfo, queryClient } from '../api'
import { normalizeBusinessWebsite, offerSourceHint } from '../../shared/campaign-business'
import { companyFromPage, searchPage, pageSearchQuery, siteActivityExcerpt, type SiteCompany } from '../../shared/site-company'
import { mergeSource, offerFromTerms, siteOfferFields, placementTerms, type ContractInput, type PartnerDraft, type SavedPartnerDraft } from '../../shared/partner-campaign-draft'
import { readDraft, draftUrl, recoverDraft, useDraftSave } from './PartnerDraft'
import { analytics } from '../analytics'
import { MvpPhoto, preparePhoto } from './MvpPhoto'
import { prepareAsset } from './CampaignSiteAssets'
import './offer-editor.css'
import './mvp-campaign.css'
import { rub } from '../data'

/* ───────── шаг 1: тип кампании, как «новая кампания» в Директе ───────── */
const TYPES: { id: string; t: string; d: string; icon: LucideIcon; on?: boolean }[] = [
  { id: 'promo', t: 'промокод на покупку', d: 'Абонент получает ваш код и покупает со скидкой. '+placementTerms, icon: TicketPercent, on: true },
  { id: 'click', t: 'клиенты на сайт', d: 'Приведём абонентов на сайт или в Карты, оплата за переход.', icon: MousePointerClick },
  { id: 'coupon', t: 'купон со скидкой', d: 'Клиент покупает купон в приложении и гасит у вас на кассе.', icon: Ticket },
  { id: 'lead', t: 'заявки', d: 'Имя и телефон клиента — в почту или CRM, оплата за заявку.', icon: ClipboardList },
  { id: 'sub', t: 'подписка на сервис', d: 'Оплата со счёта телефона каждый месяц, вам — доля платежа.', icon: Repeat },
]

export function PartnerCabinet({children}:{children:ReactNode}) {
  return <AccountCabinet logout={<LogoutButton/>}>{children}</AccountCabinet>
}

export function PartnerCompany() {
  const session = useMvpSession(), profile = session.profile!
  const [params]=useSearchParams(), nav=useNavigate()
  const back=params.get('return')??''
  useEffect(()=>{if(profile && /^\/app\/materials(?:\?|$)/.test(back))nav(back,{replace:true})},[profile,back,nav])
  const [editing,setEditing] = useState(false)
  const [feedback,setFeedback] = useState('')
  const changeButton=useRef<HTMLButtonElement>(null)
  function closeEditor() {
    setEditing(false)
    requestAnimationFrame(()=>changeButton.current?.focus())
  }
  useEffect(() => { analytics.view('/app/company') }, [])
  if (!profile) return <PartnerCabinet><section className="bl-section mvp-sheet"><h1 className="bl-h2">ваша компания</h1>
    <p>{back.startsWith('/app/materials')?'Укажите компанию, чтобы добавить её реквизиты на постер. Затем вы вернётесь к материалам.':'Укажите ИНН компании или ИП. Сохранённые реквизиты можно использовать при оформлении договора.'}</p>
    <CompanyInnForm session={session}/></section></PartnerCabinet>
  return <PartnerCabinet>
    <div className="page-title staff-page-title"><h1 className="bl-display-l">Компания</h1></div>
    <section className="bl-section pad staff-panel bl-stack">
      <h2 className="bl-h3">{profile.company}</h2>
      <dl className="staff-fields"><div><dt>ИНН</dt><dd>{profile.inn}</dd></div>
        {profile.addr && <div><dt>Адрес</dt><dd>{profile.addr}</dd></div>}
      </dl>
      {editing ? <>
        <h3 className="bl-h4">Новая компания</h3>
        <p className="bl-caption">Проверьте данные компании перед подтверждением.</p>
        <CompanyInnForm session={session} onClose={closeEditor} onConfirm={()=>setFeedback('Данные компании обновлены.')}/>
      </> : <div><button type="button" ref={changeButton} className="bl-btn" onClick={()=>{setFeedback('');setEditing(true)}}>Сменить компанию</button></div>}
      {feedback && <p role="status">{feedback}</p>}
    </section>
  </PartnerCabinet>
}

export function PartnerCampaigns() {
  useEffect(() => { analytics.view('/app/campaigns') }, [])
  return <PartnerCabinet><CabinetDashboard/></PartnerCabinet>
}

export function MvpNew() {
  const nav = useNavigate(), [planned,setPlanned]=useState(false)
  useEffect(() => { analytics.view('/app/campaigns/formats') }, [])
  return <PartnerCabinet>
        <section className="bl-section bl-section--wide mvp-sheet">
          <h1 className="bl-h1">новая кампания</h1>
          <p className="bl-lead">Покажем ваше предложение абонентам билайна рядом с вами: в витрине «лучшее рядом», в приложении и пушах.</p>
          <div className="mvp-types">
            {TYPES.filter(type=>type.on||planned).map(({ id, t, d, icon: Icon, on }) => (
              <button key={id} className={`mvp-type${on ? ' is-on' : ''}`} aria-disabled={!on}
                onClick={() => on ? nav(draftUrl(crypto.randomUUID())) : toast(`«${t}» ещё в разработке. Пока доступен промокод`)}>
                <span className="mvp-type__top"><span className="bl-h4">{t}</span>{!on && <span className="bl-tag">в разработке</span>}</span>
                <span className="bl-caption">{d}</span>
                <span className="mvp-type__icon"><Icon size={on ? 40 : 32} strokeWidth={1.6} aria-hidden="true" /></span>
              </button>
            ))}
          </div>
          <button type="button" className="bl-btn bl-btn--ghost" aria-expanded={planned} onClick={()=>setPlanned(!planned)}>{planned?'Скрыть планируемые форматы':'Планируемые форматы (4)'}</button>
        </section>
      </PartnerCabinet>
}

/* ───────── шаг 2: оффер промокода, оферта и запуск ───────── */
const SUGGEST: Promo = { design: 'plain', code: '', off: '', cond: '', site: '', till: promoDay(30) }

function Field({ label, err, hint, wide, children }: {
  label: string; err?: string; hint?: string; wide?: boolean; children: ReactElement<ComponentProps<'input' | 'textarea'>>
}) {
  const id = useId()
  const description = [children.props['aria-describedby'], (err || hint) && id].filter(Boolean).join(' ')
  return (
    <label className={`bl-field${err ? ' is-error' : ''}${wide ? ' is-wide' : ''}`}>
      <span className="bl-field__label" id={id+'-label'}>{label}</span>
      {cloneElement(children, {'aria-labelledby':id+'-label','aria-describedby':description || undefined})}
      {(err || hint) && <span id={id} className={err?'bl-field__caption':'bl-caption'}>{err || hint}</span>}
    </label>
  )
}

function OfferSuggestion({session, promo, draftId, onApply}:{session:MvpSession; promo:Promo; draftId:string; onApply:(text:string)=>void}) {
  const [busy,setBusy] = useState(false), [suggestion,setSuggestion] = useState(''), [message,setMessage] = useState('')
  async function generate() {
    setBusy(true); setSuggestion(''); setMessage('')
    try {
      const input: OfferAiInput = { mode:'manual', name:promo.brandName ?? '', category:promo.activity ?? '',
        offer:{ ...emptyOffer, title:promo.cond, discount:promo.off, until:promo.till },
        request:'Предложи одну короткую формулировку для карточки на русском, до шестидесяти символов. Сохрани указанные условия и суммы. Верни текст в patch.title. Не придумывай ограничений.',
        hasImage:false, hasLogo:false }
      const result = await mvpRequest<OfferAiResponse>('/offer-ai',input,session.email,draftId,AbortSignal.timeout(28_000))
      const answer = result.source === 'disabled' ? undefined : result.answer
      const text = answer?.patch.title?.trim()
      if (text && text.length <= 60) setSuggestion(text)
      else if(answer?.question)setMessage(answer.question)
      else fromTerms()
    } catch { fromTerms() }
    finally { setBusy(false) }
  }
  function fromTerms(){
    const text=offerFromTerms(promo)
    setSuggestion(text)
    setMessage(text?'Вариант из ваших данных.':'Укажите название бренда или условия акции, чтобы собрать текст.')
  }
  return <div className="bl-stack">
    <div><button type="button" className="bl-btn bl-btn--s" disabled={busy} onClick={generate}>{busy ? 'Готовим вариант…' : 'Предложить текст оффера'}</button></div>
    <div aria-live="polite">{suggestion && <><p>{suggestion}</p><button type="button" className="bl-btn bl-btn--s" onClick={()=>{onApply(suggestion);setSuggestion('')}}>Использовать текст</button></>}{message && <p className="bl-caption">{message}</p>}</div>
  </div>
}

type SetupStep = {
  title:string
  description:string
  state:'incomplete'|'complete'|'waiting'|'loading'|'error'
}

const promoFieldLabels:Record<keyof ReturnType<typeof promoErrors>,string>={
  code:'Промокод',off:'Скидка',cond:'Условие для клиента',site:'Сайт',till:'Срок действия',
  fee:'Комиссия',check:'Средний чек',addresses:'Точки продаж',city:'Город показа',
}

const stepStates = {
  incomplete:'Шаг не завершён', complete:'Шаг завершён', waiting:'Ожидает подписи',
  loading:'Загрузка', error:'Статус неизвестен',
}
const stepIcons = {complete:Check,waiting:Clock3,loading:Ellipsis,error:CircleAlert}

const reviewStates = {complete:'Готово',incomplete:'Требует заполнения',waiting:'Ожидает подписи',loading:'Загрузка',error:'Ошибка загрузки'}
const submissionHints:Partial<Record<SetupStep['state'],string>>={
  incomplete:'Сформируйте договор для запуска кампании.',
  waiting:'После начала запуска кампания останется на этапе договора. Менеджер подтвердит подпись, и начнётся модерация.',
  complete:'После запуска начнётся модерация. Показы начнутся после публикации.',
}

function ReviewItem({title,state,detail,action,actionLabel,onEdit,children}:{
  title:string; state:SetupStep['state']; detail:string; action:string; actionLabel:string; onEdit:()=>void; children?:ReactNode
}) {
  const Icon=state==='incomplete' ? null : stepIcons[state]
  return <li data-state={state}>
    <span className="mvp-review__mark" role="img" aria-label={reviewStates[state]}>{Icon && <Icon size={16} strokeWidth={2.4} aria-hidden="true"/>}</span>
    <div className="mvp-review__item">
      <h3 className="bl-h4">{title}</h3>
      <p>{detail}</p>
      {children}
    </div>
    <button type="button" className="bl-btn bl-btn--s" aria-label={actionLabel} onClick={onEdit}>{action}</button>
  </li>
}

function CampaignStepper({items,step,onSelect,disabled}:{
  items:SetupStep[]; step:number; onSelect:(step:number)=>void; disabled:boolean
}) {
  return <nav className="mvp-stepper" aria-label="Настройка кампании">
    <ol>{items.map(({title,description,state},index)=>{
      const number=index+1
      const Icon=state==='incomplete'?null:stepIcons[state]
      return <li key={title} data-state={state}>
        <button type="button" onClick={()=>onSelect(number)} disabled={disabled}
          aria-current={step===number?'step':undefined} aria-label={number+'. '+title}
          aria-describedby={'setup-state-'+number+' setup-step-'+number}>
          <span className="mvp-stepper__marker" aria-hidden="true">{Icon?<Icon size={17} strokeWidth={2.3}/>:number}</span>
          <span className="mvp-stepper__title">{title}</span>
          <span hidden id={'setup-state-'+number}>{stepStates[state]}.</span>
          <span className="mvp-stepper__description" id={'setup-step-'+number}>{description}</span>
        </button>
      </li>
    })}</ol>
  </nav>
}

export function MvpPromo() {
  const session=useMvpSession(), [params]=useSearchParams()
  const [legacy]=useState(()=>readDraft(session))
  const [fallback]=useState(()=>legacy?.key??crypto.randomUUID())
  const id=params.get('draft')
  const valid=!!id && /^[a-f0-9-]{36}$/i.test(id)
  const result=useQuery({queryKey:['partner-draft',session.email,session.profile?.inn??'',id],enabled:valid,
    queryFn:()=>mvpRequest<SavedPartnerDraft|null>('/drafts/'+id,undefined,session.email),retry:false,staleTime:0,gcTime:0})
  if(!valid)return <Navigate replace to={draftUrl(fallback)}/>
  if(result.isError)return <PartnerCabinet><p role="alert">{errorMessage(result.error)}</p><button className="bl-btn" onClick={()=>void result.refetch()}>Повторить</button></PartnerCabinet>
  return <DraftLoader key={id} id={id} remote={result.data} legacy={legacy?.key===id?legacy:null}/>
}

function DraftLoader({id,remote,legacy}:{id:string;remote:SavedPartnerDraft|null|undefined;legacy:ReturnType<typeof readDraft>}) {
  // Keep the editor mounted when first identification changes the session query key.
  const first=useRef<SavedPartnerDraft|null|undefined>(undefined)
  if(first.current===undefined && remote!==undefined)first.current=remote
  if(first.current===undefined)return <PartnerCabinet><p role="status">Открываем черновик…</p></PartnerCabinet>
  return <PromoEditor id={id} remote={first.current} legacy={legacy}/>
}

function PromoEditor({id,remote,legacy}:{id:string;remote:SavedPartnerDraft|null;legacy:ReturnType<typeof readDraft>}) {
  const session=useMvpSession(),me=session.profile??{inn:'',company:'Ваша компания',addr:'',website:''},nav=useNavigate()
  const [params]=useSearchParams()
  const [draft]=useState<PartnerDraft>(()=>recoverDraft(session.email,id,remote)??(legacy
    ? {promo:legacy.promo,step:[3,1,2][legacy.step-1]??1,adReviewed:legacy.adReviewed,audienceReviewed:false,sourceReady:true}
    : {promo:{...SUGGEST,till:promoDay(30),addresses:['']},step:params.get('step')==='contract'?3:1,adReviewed:false,audienceReviewed:false,sourceReady:false}))
  const [step,setStep]=useState(draft.step),[adReviewed,setAdReviewed]=useState(draft.adReviewed),[audienceReviewed,setAudienceReviewed]=useState(draft.audienceReviewed)
  const [sourceReady,setSourceReady]=useState(draft.sourceReady),[siteBusy,setSiteBusy]=useState(false),[siteMessage,setSiteMessage]=useState('')
  const [editingBrand,setEditingBrand]=useState(false),[brandMessage,setBrandMessage]=useState('')
  const [offerText,setOfferText]=useState('')
  const [imported,setImported]=useState(draft.imported)
  const [searchLink,setSearchLink]=useState('')
  const [preview,setPreview]=useState(false),[validationRequested,setValidationRequested]=useState(false)
  const siteRequest=useRef<AbortController|null>(null)
  useEffect(()=>()=>siteRequest.current?.abort(),[])
  const contract=useQuery({queryKey:contractKey(session.email,id),queryFn:()=>mvpRequest<ContractRecord|null>('/contracts/'+id,undefined,session.email),refetchInterval:10_000,retry:false})
  const record=contract.data??null
  const saveContract=(r:ContractRecord)=>{queryClient.setQueryData(contractKey(session.email,id),r);void queryClient.invalidateQueries({queryKey:['mvp-campaigns',session.email]})}
  const [contractInput,setContractInput]=useState<ContractInput>(draft.contractInput??{})
  const [p, setP] = useState<Promo>(draft.promo)
  const [uploading, setUploading] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sending, setSending] = useState(false), pending = useRef(false)
  const attempted=useRef(false)
  const data=useMemo(()=>({promo:p,step,adReviewed,audienceReviewed,sourceReady,contractInput,imported}),[p,step,adReviewed,audienceReviewed,sourceReady,contractInput,imported])
  const save=useDraftSave(session.email,id,data,remote)
  useEffect(()=>{analytics.view('/app/campaigns/new')},[])
  useEffect(()=>{
    if(save.status==='Сохранено' && legacy){try{sessionStorage.removeItem(draftKey(session))}catch{}}
  },[save.status,legacy,session])
  function openOfferEditor(message:string) {
    setEditingBrand(false)
    setBrandMessage('')
    setSourceReady(true)
    setOfferText('')
    setSearchLink('')
    setSiteMessage(message)
    requestAnimationFrame(()=>document.getElementById('promo-brand-heading')?.focus())
  }
  function applySource(fields:Partial<Promo>,website?:string,message='') {
    const next=mergeSource(p,fields,website,imported)
    if(website && (!p.logo || p.logo.website))next.promo.logo=fields.logo || (p.logo?.website===website ? p.logo : undefined)
    setP(next.promo)
    setImported(next.imported)
    openOfferEditor(message)
  }
  async function readWebsite(onlyBrand=false) {
    const report=onlyBrand?setBrandMessage:setSiteMessage
    const website=normalizeBusinessWebsite(p.site)
    if(!website){report('Проверьте адрес сайта.');return}
    const page=new URL(website)
    const hint=offerSourceHint(page)
    if(hint){report(hint);return}
    const ctrl=new AbortController();siteRequest.current=ctrl;setSiteBusy(true);report('');setSearchLink('')
    try {
      let reason='На странице нет описания предложения. Попробуйте другую ссылку или вставьте текст.'
      try {
        const info=partnerDemo ? {profile:demoSiteProfile(website),assets:[]} : await readSiteInfo(website,AbortSignal.any([ctrl.signal,AbortSignal.timeout(12000)]),{brandOnly:true})
        const site=info.profile
        if(ctrl.signal.aborted)return
        const fields=siteOfferFields(site)
        const company=companyFromPage(page,site.subject,site.description,site.name===site.subject?'':site.name)
        let logo:Promo['logo']
        if(!p.logo || p.logo.website){
          for(const asset of info.assets.filter(a=>a.kind==='logo' && !/^(?:www\.)?ozon\.ru$/.test(page.hostname))){
            try{
              const icon=asset.source==='icon'
              const file=await prepareAsset(asset,0)
              logo={...await preparePhoto(file,'logo',true),name:icon?'Иконка сайта':'Логотип с сайта',website}
              break
            }catch{ /* Try the next candidate, such as a favicon. */ }
          }
        }
        if(ctrl.signal.aborted)return
        if(fields.cond || logo){
          if(onlyBrand){
            setP(current=>normalizeBusinessWebsite(current.site)!==website?current:{...current,brandName:current.brandName||company.brandName,
              activity:current.activity||company.activity,logo:current.logo&&!current.logo.website?current.logo:logo||current.logo})
            report(logo?'Логотип получен с сайта.':'Данные сайта проверены.')
          }else if(fields.code||fields.off)applySource({...fields,...company,logo},website)
          else applySource({...company,logo},website,'С сайта загружены данные компании.')
          return
        }
      } catch(error) {
        if(ctrl.signal.aborted)return
        if(error instanceof Error)reason=error.message
      }
      const indexed=searchPage(website)
      if(indexed){
        setSearchLink('https://yandex.ru/search/?'+new URLSearchParams({text:pageSearchQuery(indexed)}))
        if(!partnerDemo){
          report('Ищем описание компании в Яндексе…')
          const result=await mvpRequest<{company:SiteCompany|null}>('/site-search',{website:indexed.href},session.email,undefined,AbortSignal.any([ctrl.signal,AbortSignal.timeout(6500)])).catch(()=>null)
          if(ctrl.signal.aborted)return
          if(result?.company){
            if(onlyBrand){
              setP(current=>normalizeBusinessWebsite(current.site)!==website?current:{...current,brandName:current.brandName||result.company?.brandName,activity:current.activity||result.company?.activity})
              report('Описание найдено в Яндексе.')
            }else applySource(result.company,website,'Данные о компании взяты из поиска Яндекса.')
            return
          }
        }
      }
      report(reason)
    } finally {if(!ctrl.signal.aborted)setSiteBusy(false)}
  }
  const set = (k: keyof Promo, num?: boolean) => (e: { target: { value: string } }) =>
    setP({ ...p, [k]: num ? e.target.value.replace(/\D/g, '') : k === 'code' ? e.target.value.toUpperCase().replace(/\s/g, '') : e.target.value })
  const hasBrand=!!(p.brandName?.trim() || p.activity?.trim() || p.logo)
  const brandDescription=p.activity && p.activity===imported?.values.activity ? siteActivityExcerpt(p.activity,true) : p.activity?.trim()
  const advertiser=record?.company || ''
  const marketCard=promoMarketCard(p,advertiser || 'Название бренда',session.profile?.category)
  const termsDialog=useRef<HTMLDialogElement>(null)
  const cardPreview=<MarketCardPreview offer={marketCard} advertiser={advertiser} onPreview={()=>termsDialog.current?.showModal()}/>
  const err = promoErrors(p)
  const invalidFields=(Object.keys(err) as (keyof typeof err)[]).filter(key=>err[key])
  const offerIssues=invalidFields.filter(key=>key!=='addresses' && key!=='city')
  const adValid=offerIssues.length===0 && !err.addresses
  const audienceValid=!err.city
  const contractState:SetupStep['state']=record?.signedAt?'complete':record?'waiting':contract.isPending?'loading':contract.isError?'error':'incomplete'
  const contractDescriptions={
    complete:'Менеджер подтвердил подпись', waiting:'Ждём подписанный экземпляр',
    incomplete:'Заполните реквизиты для подписи', loading:'Загружаем договор', error:'Проверьте статус договора',
  }
  const hasOffer=!!(p.code||p.off||p.cond)
  const offerSummary=hasOffer
    ? [p.code,p.off && p.off+'%',p.cond,p.till && 'до '+p.till.split('-').reverse().join('.')].filter(Boolean).join(' · ')
    : 'Укажите промокод и размер скидки.'
  const pointSummary=p.online?'Только онлайн':p.addresses?.map(a=>a.trim()).filter(Boolean).join(' · ') || 'Добавьте адрес точки или выберите «Работаю только онлайн».'
  const submissionHint=invalidFields.length ? undefined : submissionHints[contractState]
  const steps:SetupStep[]=[
    {title:'Оффер',state:adReviewed&&adValid&&sourceReady?'complete':'incomplete',description:'Условия скидки и точки продаж'},
    {title:'Аудитория',state:audienceReviewed&&audienceValid?'complete':'incomplete',description:'Кому и где показать оффер'},
    {title:'Договор',state:contractState,description:contractDescriptions[contractState]},
  ]
  function selectStep(next:number,focusId?:string) {
    if(next===step && !focusId){setPreview(false);return}
    flushSync(()=>{
      if(step===1 && next!==step)setAdReviewed(sourceReady&&adValid)
      if(step===2 && next!==step)setAudienceReviewed(audienceValid)
      if(next===1 && focusId)setSourceReady(true)
      setStep(next);setPreview(false)
    })
    const heading=next===1?(sourceReady||focusId?'promo-brand-heading':'promo-source-heading'):next===2?'promo-audience-heading':'promo-contract'
    const target=focusId?document.getElementById(focusId):null
    const focusTarget=target??document.getElementById(heading)
    focusTarget?.focus()
  }
  function fixStep(next:number,field:string) {
    selectStep(next,'promo-'+field)
  }
  async function launch() {
    if (pending.current) return
    if (!record || invalidFields.length) {
      setValidationRequested(true)
      requestAnimationFrame(()=>document.getElementById('promo-missing')?.focus())
      return
    }
    pending.current = true; setSending(true); setSendError('')
    const retrying = attempted.current || legacy?.attempted===true
    attempted.current = true
    analytics.event('mvp_submit_attempt')
    try {
      const draftVersion=await save.flush()
      const promo = { ...p, ...submittedTargeting(p) }
      const result = await mvpRequest<{id: string; created: boolean}>('/campaigns', { key: id, inn: me.inn, promo, draftVersion, awaitSignature: !record.signedAt }, session.email)
      if (result.created || retrying) analytics.event('mvp_campaign_submitted', { online: !!p.online, has_image: !!promo.photo, address_count: promo.addresses?.length ?? 0 })
      save.finish()
      void queryClient.invalidateQueries({queryKey:['mvp-campaigns',session.email]})
      toast('Кампания '+p.code+' сохранена')
      nav('/app/campaigns', {replace:true,state:{submittedId:result.id}})
    } catch (e) { setSendError(errorMessage(e)); analytics.event('mvp_submit_error') }
    finally { pending.current = false; setSending(false) }
  }
  if(record?.submissionId && !attempted.current)return <Navigate to={'/app/campaigns/'+record.submissionId} replace/>
  return (
    <PartnerCabinet>
      <div className="mvp-title">
        <Link className="bl-btn bl-btn--ghost bl-caption" to="/app/campaigns/formats"><ArrowLeft size={16} />все форматы</Link>
        <h1 className="bl-h2">промокод на покупку</h1>
      </div>
      <div className="mvp-savebar"><span role="status">{save.status}</span>{save.conflict?
        <button className="bl-btn bl-btn--s" onClick={save.reload}>Открыть сохранённую версию</button>:
        !['Сохраняем…','Сохранено'].includes(save.status)&&<button className="bl-btn bl-btn--s" onClick={()=>void save.flush().catch(()=>{})}>Повторить сохранение</button>}
        <button className="bl-btn bl-btn--ghost" disabled={save.conflict||sending||uploading||siteBusy} onClick={async()=>{try{await save.flush();nav('/app/campaigns')}catch{}}}>Сохранить и выйти</button></div>
      <CampaignStepper items={steps} step={step} onSelect={selectStep} disabled={sending||uploading||siteBusy}/>
      {step===1 && !sourceReady && <section className="bl-section mvp-sheet mvp-site-step bl-stack"><h2 className="bl-h3" id="promo-source-heading" tabIndex={-1}>оффер</h2>
        <form className="bl-stack" onSubmit={e=>{e.preventDefault();if(!siteBusy)void readWebsite()}}>
          <Field label="Сайт компании или страница предложения"><input className="bl-input" inputMode="url" autoComplete="url" placeholder="example.ru" maxLength={250} value={p.site} disabled={siteBusy} aria-describedby="offer-source-help" onChange={e=>{set('site')(e);setSiteMessage('');setSearchLink('')}}/></Field>
          <p className="bl-caption" id="offer-source-help">Для маркетплейса укажите ссылку на товар, магазин или акцию. Найденные данные можно отредактировать.</p>
          {siteMessage&&<p role="status">{siteMessage}</p>}
          {searchLink&&!siteBusy&&<a href={searchLink} target="_blank" rel="noreferrer">Посмотреть страницу в поиске Яндекса</a>}
          <div className="bl-row"><button className="bl-btn bl-btn--primary" disabled={siteBusy||!p.site.trim()}>{siteBusy?'Ищем данные…':'Предзаполнить по сайту'}</button>
          <button type="button" className="bl-btn" disabled={siteBusy} onClick={()=>openOfferEditor('')}>Заполнить вручную</button></div>
        </form>
        <details className="mvp-source-text"><summary>Вставить текст предложения</summary>
          <form className="bl-stack" onSubmit={e=>{e.preventDefault();if(!siteBusy&&offerText.trim())applySource(siteOfferFields({name:'',subject:offerText.trim().replace(/\s+/g,' '),description:''}))}}>
            <Field label="Текст со страницы"><textarea className="bl-input" rows={3} maxLength={6000} value={offerText} onChange={e=>setOfferText(e.target.value)} placeholder="Скопируйте условия акции вместе со скидкой и промокодом, если они указаны."/></Field>
            <div><button className="bl-btn" type="submit" disabled={siteBusy||!offerText.trim()}>Заполнить из текста</button></div>
          </form>
        </details>
        <div className="mvp-next-row"><button type="button" className="bl-btn" disabled={siteBusy} onClick={()=>selectStep(2)}>Далее</button></div>
      </section>}
      {step===1 && sourceReady && <form noValidate className={'mvp-promo mvp-offer-editor '+(preview?'is-preview':'')} onSubmit={e=>{
        e.preventDefault();if(!uploading&&!siteBusy)selectStep(2)
      }}>
        <button type="button" className="bl-btn mvp-preview-toggle" aria-pressed={preview} onClick={()=>setPreview(!preview)}>{preview?'Вернуться к офферу':'Предпросмотр оффера'}</button>
        <div className="mvp-card-stack">
          {siteMessage&&<p role="status">{siteMessage}</p>}
          <section className="bl-section mvp-sheet mvp-brand" aria-labelledby="promo-brand-heading">
            <div className="mvp-brand__header">
              {!editingBrand && p.logo && <img className="mvp-brand__logo" src={p.logo.src} alt="Логотип партнёра" width="44" height="44"/>}
              <div className="mvp-brand__heading">
                <h2 className={!editingBrand && p.brandName?.trim()?'bl-caption':'bl-h4'} id="promo-brand-heading" tabIndex={-1}>Бренд партнёра</h2>
                {!editingBrand && p.brandName?.trim() && <p className="bl-h4">{p.brandName}</p>}
              </div>
              <button type="button" className="bl-btn bl-btn--s mvp-brand__toggle" aria-expanded={editingBrand} aria-controls="promo-brand-fields"
                disabled={siteBusy||uploading} onClick={()=>{setEditingBrand(!editingBrand);setBrandMessage('')}}>
                {editingBrand?'Готово':hasBrand?'Изменить':'Добавить'}
              </button>
            </div>
            {!editingBrand && brandDescription && <p className="mvp-brand__description">{brandDescription}</p>}
            <div id="promo-brand-fields" hidden={!editingBrand}>
              {editingBrand && <fieldset className="mvp-group mvp-brand__fields" aria-labelledby="promo-brand-heading" disabled={siteBusy||uploading}>
                <Field label="Название бренда"><input className="bl-input" value={p.brandName??''} maxLength={80} onChange={set('brandName')}/></Field>
                <Field label="Чем занимается компания"><textarea className="bl-input" rows={3} value={p.activity??''} maxLength={100} onChange={set('activity')}/></Field>
                <div className="mvp-brand__assets">
                  {p.logo && <img className="mvp-brand__logo" src={p.logo.src} alt="Логотип партнёра" width="44" height="44"/>}
                  <MvpPhoto kind="logo" photo={p.logo} busy={uploading||siteBusy} onBusy={setUploading} onChange={logo=>setP(current=>({...current,logo}))}/>
                </div>
                {p.site.trim() && (!p.brandName?.trim() || !p.activity?.trim() || !p.logo || (p.logo.website && p.logo.website!==normalizeBusinessWebsite(p.site))) &&
                  <button type="button" className="bl-btn bl-btn--ghost bl-btn--s mvp-brand__import" onClick={()=>void readWebsite(true)}>{siteBusy?'Ищем на сайте…':'Заполнить с сайта'}</button>}
                {brandMessage && <p className="bl-caption" role="status">{brandMessage}</p>}
              </fieldset>}
            </div>
          </section>
          <section className="bl-section mvp-sheet">
            <fieldset className="mvp-group">
              <legend className="bl-h4">предложение для клиента</legend>
              <div className="mvp-terms">
                <Field label="промокод" hint="От 4 до 20 букв и цифр без пробелов" err={validationRequested?err.code:undefined}><input className="bl-input" aria-invalid={validationRequested&&!!err.code} id="promo-code" placeholder="Например, START15" value={p.code} onChange={set('code')} maxLength={20} /></Field>
                <Field label="скидка, %" hint="От 1 до 90%" err={validationRequested?err.off:undefined}><input className="bl-input" aria-invalid={validationRequested&&!!err.off} inputMode="numeric" id="promo-off" placeholder="15" value={p.off} onChange={set('off', true)} maxLength={2} /></Field>
                <Field label="условие для клиента" hint="До 60 символов" err={validationRequested?err.cond:undefined} wide><input className="bl-input" aria-invalid={validationRequested&&!!err.cond} id="promo-cond" value={p.cond} onChange={set('cond')} placeholder="например, на первый заказ от 800 ₽" maxLength={60} /></Field>
                {!p.cond.trim() && !err.off && <div className="is-wide">
                  <OfferSuggestion key={JSON.stringify([p.brandName,p.activity,p.off,p.till])} session={session} promo={p} draftId={id}
                    onApply={cond=>{
                      setP(current=>current.cond.trim()?current:{...current,cond})
                      document.getElementById('promo-cond')?.focus()
                    }}/>
                </div>}
                <Field label="сайт, где применить код (необязательно)" err={validationRequested?err.site:undefined}><input className="bl-input" aria-invalid={validationRequested&&!!err.site} id="promo-site" value={p.site} maxLength={250} onChange={set('site')} placeholder="mycoffee.ru" /></Field>
                <Field label="действует до" hint="Выберите дату позже сегодняшней" err={validationRequested?err.till:undefined}><input className="bl-input" aria-invalid={validationRequested&&!!err.till} type="date" id="promo-till" value={p.till} min={promoDay(1)} onChange={set('till')} /></Field>
                {(['fee','check'] as const).map(key=>p[key]!==undefined&&(validationRequested||err[key])&&<Field key={key} label={promoFieldLabels[key]} err={validationRequested?err[key]:undefined}>
                  <input id={'promo-'+key} className="bl-input" inputMode="numeric" value={p[key]} aria-invalid={validationRequested && !!err[key]} onChange={set(key,true)}/>
                </Field>)}
              </div>
            </fieldset>
          </section>
          <section className="bl-section mvp-sheet">
            <fieldset className="mvp-group">
              <legend className="bl-h4">Фото для карточки</legend>
              <MvpPhoto photo={p.photo} busy={uploading} onBusy={setUploading} onChange={photo => setP(current => ({ ...current, photo, design: 'plain' }))}/>
            </fieldset>
          </section>
          <OfferLocations value={p} showErrors={validationRequested} onChange={patch=>setP(current=>({...current,...patch}))}/>
        </div>

        <aside className="bl-section mvp-sheet mvp-live-preview">
          <h2 className="bl-h4">На витрине «Лучшее рядом»</h2>
          {cardPreview}
          <details className="mvp-other-surfaces"><summary>Примеры других размещений</summary>
            <OfferSurfaces compact inlinePlaces>{cardPreview}</OfferSurfaces>
          </details>
        </aside><div className="mvp-next-row"><button className="bl-btn bl-btn--primary" type="submit" disabled={uploading||siteBusy}>Далее</button></div>
        <OfferTermsDialog dialog={termsDialog} brand={summaryFor(marketCard).brand} offer={marketCard.offer}/>
      </form>}
      {step===2 && <form className="mvp-card-stack mvp-setup-sheet" noValidate onSubmit={e=>{e.preventDefault();selectStep(3)}}>
        <MvpAudience value={p} showErrors={validationRequested} onChange={patch=>{
          if(patch.mode)analytics.event('mvp_audience_mode',{method:patch.mode==='auto'?'automatic':'manual'})
          setP(current=>({...current,...patch}))
        }}/>
        <div className="mvp-next-row"><button type="submit" className="bl-btn bl-btn--primary">Далее</button></div>
      </form>}
      {step===3&&<div className="mvp-card-stack mvp-setup-sheet">
        <section className="bl-section mvp-sheet bl-stack"><h2 className="bl-h3" id="promo-contract" tabIndex={-1}>договор</h2>
          {contract.isPending?<p role="status">Открываем договор…</p>:contract.isError?<p role="alert">{errorMessage(contract.error)} <button className="bl-btn" onClick={()=>void contract.refetch()}>Повторить</button></p>:<ContractStep fileBusy={uploading} onReading={setUploading} beforeGenerate={save.flush} input={contractInput} update={patch=>setContractInput(v=>({...v,...patch}))} id={id} record={record} onSave={saveContract}/>}
        </section>
        <section className="bl-section mvp-sheet mvp-review" aria-labelledby="promo-review-title">
          <h2 className="bl-h3" id="promo-review-title">перед запуском</h2>
          {validationRequested && (!!invalidFields.length||!record) &&
            <p id="promo-missing" tabIndex={-1}>Для запуска заполните отмеченные пункты.</p>}
          <ul className="mvp-review__list" role="list" aria-label="Готовность кампании">
            <ReviewItem title="Оффер" state={offerIssues.length?'incomplete':'complete'} detail={offerSummary}
              action={hasOffer?'Изменить':'Заполнить'} actionLabel={hasOffer?'Изменить оффер':'Заполнить оффер'} onEdit={()=>fixStep(1,offerIssues[0]??'code')}>
              {validationRequested && offerIssues.length>0 && <ul className="mvp-review__issues">{offerIssues.map(key=>
                <li key={key}><button type="button" onClick={()=>fixStep(1,key)}>{promoFieldLabels[key]} · {err[key]}</button></li>)}</ul>}
            </ReviewItem>
            <ReviewItem title="Точки продаж" state={err.addresses?'incomplete':'complete'} detail={pointSummary}
              action={err.addresses?'Указать':'Изменить'} actionLabel={err.addresses?'Указать точки продаж':'Изменить точки продаж'}
              onEdit={()=>fixStep(1,err.addresses?'addresses':'locations')}/>
            <ReviewItem title="Аудитория" state={audienceValid?'complete':'incomplete'} detail={audienceValid?audienceText(p):err.city}
              action={audienceValid?'Изменить':'Указать город'} actionLabel={audienceValid?'Изменить аудиторию':'Указать город показа'}
              onEdit={()=>audienceValid?selectStep(2):fixStep(2,'city')}/>
            <ReviewItem title="Договор" state={contractState} detail={contractDescriptions[contractState]}
              action="К договору" actionLabel="Перейти к договору" onEdit={()=>fixStep(3,'contract')}/>
          </ul>
          <div className="mvp-review__terms">
            <p>{placementTerms}</p>
            {submissionHint && <p>{submissionHint}</p>}
          </div>
          {sendError&&<p role="alert" className="bl-error">{sendError}</p>}
          <div className="mvp-next-row"><button className="bl-btn bl-btn--primary" disabled={contract.isPending||sending||uploading||save.conflict} onClick={()=>void launch()}>{sending?'Запускаем…':record&&!record.signedAt?'Начать запуск':'Запустить кампанию'}</button></div>
        </section>
      </div>}
    </PartnerCabinet>
  )
}

export function MvpDone() {
  const [params]=useSearchParams()
  const session = useMvpSession(), {id} = useParams()
  const receipt = useQuery({queryKey:['mvp-receipt', session.email, id], queryFn: () => mvpRequest<Receipt>('/campaigns/' + encodeURIComponent(id!), undefined, session.email), enabled:!!id, refetchInterval:15_000, retry:false, gcTime:0})
  useEffect(() => { if (receipt.data) analytics.view('/app/campaigns/detail') }, [receipt.data])
  if (!id) return <Navigate to="/app/campaigns" replace/>
  if (receipt.isPending) return <PartnerCabinet><p role="status">Открываем кампанию…</p></PartnerCabinet>
  if (receipt.error) return <PartnerCabinet><p role="alert">{errorMessage(receipt.error)}</p><button className="bl-btn" onClick={() => void receipt.refetch()}>Повторить</button><Link to="/app/campaigns">К моим кампаниям</Link></PartnerCabinet>
  const {promo:p, profile:me} = receipt.data
  const {status,publicId} = receipt.data
  const advertiser=receipt.data.contract?.company || me.company
  const note = {authorization:'Проверяем данные компании и контакт для связи.', contract:'Подпишите договор и передайте экземпляр менеджеру. После подтверждения готовая кампания перейдёт на модерацию.', review:'Сотрудник проверит условия предложения и маркировку.', published:'Предложение опубликовано на витрине «Лучшее рядом».', archived:'Кампания в архиве. Вы можете создать новую на её основе.', stopped:'Показы остановлены. Предложение снято с витрины.'}[status]
  return (
    <PartnerCabinet>
      {receipt.data?.contract&&<details className="bl-section mvp-sheet" open={params.get('section')==='contract'||undefined}><summary>Договор кампании</summary><ContractDocument record={receipt.data.contract}/></details>}
      <div className="two mvp-done ym-hide-content">
        <section className="bl-section mvp-sheet">
          <CampaignStatus status={status}/>
          <h1 className="bl-h1">Кампания {p.code}</h1>
          <p className="bl-lead">{note}</p>
          {publicId && <Link className="bl-btn bl-btn--primary" to={marketOfferPath(publicId)}>Открыть на витрине</Link>}
          <div className="bl-row">
            {me.inn === session.profile?.inn && <Link className="bl-btn" to={'/app/materials?campaign='+encodeURIComponent(id)}>Создать постер A4</Link>}
            <Link className="bl-btn bl-btn--dark" to="/app/campaigns/formats">Создать ещё кампанию</Link>
            <Link className="bl-btn" to="/app/campaigns/new" onClick={e => {
              try { sessionStorage.setItem(draftKey(session), JSON.stringify({ key: crypto.randomUUID(), step:2, promo: p })) }
              catch { e.preventDefault(); toast('Не удалось скопировать условия в черновик') }
            }}>Создать на основе этой кампании</Link>
          </div>
        </section>
        <aside className="bl-section mvp-sheet mvp-preview">
          <h2 className="bl-h4">На витрине «Лучшее рядом»</h2>
          <MarketCardPreview offer={{...promoMarketCard(p,advertiser,me.category),...receipt.data.marketCopy}} advertiser={advertiser}/>
          <dl className="kv kv--narrow mvp-kv">{p.site&&<><dt>сайт</dt><dd>{p.site}</dd></>}{p.check && <><dt>средний чек</dt><dd>{rub(+p.check)}</dd></>}{p.fee && <><dt>комиссия</dt><dd>{p.fee} %</dd></>}{p.via && <><dt>передача заказов</dt><dd>{p.via}</dd></>}<dt>аудитория</dt><dd>{audienceText(p)}</dd>
            {p.online ? <><dt>точки продаж</dt><dd>только онлайн</dd></> : !!p.addresses?.length && <><dt>точки продаж</dt><dd><ul className="mvp-submitted-points">{p.addresses.map(a => <li key={a}>{a}</li>)}</ul></dd></>}
          </dl>
        </aside>
      </div>
    </PartnerCabinet>
  )
}
