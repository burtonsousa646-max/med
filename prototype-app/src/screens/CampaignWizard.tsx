import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, ImagePlus, Mic, PencilLine, RotateCcw, Sparkles, X } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion, useAnimationControls, useReducedMotion } from 'motion/react'
import { useNavigate, useParams } from 'react-router'
import { campaignStage, campaignStages, emptyCampaignDraft, type CampaignDraft } from './campaign-draft'
import { MovingLabel, glide, settle } from './LandingMotion'
import { Field } from './CampaignField'
import { OfferReveal, useOfferGeneration } from './OfferGeneration'
import { OfferAssistant } from './OfferAssistant'
import { emptyOffer, type OfferDraft } from './offer-assistant-demo'
import { BusinessSetup, type BusinessPhase } from './BusinessSetup'
import { AudienceSetup, CampaignSuccess, type AudienceSummary } from './CampaignAudience'
import { innError, phoneError, textError, localDate } from '../../shared/campaign-business'
import { Creative, creativeOf } from '../creative'
import { DEMO_PROFILE, type DemoBusinessProfile } from './campaign-demo'
import './business-setup.css'
import './campaign-wizard.css'

const steps = ['ваш бизнес', 'дизайн оффера', 'выбор клиентов']
const introductions = [
  ['начнём с вашего бизнеса', 'Расскажите о себе. С этого начинается знакомство с будущими клиентами.'],
  ['Ваш оффер готов', 'Проверьте предложение. Изменить текст и оформление можно в чате.'],
  ['Найдём ваших клиентов', 'Выберите, где и кому будет интересно ваше предложение.'],
]
const groups = [
  { title: 'геолокация', choices: ['рядом с точкой', 'весь город', 'вся Россия'] },
  { title: 'пол', choices: ['любой', 'женщины', 'мужчины'] },
  { title: 'возраст', choices: ['любой', '18–34', '35 и старше'] },
  { title: 'уровень дохода', choices: ['любой', 'средний', 'выше среднего'] },
  { title: 'жизненные ситуации', choices: ['любые', 'недавно переехали', 'день зарплаты'] },
]

type LocalSpeech = {
  lang: string
  processLocally?: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}

function FileField({ label, file, onChange }: { label: string; file: File | null; onChange: (file: File | null) => void }) {
  const reduce = useReducedMotion()
  const feedbackId = useId()
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const version = useRef(0)
  useEffect(() => () => { version.current++ }, [])
  const feedback = (message: string) => { setError(message); input.current?.setCustomValidity(message) }
  return <div className="bl-field v3-upload-field">
    <label><span className="bl-field__label">{label}</span>
    <span className="v3-file" data-filled={Boolean(file)}>
      <span aria-hidden="true"><ImagePlus size={18}/>{checking ? 'проверяем…' : file ? 'заменить' : 'выбрать файл'}</span>
      {file && <small title={file.name}><MovingLabel>{file.name}</MovingLabel></small>}
      <AnimatePresence>{file && !error && <motion.i className="v3-file__done" initial={reduce ? false : { opacity: 0, scale: .7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{duration:reduce ? 0:.2}}><Check size={16} /></motion.i>}</AnimatePresence>
      <input ref={input} type="file" aria-label={label} aria-invalid={Boolean(error)} aria-describedby={feedbackId} accept="image/png,image/jpeg,image/webp,image/avif" onInvalid={event=>{event.preventDefault(); setError(event.currentTarget.validationMessage)}} onChange={async event => {
        const selected = event.target.files?.[0]
        if (!selected) return
        const token = ++version.current
        setChecking(false)
        if (!['image/png','image/jpeg','image/webp','image/avif'].includes(selected.type)) { feedback('Подойдёт PNG, JPG, WebP или AVIF.'); return }
        if (selected.size > 5 * 1024 * 1024) { feedback('Размер файла — не больше 5 МБ.'); return }
        setChecking(true)
        input.current?.setCustomValidity('Дождитесь проверки изображения.')
        const url = URL.createObjectURL(selected)
        try {
          const img = new Image(); img.src = url; await img.decode()
          if (version.current !== token) return
          if (!img.naturalWidth || !img.naturalHeight) throw new Error('Empty image')
          feedback(''); onChange(selected)
        } catch { if(version.current === token) feedback('Не удалось открыть изображение. Выберите другой файл.') }
        finally { URL.revokeObjectURL(url); if(version.current === token) setChecking(false) }
      }} />
    </span></label>
    <span id={feedbackId} className="v3-upload-feedback" role="status">{error || 'PNG, JPG, WebP или AVIF · до 5 МБ'}</span>
    {(file || error) && <button type="button" className="v3-text-button" onClick={()=>{version.current++;setChecking(false);feedback('');onChange(null);if(input.current)input.current.value=''}}>убрать файл</button>}
  </div>
}

function useImage(file: File | null) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    const url = file ? URL.createObjectURL(file) : ''
    setSrc(url)
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [file])
  return src
}

