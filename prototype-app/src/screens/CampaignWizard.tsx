import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, ImagePlus, Mic, PencilLine, Sparkles, Users, X } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion, useAnimationControls, useReducedMotion } from 'motion/react'
import { useNavigate, useParams } from 'react-router'
import { campaignStage, campaignStages, emptyCampaignDraft, type CampaignDraft } from './campaign-draft'
import { MovingLabel, glide, settle } from './LandingMotion'
import { Field } from './CampaignField'
import { OfferReveal, useOfferGeneration } from './OfferGeneration'
import { OfferAssistant } from './OfferAssistant'
import { emptyOffer, type OfferDraft } from './offer-assistant-demo'
import { BusinessSetup, type BusinessPhase } from './BusinessSetup'
import { innError, phoneError, textError, localDate } from '../../shared/campaign-business'
import { Creative, creativeOf } from '../creative'
import { DEMO_BUSINESS, DEMO_PROFILE, type DemoBusinessProfile } from './campaign-demo'
import './business-setup.css'
import './campaign-wizard.css'

const steps = ['ваш бизнес', 'дизайн оффера', 'выбор клиентов']
const introductions = [
  ['начнём с вашего бизнеса', 'Расскажите о себе. С этого начинается знакомство с будущими клиентами.'],
  ['ваш бизнес. ваша реклама.', 'Из вашего бизнеса — в предложение, которое заметят. Дальше добавьте своё.'],
  ['кому вы будете интересны?', 'Выберите аудиторию и момент, когда ваше предложение будет кстати.'],
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

export default function CampaignWizard({ open, onClose, presentation = 'dialog', initialDraft, onDraftChange }: {
  open: boolean; onClose: () => void; presentation?: 'dialog' | 'page'; initialDraft?: CampaignDraft;
  onDraftChange?: (draft: CampaignDraft) => void;
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
  const [offer, setOffer] = useState<OfferDraft>(initial.offer)
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
  const audienceLabels = groups.map(({ choices }, i) => choices[audience[i]])
  const finishGeneration = useCallback(() => {
    setGenerating(false)
    requestAnimationFrame(() => stepHeading.current?.focus({ preventScroll: true }))
  }, [])
  const generation = useOfferGeneration(generating && step === 1 && open && !closing && !busy, finishGeneration)
  const generationStatus = [business.website ? 'изучаю сайт' : 'изучаю ваш бизнес', image ? 'использую ваше изображение' : 'подбираю изображение', logo ? 'добавляю ваш логотип' : 'собираю фирменный стиль', 'последние штрихи'][generation.phase]
  const currentStage = complete ? 4 : step === 0 ? businessPhase === 'identify' ? 0 : 1 : step + 1

  useEffect(() => {
    onDraftChange?.({ business, addresses, online, offer, offerImage, logoImage, audience, triggers,
      confirmedInn: confirmedInn.current, generatedTitle: generatedTitle.current, filled, hasProfile: Boolean(profile),
      stage: currentStage, reached: Math.max(reached, currentStage) })
  }, [business, addresses, online, offer, offerImage, logoImage, audience, triggers, filled, profile, currentStage, reached, onDraftChange])

  useLayoutEffect(() => {
    if (!page) return
    let allowed = reached
    if (confirmedInn.current !== business.inn || innError(business.inn) || phoneError(business.phone)) allowed = 0
    else if (textError(business.name) || textError(business.category, '', 3) || (!online && (textError(business.city) || addresses.some(address => textError(address, '', 5))))) allowed = Math.min(allowed, 1)
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
      const invalid = form.current?.querySelector<HTMLElement>(':invalid')
      const details = invalid?.closest('details')
      if (details) details.open = true
      invalid?.focus()
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

  function tryExample() {
    setBusiness({ ...DEMO_BUSINESS, name: '', category: '', city: '' })
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

  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked.current || searching || (step === 1 && (generating || revising))) return
    if (complete) { void requestClose(); return }
    if (!validate()) return
    if (step === 0 && businessPhase === 'identify') { void findBusiness(); return }
    if (step === 0) {
      if (innError(business.inn) || phoneError(business.phone)) { setBusinessPhase('identify'); return }
      if (!filled) { fillOffer(); setGenerating(true) }
      if (online) setAudience(current => current.map((value,i)=>i===0?2:value))
    }
    if (step < steps.length - 1) void navigate(step + 1)
    else void navigate(2, true)
  }

  const Surface = page ? motion.main : motion.dialog
  const Title = page ? 'h1' : 'h2'
  return (
    <Surface ref={page ? undefined : dialog} className={`v3-dialog campaign-demo${page ? ' campaign-page' : ''}`} data-closing={closing} aria-labelledby="v3-dialog-title" initial={false} animate={page ? undefined : dialogMotion} onClose={page ? undefined : close} onKeyDown={page ? undefined : containFocus} onCancel={page ? undefined : event => { event.preventDefault(); void requestClose() }}>
      <form ref={form} className="v3-dialog__form" onSubmit={next} noValidate>
        <header className="v3-dialog__head">
          <div className="v3-dialog__top">
            <div className="v3-dialog__brand"><span aria-hidden="true"><PencilLine size={18} /></span><Title id="v3-dialog-title" className="bl-h2" ref={heading} tabIndex={-1}>{complete ? 'черновик кампании' : 'настройка кампании'}</Title><span className="campaign-demo-label">демонстрация</span></div>
            {!page && <button type="button" className="bl-icon-btn" aria-label="Закрыть окно" onClick={() => void requestClose()}><X size={22} aria-hidden="true" /></button>}
          </div>
          <LayoutGroup id="campaign-progress"><ol className="v3-progress" aria-label="Шаги настройки">{steps.map((label, i) => (
            <li key={label} aria-current={i === step && !complete ? 'step' : undefined} className={i < step || complete ? 'is-done' : ''}>
              <button type="button" disabled={busy || searching || (i > step && !complete)} onClick={() => void navigate(i)}>{i === step && <motion.span className="v3-step-indicator" layoutId="progress-line" transition={reduce ? { duration: 0 } : settle} />}<span className="v3-progress__number" aria-hidden="true">{i < step || complete ? <motion.span className="v3-progress-check" initial={reduce ? false : { scale: .5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}><Check size={14} /></motion.span> : '0' + (i + 1)}</span>{label}</button>
            </li>
          ))}</ol></LayoutGroup>
        </header>

        <div className="v3-dialog__body" ref={scroller}>
          <motion.div className="v3-dialog__scene" initial={false} animate={sceneMotion} inert={busy}>
          {!complete && <div className="v3-step-intro"><div><h3 ref={stepHeading} tabIndex={-1}>{step === 0 ? businessPhase === 'identify' ? 'начнём с вашего бизнеса' : 'проверьте бизнес и добавьте точки' : introductions[step][0]}</h3><p>{step === 0 ? businessPhase === 'identify' ? 'Два поля — и перейдём к вашему предложению. Можно начать с готового примера.' : 'Уточните название и сферу бизнеса — по ним подготовим предложение.' : introductions[step][1]}</p></div><span>0{step + 1} / 03</span></div>}
          {!complete && step === 0 && <BusinessSetup phase={businessPhase} business={business} onChange={setBusiness} profile={profile} searching={searching} onExample={tryExample} onCancel={() => cancelLookup(true)} onManual={manualEntry} addresses={addresses} onAddresses={setAddresses} online={online} onOnline={setOnline} />}
          {!complete && step > 0 && !generating && <div className="v3-campaign-context"><span><Check size={14}/> {name}</span><span>{online ? 'онлайн' : business.city + ' · точек: ' + addresses.filter(a=>a.trim()).length}</span></div>}

          {!complete && step === 1 && <div className="v3-dialog__split campaign-offer-editor" data-generating={generating} data-phase={generation.phase}>
              <div className="campaign-offer-control-space">
                <div className="offer-preparing-note" aria-hidden={!generating}><span className="offer-source-mark">{name.replace(/^.*«(.+)»$/, '$1')}</span><p>Собираю первый вариант<br/>для вашего бизнеса</p><small>Затем можно поправить словами<br/>или настроить детали вручную.</small></div>
                <div className="v3-fields campaign-offer-controls" inert={generating} aria-hidden={generating}>
                <OfferAssistant offer={offer} active={open && !closing && !busy && !generating} onChange={value => { generatedTitle.current = /^Скидка \d+% на первую покупку$/.test(value.title) ? value.title : ''; setOffer(value) }} onWorking={setRevising}/>
                <details className="campaign-manual"><summary><PencilLine size={16}/> изменить вручную <span>текст, фото и условия</span></summary><fieldset className="v3-fields" disabled={revising}>
                <Field label="заголовок" placeholder="скидка на первый заказ" value={offer.title} onChange={e => setOffer({ ...offer, title: e.target.value })} maxLength={90} required error={textError(offer.title,'Заголовок',5)} />
                <div className="v3-fields__pair"><FileField label="изображение" file={offerImage} onChange={setOfferImage} />
                <FileField label="ваш логотип" file={logoImage} onChange={setLogoImage} /></div>
                <div className="v3-fields__pair">
                  <Field label="промокод" placeholder="ПРИВЕТ" value={offer.promo} onChange={e => setOffer({ ...offer, promo: e.target.value })} maxLength={24} error={offer.promo && !/^[a-zа-яё0-9_-]{2,24}$/i.test(offer.promo) ? 'Промокод: 2–24 буквы, цифры, дефис или подчёркивание.' : ''} />
                  <Field label="скидка, %" type="number" min={1} max={99} step={1} error={offer.discount && (!/^\d+$/.test(offer.discount) || +offer.discount < 1 || +offer.discount > 99) ? 'Скидка — целое число от 1 до 99%.' : ''} placeholder="20" value={offer.discount} onChange={e => changeDiscount(e.target.value)} />
                </div>
                <Field label="действует до" type="date" min={localDate()} error={offer.until && offer.until < localDate() ? 'Выберите сегодня или будущую дату.' : ''} value={offer.until} onChange={e => setOffer({ ...offer, until: e.target.value })} />
                </fieldset></details>
                </div>
              </div>
              <div className="v3-preview-column">
                <div className="campaign-ai-result"><span>предложение для ваших клиентов</span><button type="button" className="v3-text-button" disabled={revising || generating} onClick={() => { setGenerating(true); stepHeading.current?.focus({preventScroll:true}) }}>повторить сборку</button></div>
                <div className="v3-offer-stage" data-theme="invert" data-revising={revising} data-zoom={offer.zoom}>
                  <div className="v3-offer-card" aria-busy={generating || revising}>
                    <div className="v3-preview-media"><div className="v3-offer-placeholder"><Creative o={{...creativeOf(name, `−${offer.discount || '20'}% на первую покупку`, 0), tone: offer.tone, ...(offer.gift ? {big:'1 + 1',small:'второй кофе в подарок'} : {})}} erid="реклама" wide/></div>{image && <motion.img key={image} className="v3-offer-card__image" src={image} alt="" initial={reduce ? false : { opacity: 0, scale: 1.025 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduce ? 0 : .4, ease: glide }} />}{(generating || revising) && <OfferReveal quick={!generating} paused={!generation.visible || busy}/>}</div>
                    <div className="v3-offer-card__copy">
                      <div className="v3-offer-card__brand">{logo && <img src={logo} alt="" />}<span className="bl-caption">{name}</span></div>
                      <b className="bl-h3">{title}</b>
                      {(offer.promo || offer.discount) && <div className="bl-row">{offer.discount && <span className="bl-tag bl-tag--brand">−{offer.discount}%</span>}{offer.promo && <span className="bl-chip">{offer.promo}</span>}</div>}
                      {offer.until && <span className="bl-caption">до {offer.until.split('-').reverse().join('.')}</span>}
                    </div>
                  </div>
                </div>
                <div className="offer-canvas-status"><span role="status" aria-live="polite"><span className="offer-status-icon" aria-hidden="true">{generating || revising ? <Sparkles size={15}/> : <Check size={15}/>}</span><MovingLabel>{generating ? generationStatus : revising ? 'обновляю предложение' : 'готово к вашим идеям'}</MovingLabel></span>{generating && <button type="button" onClick={finishGeneration}>показать результат</button>}</div>
              </div>
            </div>}

          {!complete && step === 2 && (
            <div className="v3-dialog__split v3-audience">
              <div className="v3-fields">
                {groups.map(({ title: group, choices }, i) => <fieldset className="v3-choice" key={group}>
                  <legend className="bl-field__label">{group}</legend>
                  <LayoutGroup id={'audience-' + i}><div>{choices.map((choice, index) => <motion.button key={choice} type="button" className="bl-btn" disabled={online && i === 0 && index === 0} aria-pressed={audience[i] === index} onClick={() => setAudience(current => current.map((value, k) => i === k ? index : value))} whileTap={reduce ? undefined : { scale: .97 }}>{audience[i] === index && <motion.span className="v3-choice-highlight" layoutId="choice" transition={reduce ? { duration: 0 } : settle} />}<span>{choice}</span></motion.button>)}</div></LayoutGroup>
                </fieldset>)}
                <div className="v3-fields v3-fields--tight">
                  <label className="bl-field"><span className="bl-field__label">какие ещё триггеры нужны?</span><textarea className="bl-input" rows={2} maxLength={400} placeholder="например, ищут завтрак по дороге на работу" value={triggers} onChange={e => setTriggers(e.target.value)} /></label>
                  <button type="button" className="v3-text-button" onClick={dictate} disabled={listening}><Mic size={16} aria-hidden="true" />{listening ? 'слушаю…' : 'надиктовать'}</button>
                  <span role="status" className="bl-caption bl-secondary">{voiceMessage}</span>
                </div>
              </div>
              <aside className="v3-audience-card" data-theme="invert">
                <span className="bl-tag bl-tag--brand">сегмент показа</span><div className="v3-audience-graphic" aria-hidden="true"><span><Users size={25} strokeWidth={1.5} /></span></div>
                <h3 className="bl-h2">ваши будущие клиенты</h3>
                <dl>{groups.map(({ title: group }, i) => <div key={group}><dt className="bl-caption bl-secondary">{group}</dt><dd><MovingLabel>{audienceLabels[i]}</MovingLabel></dd></div>)}</dl>
                {triggers.trim() && <p className="bl-caption v3-trigger-copy">{triggers}</p>}
              </aside>
            </div>
          )}

          {complete && <div className="v3-complete">
            <motion.span className="v3-complete__icon" initial={reduce ? false : { scale: .75, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={settle}><Check size={26} className="v3-success-path" aria-hidden="true" /></motion.span>
            <h3 ref={stepHeading} tabIndex={-1} className="bl-h1">черновик готов</h3>
            <p className="bl-body bl-secondary">Проверьте, что получилось. Это пример настройки кампании.</p>
            <dl>{[
              ['бизнес', business.name], ['телефон', business.phone], ['точки', online ? 'онлайн' : addresses.filter(a=>a.trim()).join('; ')], ['оффер', offer.title],
              ['скидка', offer.discount ? `${offer.discount}%` : ''], ['промокод', offer.promo], ['действует до', offer.until ? offer.until.split('-').reverse().join('.') : ''],
              ...groups.map(({ title: label }, i) => [label, audienceLabels[i]]),
              ['пожелания', triggers.trim()],
            ].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt className="bl-caption bl-secondary">{label}</dt><dd>{value}</dd></div>)}</dl>
          </div>}
          </motion.div>
        </div>

        <footer className="v3-dialog__actions">
          <span className="v3-dialog__footer-note">{complete ? 'демонстрация завершена' : step === 1 ? 'всё можно изменить перед запуском' : step === 0 && businessPhase === 'identify' ? 'без регистрации и запуска рекламы' : `шаг 0${step + 1} из 03`}</span>
          {(step > 0 || complete || businessPhase === 'review') && <button type="button" className="bl-btn" disabled={busy} onClick={() => { if (step === 0 && businessPhase === 'review') { direction.current = -1; setBusinessPhase('identify') } else void navigate(complete ? step : step - 1) }}><ArrowLeft size={17} aria-hidden="true" /> {complete ? 'к настройкам' : 'назад'}</button>}
          <motion.button type="submit" className="bl-btn bl-btn--dark" disabled={busy || searching || (step === 1 && (generating || revising))} whileTap={reduce ? undefined : { scale: .97 }}><MovingLabel>{complete ? page ? 'к лендингу' : 'закрыть' : step === 1 && generating ? 'готовим предложение…' : searching ? 'ищем бизнес…' : step === 0 ? businessPhase === 'identify' ? 'найти бизнес' : 'собрать оффер' : step === 2 ? 'посмотреть черновик' : 'выбрать клиентов'}</MovingLabel>{!complete && <ArrowRight size={18} aria-hidden="true" />}</motion.button>
        </footer>
      </form>
    </Surface>
  )
}