export default function CampaignWizard({ open, onClose, presentation = 'dialog', initialDraft, onDraftChange, storageState }: {
  open: boolean; onClose: () => void; presentation?: 'dialog' | 'page'; initialDraft?: CampaignDraft;
  onDraftChange?: (draft: CampaignDraft) => Promise<boolean>; storageState?: 'loading' | 'saving' | 'saved' | 'error';
}) {
  const page = presentation === 'page'
  const routerNavigate = useNavigate()
  const { stage: routeStage } = useParams()
  const initial = initialDraft ?? emptyCampaignDraft()
  const initialStage = page ? campaignStage(routeStage, initial) : 0
  const [reached, setReached] = useState(initial.reached)
  const reduce = useReducedMotion()
  const sceneMotion = useAnimationControls()
  const dialogMotion = useAnimationControls()
  const locked = useRef(false)
  const epoch = useRef(0)
  const direction = useRef(1)
  const [busy, setBusy] = useState(false)
  const [closing, setClosing] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [finishError, setFinishError] = useState('')
  const [filled, setFilled] = useState(initial.filled)
  const [generating, setGenerating] = useState(false)
  const [revising, setRevising] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const confirmedInn = useRef(initial.confirmedInn)
  const speech = useRef<LocalSpeech | null>(null)
  const [step, setStep] = useState(Math.max(0, Math.min(2, initialStage - 1)))
  const [complete, setComplete] = useState(initialStage === 4)
  const [business, setBusiness] = useState(initial.business)
  const [addresses, setAddresses] = useState(initial.addresses)
  const [businessPhase, updateBusinessPhase] = useState<BusinessPhase>(initialStage === 0 ? 'identify' : 'review')
  const [profile, setProfile] = useState<DemoBusinessProfile | null>(initial.hasProfile ? { ...DEMO_PROFILE, ...initial.business } : null)
  const [searching, setSearching] = useState(false)
  const [online, setOnline] = useState(initial.online)
  const lookup = useRef<number | null>(null)
  const generatedTitle = useRef(initial.generatedTitle)
  const form = useRef<HTMLFormElement>(null)
  const [offer, setOffer] = useState<OfferDraft>({ ...initial.offer, tone: initial.offer.tone === 'green' ? 'violet' : initial.offer.tone })
  const [editing, setEditing] = useState(false)
  const manualId = useId()
  const assistant = useRef<HTMLDivElement>(null)
  const manual = useRef<HTMLDetailsElement>(null)
  const [offerImage, setOfferImage] = useState<File | null>(initial.offerImage)
  const [logoImage, setLogoImage] = useState<File | null>(initial.logoImage)
  const [audience, setAudience] = useState(initial.audience)
  const [triggers, setTriggers] = useState(initial.triggers)
  const [listening, setListening] = useState(false)
  const [voiceMessage, setVoiceMessage] = useState('')
  const image = useImage(offerImage)
  const logo = useImage(logoImage)
  const name = business.name.trim() || 'ваш бизнес'
  const title = offer.title.trim() || 'скидка на первый заказ'
  const audienceSummary: AudienceSummary = {
    place: audience[0] === 0 ? `${business.city} · рядом с точками` : audience[0] === 1 ? business.city.trim() || 'Город не указан' : 'Вся Россия',
    people: groups.slice(1, 4).flatMap((group, index) => audience[index + 1] ? [group.choices[audience[index + 1]]] : []).join(' · ') || 'Все клиенты',
    moment: ['В любой момент', 'После переезда', 'В день зарплаты'][audience[4]],
  }
  const creative = { ...creativeOf(name, `−${offer.discount || '20'}% на первую покупку`, 0), tone: offer.tone,
    small: /^Скидка \d+% на первую покупку$/.test(title) ? 'на первую покупку' : title, ...(offer.gift ? { big: '1 + 1' } : {}) }
  const preview = <div className="campaign-summary-creative"><Creative o={creative} erid="реклама" wide/>{image && <img src={image} alt={title}/>}</div>
  const finishGeneration = useCallback(() => {
    setGenerating(false)
    requestAnimationFrame(() => stepHeading.current?.focus({ preventScroll: true }))
  }, [])
  const generation = useOfferGeneration(generating && step === 1 && open && !closing && !busy, finishGeneration)
  const generationStatus = [business.website ? 'изучаю сайт' : 'изучаю ваш бизнес', image ? 'использую ваше изображение' : 'подбираю изображение', logo ? 'добавляю ваш логотип' : 'собираю фирменный стиль', 'последние штрихи'][generation.phase]
  const currentStage = complete ? 4 : step === 0 ? businessPhase === 'identify' ? 0 : 1 : step + 1
  const currentDraft: CampaignDraft = { business, addresses, online, offer, offerImage, logoImage, audience, triggers,
    confirmedInn: confirmedInn.current, generatedTitle: generatedTitle.current, filled, hasProfile: Boolean(profile),
    stage: currentStage, reached: Math.max(reached, currentStage) }

  useEffect(() => { setEditing(false) }, [step, complete])

  useEffect(() => {
    void onDraftChange?.(currentDraft)
  }, [business, addresses, online, offer, offerImage, logoImage, audience, triggers, filled, profile, currentStage, reached, onDraftChange])

  useLayoutEffect(() => {
    if (!page) return
    let allowed = reached
    if (confirmedInn.current !== business.inn || innError(business.inn) || phoneError(business.phone)) allowed = 0
    else if (textError(business.name) || textError(business.category, '', 3) || (!online && (textError(business.city) || addresses.some(address => textError(address, '', 5))))) allowed = Math.min(allowed, 1)
    else if (audience[0] === 1 && textError(business.city)) allowed = Math.min(allowed, 3)
    const target = campaignStage(routeStage, { stage: Math.min(currentStage, allowed), reached: allowed })
    if (routeStage !== campaignStages[target]) routerNavigate(`/v4/create/${campaignStages[target]}`, { replace: true })
    if (target === currentStage) return
    epoch.current++
    cancelLookup()
    speech.current?.abort()
    sceneMotion.stop()
    locked.current = false
    setBusy(false)
    setRevising(false)
    setStep(Math.max(0, Math.min(2, target - 1)))
    setComplete(target === 4)
    updateBusinessPhase(target === 0 ? 'identify' : 'review')
    // Route changes include the browser's Back/Forward buttons; field edits stay on their current screen.
  }, [routeStage, page, routerNavigate])

  function setBusinessPhase(phase: BusinessPhase) {
    updateBusinessPhase(phase)
    if (page) {
      setReached(value => Math.max(value, phase === 'review' ? 1 : 0))
      routerNavigate(`/v4/create/${phase === 'review' ? 'details' : 'business'}`)
    }
  }

  useLayoutEffect(() => {
    const element = dialog.current
    if (!page && open && element) {
      setClosing(false)
      if (!element.open) element.showModal()
      dialogMotion.set(reduce ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 22, scale: .975 })
      void dialogMotion.start({ opacity: 1, y: 0, scale: 1, transition: { duration: reduce ? 0 : .3, ease: glide } })
    }
  }, [open, page, dialogMotion, reduce])

  useLayoutEffect(() => {
    if (!open) return
    const token = epoch.current
    locked.current = true
    setBusy(true)
    scroller.current?.scrollTo(0, 0)
    if (page) window.scrollTo(0, 0)
    heading.current?.focus({ preventScroll: true })
    sceneMotion.set(reduce ? { opacity: 1, x: 0, filter: 'blur(0px)' } : { opacity: 0, x: direction.current * 8, filter: 'blur(0px)' })
    void sceneMotion.start({ opacity: 1, x: 0, filter: 'blur(0px)', transition: { duration: reduce ? 0 : .22, ease: glide } }).then(() => {
      if (epoch.current === token) { locked.current = false; setBusy(false); requestAnimationFrame(() => stepHeading.current?.focus({ preventScroll: true })) }
    })
  }, [open, page, step, complete, businessPhase, sceneMotion, reduce])

  useEffect(() => () => { epoch.current++; speech.current?.abort(); if (lookup.current !== null) window.clearTimeout(lookup.current) }, [])

  function close() {
    epoch.current++
    cancelLookup()
    speech.current?.abort()
    locked.current = false
    setBusy(false)
    setClosing(false)
    onClose()
  }

  async function requestClose() {
    if (closing) return
    if (page) { close(); return }
    cancelLookup()
    epoch.current++
    locked.current = true
    setBusy(true)
    setClosing(true)
    sceneMotion.stop()
    speech.current?.abort()
    await dialogMotion.start({ opacity: 0, y: reduce ? 0 : 12, scale: reduce ? 1 : .985, transition: { duration: reduce ? 0 : .2, ease: glide } })
    dialog.current?.close()
  }

  async function navigate(target: number, done = false) {
    if (locked.current || (target === step && done === complete)) return
    locked.current = true
    setBusy(true)
    setRevising(false)
    speech.current?.abort()
    const token = ++epoch.current
    direction.current = (done ? 3 : target) > (complete ? 3 : step) ? 1 : -1
    await sceneMotion.start({ opacity: 0, x: reduce ? 0 : -direction.current * 10, filter: reduce ? 'blur(0px)' : 'blur(2px)', transition: { duration: reduce ? 0 : .14, ease: glide } })
    if (token !== epoch.current || (!page && !dialog.current?.open)) return
    if (page) {
      const stage = done ? 4 : target === 0 ? 1 : target + 1
      setReached(value => Math.max(value, stage))
      routerNavigate(`/v4/create/${campaignStages[stage]}`)
    }
    setStep(target)
    setComplete(done)
  }

  function containFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]',
    )).filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden' && !element.closest('[inert]'))
    const first = controls[0]
    const last = controls.at(-1)
    const active = document.activeElement
    if (event.shiftKey && (active === first || !controls.some(element => element === active))) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  function validate() {
    const valid = form.current?.checkValidity() ?? false
    if (!valid) {
      const invalid = form.current?.querySelector<HTMLElement>('input:invalid, textarea:invalid, select:invalid')
      const details = invalid?.closest('details')
      if (details) details.open = true
      requestAnimationFrame(() => invalid?.focus())
    }
    return valid
  }

  function cancelLookup(restoreFocus = false) {
    if (lookup.current !== null) window.clearTimeout(lookup.current)
    lookup.current = null
    setSearching(false)
    if (restoreFocus) requestAnimationFrame(() => {
      if ((page || dialog.current?.open) && !locked.current) form.current?.querySelector<HTMLInputElement>('[name="inn"]')?.focus()
    })
  }

  function findBusiness() {
    if (!validate() || lookup.current) return
    setSearching(true)
    lookup.current = window.setTimeout(() => {
      lookup.current = null
      confirmBusinessIdentity()
      setProfile({ ...DEMO_PROFILE, inn: business.inn, phone: business.phone })
      setBusiness(current => ({ ...current, name: DEMO_PROFILE.name, category: DEMO_PROFILE.category, city: DEMO_PROFILE.city }))
      setAddresses([DEMO_PROFILE.registeredAddress])
      setSearching(false)
      direction.current = 1
      setBusinessPhase('review')
    }, 850)
  }

  function confirmBusinessIdentity() {
    if (confirmedInn.current === business.inn) return
    confirmedInn.current = business.inn
    setProfile(null)
    setBusiness(current => ({ ...current, name: '', category: '', city: '' }))
    setAddresses([''])
    setOffer({ ...emptyOffer })
    setOfferImage(null); setLogoImage(null); setFilled(false); setGenerating(false)
    generatedTitle.current = ''
    setReached(1)
    setAudience(groups.map(() => 0)); setTriggers(''); setOnline(false)
  }

  function manualEntry() {
    if (!validate() || searching) return
    confirmBusinessIdentity()
    direction.current = 1
    setBusinessPhase('review')
  }

  function fillOffer() {
    setFilled(true)
    const suggestion = `Скидка ${offer.discount || '20'}% на первую покупку`
    setOffer(current => ({ ...current, title: suggestion, discount: current.discount || '20' }))
    generatedTitle.current = suggestion
  }

  function changeDiscount(discount: string) {
    const title = offer.title === generatedTitle.current ? `Скидка ${discount || '20'}% на первую покупку` : offer.title
    if (offer.title === generatedTitle.current) generatedTitle.current = title
    setOffer({ ...offer, discount, title, gift: false })
  }

  function editOffer() {
    if (!manual.current) return
    const opening = !manual.current.open
    manual.current.open = opening
    if (opening) {
      manual.current.scrollIntoView({ behavior: reduce ? 'instant' : 'smooth', block: 'nearest' })
      manual.current.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
    }
  }

  function voiceOffer() {
    assistant.current?.scrollIntoView({ behavior: reduce ? 'instant' : 'smooth', block: 'start' })
    const mic = assistant.current?.querySelector<HTMLButtonElement>('.offer-mic')
    mic?.focus({ preventScroll: true })
    mic?.click()
  }

  function dictate() {
    if (speech.current) return
    const browser = window as Window & { SpeechRecognition?: new () => LocalSpeech; webkitSpeechRecognition?: new () => LocalSpeech }
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition
    const recognition = Recognition ? new Recognition() : null
    if (!recognition || !('processLocally' in recognition)) {
      setVoiceMessage('Локальная диктовка недоступна. Можно ввести пожелания текстом.')
      return
    }
    recognition.lang = 'ru-RU'
    recognition.processLocally = true
    recognition.onresult = ({ results }) => {
      const value = results[0]?.[0]?.transcript.trim()
      if (value) setTriggers(current => [current.trim(), value].filter(Boolean).join(' ').slice(0, 400))
    }
    recognition.onerror = () => setVoiceMessage('Не удалось распознать речь. Можно ввести пожелания текстом.')
    recognition.onend = () => { speech.current = null; setListening(false) }
    try {
      recognition.start()
      speech.current = recognition
      setListening(true)
      setVoiceMessage('')
    } catch {
      setVoiceMessage('Диктовка недоступна. Можно ввести пожелания текстом.')
    }
  }

  async function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked.current || searching || finalizing || (step === 1 && (generating || revising))) return
    if (complete) { void requestClose(); return }
    if (!validate()) return
    if (step === 0 && businessPhase === 'identify') { void findBusiness(); return }
    if (step === 0) {
      if (innError(business.inn) || phoneError(business.phone)) { setBusinessPhase('identify'); return }
      if (!filled) { fillOffer(); setGenerating(true) }
      if (online) setAudience(current => current.map((value,i)=>i===0?2:value))
    }
    if (step < steps.length - 1) { void navigate(step + 1); return }
    setFinishError('')
    setFinalizing(true)
    try {
      if (onDraftChange && !await onDraftChange({ ...currentDraft, stage: 4, reached: 4 })) throw new Error('Save failed')
      await navigate(2, true)
    } catch { setFinishError('Не удалось сохранить настройки. Попробуйте завершить ещё раз.') }
    finally { setFinalizing(false) }
  }

  const Surface = page ? motion.main : motion.dialog
  const Title = page ? 'h1' : 'h2'
  return (
    <Surface ref={page ? undefined : dialog} className={`v3-dialog campaign-demo${page ? ' campaign-page' : ''}`} data-closing={closing} aria-labelledby="v3-dialog-title" initial={false} animate={page ? undefined : dialogMotion} onClose={page ? undefined : close} onKeyDown={page ? undefined : containFocus} onCancel={page ? undefined : event => { event.preventDefault(); void requestClose() }}>
      <form ref={form} className="v3-dialog__form" onSubmit={next} noValidate>
        <header className="v3-dialog__head">
          <div className="v3-dialog__top">
            <div className="v3-dialog__brand"><span aria-hidden="true"><PencilLine size={18} /></span><Title id="v3-dialog-title" className="bl-h2" ref={heading} tabIndex={-1}>{complete ? 'настройка завершена' : 'настройка кампании'}</Title></div>
            {!page && <button type="button" className="bl-icon-btn" aria-label="Закрыть окно" onClick={() => void requestClose()}><X size={22} aria-hidden="true" /></button>}
          </div>
          <LayoutGroup id="campaign-progress"><ol className="v3-progress" aria-label="Шаги настройки">{steps.map((label, i) => (
            <li key={label} aria-current={i === step && !complete ? 'step' : undefined} className={i < step || complete ? 'is-done' : ''}>
              <button type="button" disabled={busy || searching || finalizing || (i > step && !complete)} onClick={() => void navigate(i)}>{i === step && <motion.span className="v3-step-indicator" layoutId="progress-line" transition={reduce ? { duration: 0 } : settle} />}<span className="v3-progress__number" aria-hidden="true">{i < step || complete ? <motion.span className="v3-progress-check" initial={reduce ? false : { scale: .5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}><Check size={14} /></motion.span> : '0' + (i + 1)}</span>{label}</button>
            </li>
          ))}</ol></LayoutGroup>
        </header>

        <div className="v3-dialog__body" ref={scroller}>
          <motion.div className="v3-dialog__scene" initial={false} animate={sceneMotion} inert={busy}>
          {!complete && <div className="v3-step-intro"><div><h3 ref={stepHeading} tabIndex={-1}>{step === 0 ? businessPhase === 'identify' ? 'начнём с вашего бизнеса' : 'проверьте бизнес и добавьте точки' : step === 1 && generating ? 'Собираем ваш оффер' : introductions[step][0]}</h3><p>{step === 0 ? 'Сформируем оффер на основе информации о компании' : step === 1 && generating ? 'Подготавливаем предложение для вашей компании.' : introductions[step][1]}</p></div><span>0{step + 1} / 03</span></div>}
          {!complete && step === 0 && <BusinessSetup phase={businessPhase} business={business} onChange={setBusiness} profile={profile} searching={searching} onCancel={() => cancelLookup(true)} onManual={manualEntry} addresses={addresses} onAddresses={setAddresses} online={online} onOnline={setOnline} />}
          {!complete && step === 1 && !generating && <div className="v3-campaign-context"><span><Check size={14}/> {name}</span><span>{online ? 'онлайн' : business.city + ' · точек: ' + addresses.filter(a=>a.trim()).length}</span></div>}

          {!complete && step === 1 && <div className="v3-dialog__split campaign-offer-editor" data-generating={generating} data-phase={generation.phase}>
              <section className="v3-preview-column offer-workspace" aria-label="Визуальный редактор оффера">
                <div className="offer-workspace-toolbar" role="toolbar" aria-label="Действия с оффером">
                  <button type="button" disabled={revising || generating} onClick={() => { setGenerating(true); stepHeading.current?.focus({preventScroll:true}) }}><RotateCcw size={16}/>собрать заново</button>
                  <button type="button" disabled={revising || generating} aria-controls={manualId} aria-expanded={editing} onClick={editOffer}><PencilLine size={16}/>{editing ? 'готово' : 'редактировать'}</button>
                </div>
                <div className="v3-offer-stage" data-theme="invert" data-revising={revising} data-zoom={offer.zoom}>
                  <div className="v3-offer-card" aria-busy={generating || revising}>
                    <div className="v3-preview-media"><div className="v3-offer-placeholder"><Creative o={creative} erid="реклама" wide/></div>{image && <motion.img key={image} className="v3-offer-card__image" src={image} alt="" initial={reduce ? false : { opacity: 0, scale: 1.025 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduce ? 0 : .4, ease: glide }} />}{(generating || revising) && <OfferReveal quick={!generating} paused={!generation.visible || busy}/>}</div>
                    {(logo || offer.promo || offer.until) && <div className="v3-offer-card__copy">
                      {logo && <div className="v3-offer-card__brand"><img src={logo} alt={name}/></div>}
                      {offer.promo && <span className="bl-chip">Промокод: {offer.promo}</span>}
                      {offer.until && <span className="bl-caption">до {offer.until.split('-').reverse().join('.')}</span>}
                    </div>}
                  </div>
                </div>
                <details ref={manual} id={manualId} className="campaign-manual" onToggle={event => setEditing(event.currentTarget.open)}><summary hidden>Параметры оффера</summary><fieldset className="v3-fields" disabled={revising || generating}>
                <Field label="заголовок" placeholder="скидка на первый заказ" value={offer.title} onChange={e => setOffer({ ...offer, title: e.target.value })} maxLength={90} required error={textError(offer.title,'Заголовок',5)} />
                <div className="v3-fields__pair"><FileField label="изображение" file={offerImage} onChange={setOfferImage} />
                <FileField label="ваш логотип" file={logoImage} onChange={setLogoImage} /></div>
                <div className="v3-fields__pair">
                  <Field label="промокод" placeholder="ПРИВЕТ" value={offer.promo} onChange={e => setOffer({ ...offer, promo: e.target.value })} maxLength={24} error={offer.promo && !/^[a-zа-яё0-9_-]{2,24}$/i.test(offer.promo) ? 'Промокод: 2–24 буквы, цифры, дефис или подчёркивание.' : ''} />
                  <Field label="скидка, %" type="number" min={1} max={99} step={1} error={offer.discount && (!/^\d+$/.test(offer.discount) || +offer.discount < 1 || +offer.discount > 99) ? 'Скидка — целое число от 1 до 99%.' : ''} placeholder="20" value={offer.discount} onChange={e => changeDiscount(e.target.value)} />
                </div>
                <Field label="действует до" type="date" min={localDate()} error={offer.until && offer.until < localDate() ? 'Выберите сегодня или будущую дату.' : ''} value={offer.until} onChange={e => setOffer({ ...offer, until: e.target.value })} />
                </fieldset></details>
                <button type="button" className="offer-voice-shortcut" disabled={generating || revising} onClick={voiceOffer}><Mic size={16}/>Изменить голосом</button>
                <div className="offer-canvas-status"><span role="status" aria-live="polite"><span className="offer-status-icon" aria-hidden="true">{generating || revising ? <Sparkles size={15}/> : <Check size={15}/>}</span><MovingLabel>{generating ? generationStatus : revising ? 'обновляю предложение' : storageState === 'error' ? 'Не удалось сохранить изменения' : storageState === 'saving' ? 'Сохраняем…' : page ? 'Изменения сохранены' : 'Все изменения применены'}</MovingLabel></span>{generating && <button type="button" onClick={finishGeneration}>показать результат</button>}</div>
              </section>
              <div className="campaign-offer-control-space">
                <div className="offer-preparing-note" aria-hidden={!generating}><span className="offer-source-mark">{name.replace(/^.*«(.+)»$/, '$1')}</span><p>Собираю первый вариант<br/>для вашего бизнеса</p><small>Затем можно поправить словами<br/>или настроить детали вручную.</small></div>
                <div ref={assistant} className="v3-fields campaign-offer-controls" inert={generating} aria-hidden={generating}>
                <OfferAssistant offer={offer} active={open && !closing && !busy && !generating} onChange={value => { generatedTitle.current = /^Скидка \d+% на первую покупку$/.test(value.title) ? value.title : ''; setOffer(value) }} onWorking={setRevising}/>

                </div>
              </div>
            </div>}

          {!complete && step === 2 && <>
            <AudienceSetup groups={groups} values={audience} onChange={setAudience} city={business.city} onCityChange={city => setBusiness(current => ({ ...current, city }))} online={online} addresses={addresses} triggers={triggers} onTriggers={setTriggers} onDictate={dictate} listening={listening} voiceMessage={voiceMessage} disabled={finalizing} summary={audienceSummary} preview={preview}/>
            {finishError && <p className="campaign-finish-error" role="alert">{finishError}</p>}
          </>}
          {complete && <CampaignSuccess headingRef={stepHeading} preview={preview} name={name} offerTitle={title} summary={audienceSummary} saved={page && storageState === 'saved'}/>}
          </motion.div>
        </div>

        <footer className="v3-dialog__actions">
          <span className="v3-dialog__footer-note">{complete ? 'Вы завершили все три шага' : step === 1 ? 'всё можно изменить перед запуском' : step === 0 && businessPhase === 'identify' ? 'без регистрации и запуска рекламы' : `шаг 0${step + 1} из 03`}</span>
          {(step > 0 || complete || businessPhase === 'review') && <button type="button" className="bl-btn" disabled={busy || finalizing} onClick={() => { if (step === 0 && businessPhase === 'review') { direction.current = -1; setBusinessPhase('identify') } else void navigate(complete ? step : step - 1) }}><ArrowLeft size={17} aria-hidden="true" /> {complete ? 'Изменить настройки' : 'назад'}</button>}
          <motion.button type="submit" className="bl-btn bl-btn--dark" disabled={busy || searching || finalizing || (step === 1 && (generating || revising))} whileTap={reduce ? undefined : { scale: .97 }}><MovingLabel>{complete ? 'Готово' : finalizing ? 'Сохраняем настройки…' : step === 1 && generating ? 'готовим предложение…' : searching ? 'ищем бизнес…' : step === 0 ? businessPhase === 'identify' ? 'найти бизнес' : 'собрать оффер' : step === 2 ? 'Завершить настройку' : 'Дальше: выбрать клиентов'}</MovingLabel>{!complete && <ArrowRight size={18} aria-hidden="true" />}</motion.button>
        </footer>
      </form>
    </Surface>
  )
}
