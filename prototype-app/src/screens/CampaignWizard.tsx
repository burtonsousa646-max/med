import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, ImagePlus, PencilLine, RotateCcw, Sparkles, X } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion, useAnimationControls, useReducedMotion } from 'motion/react'
import { useNavigate, useParams } from 'react-router'
import { autocompleteInn, requestOfferAi } from '../api'
import { offerAiNotes, type OfferAiInput } from '../../shared/offer-ai'
import { analytics, type AnalyticsPage, type EventParams, type Goal } from '../analytics'
import { campaignAllowedStage, campaignStage, campaignStages, emptyCampaignDraft, type StoredCampaignDraft } from './campaign-draft'
import { audienceGroups as groups } from '../../shared/campaign-draft'
import { MovingLabel, glide, settle } from './LandingMotion'
import { Field } from './CampaignField'
import { OfferReveal, useOfferVisibility } from './OfferGeneration'
import { OfferAssistant } from './OfferAssistant'
import { emptyOffer, offerErrors, nextOfferDesign, withOfferDiscount, type OfferDraft } from '../../shared/campaign-offer.ts'
import { BusinessSetup, type BusinessPhase } from './BusinessSetup'
import { AudienceSetup, CampaignSuccess, type AudienceSummary } from './CampaignAudience'
import { innError, phoneError, localDate, normalizeBusinessWebsite, offerSuggestion, offerTheme, type BusinessProfile } from '../../shared/campaign-business'
import { CampaignCreative } from './CampaignCreative'
import { CampaignSiteAssets } from './CampaignSiteAssets'
import { useOfferCutout } from './offer-cutout'
import './business-setup.css'
import './campaign-wizard.css'

const steps = ['ваш бизнес', 'дизайн оффера', 'выбор клиентов']
const introductions = [
  ['начнём с вашего бизнеса', 'Укажите данные компании'],
  ['Ваше предложение', 'Настройте текст, фото и условия. Карточка обновится сразу'],
  ['Кому показать предложение?', 'Выберите географию и клиентов для показа'],
]
type LocalSpeech = {
  lang: string
  processLocally?: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

function FileField({ label, file, preview, onChange, track = false }: { label: string; file: File | null; preview?: string; onChange: (file: File | null) => void; track?: boolean }) {
  const reduce = useReducedMotion()
  const feedbackId = useId()
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const version = useRef(0)
  const upload = (result: 'success' | 'error', reason?: EventParams['reason']) => { if (track) analytics.event('v4_upload_result', { field: label === 'Фото' ? 'image' : 'logo', result, reason }) }
  useEffect(() => () => { version.current++ }, [])
  const feedback = (message: string) => { setError(message); input.current?.setCustomValidity(message) }
  return <div className="bl-field v3-upload-field">
    <label><span className="bl-field__label">{label}</span>
    {preview && <img className="offer-file-preview" src={preview} alt={label} />}
    <span className="v3-file" data-filled={Boolean(file)}>
      <span aria-hidden="true"><ImagePlus size={18}/>{checking ? 'проверяем…' : file ? 'заменить' : 'выбрать файл'}</span>
      {file && <small title={file.name}><MovingLabel>{file.name}</MovingLabel></small>}
      <AnimatePresence>{file && !error && <motion.i className="v3-file__done" initial={reduce ? false : { opacity: 0, scale: .7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{duration:reduce ? 0:.2}}><Check size={16} /></motion.i>}</AnimatePresence>
      <input ref={input} type="file" aria-label={label} aria-invalid={Boolean(error)} aria-describedby={feedbackId} accept="image/png,image/jpeg,image/webp,image/avif" onInvalid={event=>{event.preventDefault(); setError(event.currentTarget.validationMessage)}} onChange={async event => {
        const selected = event.target.files?.[0]
        if (!selected) return
        const token = ++version.current
        setChecking(false)
        if (!['image/png','image/jpeg','image/webp','image/avif'].includes(selected.type)) { feedback('Выберите PNG, JPG, WebP или AVIF'); upload('error', 'type'); return }
        if (selected.size > 5 * 1024 * 1024) { feedback('Размер файла до 5 МБ'); upload('error', 'size'); return }
        setChecking(true)
        input.current?.setCustomValidity('Проверяем изображение')
        const url = URL.createObjectURL(selected)
        try {
          const img = new Image(); img.src = url; await img.decode()
          if (version.current !== token) return
          if (!img.naturalWidth || !img.naturalHeight) throw new Error('Empty image')
          feedback(''); onChange(selected); upload('success')
        } catch { if(version.current === token) { feedback('Не удалось открыть изображение. Выберите другой файл'); upload('error', 'decode') } }
        finally { URL.revokeObjectURL(url); if(version.current === token) setChecking(false) }
      }} />
    </span></label>
    <span id={feedbackId} className="v3-upload-feedback" role="status">{error || 'PNG, JPG, WebP или AVIF · до 5 МБ'}</span>
    {(file || preview || error) && <button type="button" className="v3-text-button" onClick={()=>{version.current++;setChecking(false);feedback('');onChange(null);if(input.current)input.current.value=''}}>{label === 'Фото' ? 'Удалить фото' : 'Удалить логотип'}</button>}
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

export default function CampaignWizard({ open, onClose, presentation = 'dialog', initialDraft, onDraftChange, onSubmitDraft, storageState }: {
  open: boolean; onClose: () => void; presentation?: 'dialog' | 'page'; initialDraft?: StoredCampaignDraft;
  onDraftChange?: (draft: StoredCampaignDraft) => void; onSubmitDraft?: (draft: StoredCampaignDraft) => Promise<void>; storageState?: 'loading' | 'saving' | 'saved' | 'error';
}) {
  const page = presentation === 'page'
  const track = useCallback((goal: Goal, params: EventParams = {}) => { if (page) analytics.event(goal, params) }, [page])
  const routerNavigate = useNavigate()
  const { stage: routeStage } = useParams()
  const initial: StoredCampaignDraft = initialDraft ?? emptyCampaignDraft()
  const resumed = initial.reached > 0 || Boolean(initial.business.inn || initial.business.phone)
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
  const [revealing, setRevealing] = useState(false)
  const [siteLoading, setSiteLoading] = useState(false)
  const [generationNotes, setGenerationNotes] = useState<string[]>([])
  const [generationClarification, setGenerationClarification] = useState<OfferAiInput['clarification']>()
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
  const [offerAccepted, setOfferAccepted] = useState(initial.offerAccepted === true)
  const [addresses, setAddresses] = useState(initial.addresses)
  const [businessPhase, updateBusinessPhase] = useState<BusinessPhase>(initialStage === 0 ? 'identify' : 'review')
  const [hasProfile, setHasProfile] = useState(initial.hasProfile)
  const [registeredAddress, setRegisteredAddress] = useState(typeof initial.registeredAddress === 'string' ? initial.registeredAddress.slice(0, 200) : '')
  const [suggestion, setSuggestion] = useState<BusinessProfile | null>(null)
  const [lookupError, setLookupError] = useState('')
  const [lookupAttempt, setLookupAttempt] = useState(0)
  const matchingSuggestion = suggestion?.inn === business.inn ? suggestion : null
  const [searching, setSearching] = useState(false)
  const [online, setOnline] = useState(initial.online)
  const lookup = useRef<AbortController | null>(null)
  const generatedTitle = useRef(initial.generatedTitle)
  const form = useRef<HTMLFormElement>(null)
  const [offer, setOffer] = useState<OfferDraft>(initial.offer)
  const [discountEnabled, setDiscountEnabled] = useState(Boolean(initial.offer.discount))
  const [editing, setEditing] = useState<'text' | 'media' | 'terms' | null>(null)
  const [previousDesign, setPreviousDesign] = useState<OfferDraft | null>(null)
  const appliedDesign = useRef<OfferDraft | null>(null)
  const [removedImage, setRemovedImage] = useState<{ file: File | null; layout: OfferDraft['layout'] } | null>(null)
  const manualId = useId()
  const interacted = useRef(false)
  const fieldValues = useRef(new WeakMap<HTMLInputElement | HTMLTextAreaElement, string>())
  const generationRequest = useRef<AbortController | null>(null)
  const generationRun = useRef<{ started: number; kind: 'first' | 'rebuild' } | null>(null)
  const [offerImage, setOfferImage] = useState<File | null>(initial.offerImage)
  const [brandLogo, setBrandLogo] = useState({
    file: initial.logoImage, website: initial.logoWebsite, skipped: initial.skippedLogoWebsite,
  })
  const website = normalizeBusinessWebsite(business.website)
  const logoImage = brandLogo.website && brandLogo.website !== website ? null : brandLogo.file
  const waitingForLogo = siteLoading && !logoImage && brandLogo.skipped !== website
  const cutout = useOfferCutout(offerImage, open && step > 0 && offer.layout !== 'photo' && offer.layout !== 'text',
    initial.offerCutout, initial.keepOriginalImage)
  const [audience, setAudience] = useState(initial.audience)
  const [triggers, setTriggers] = useState(initial.triggers)
  const [listening, setListening] = useState(false)
  const [voiceMessage, setVoiceMessage] = useState('')
  const image = useImage(cutout.keepOriginal || offer.layout === 'photo' ? offerImage : cutout.cutout ?? offerImage)
  const logo = useImage(logoImage)
  const name = business.name.trim() || 'ваш бизнес'
  const title = offer.title.trim()
  const errors = offerErrors(offer)
  const audienceSummary: AudienceSummary = {
    place: audience[0] === 0 ? `${business.city} · рядом с точками` : audience[0] === 1 ? business.city.trim() || 'Город не указан' : 'Вся Россия',
    people: groups.slice(1, 4).flatMap((group, index) => {
      const choice = group.choices[audience[index + 1]]
      return audience[index + 1] ? [index === 2 ? `доход ${choice}` : index === 1 ? `возраст ${choice}` : choice] : []
    }).join(' · ') || 'Все клиенты',
    moment: ['В любой момент', 'После переезда', 'В день зарплаты'][audience[4]],
  }
  const theme = offerTheme(business.category)
  const illustration = 'illustration' in theme ? import.meta.env.BASE_URL + 'img/near/' + theme.illustration + '.avif' : ''
  const creative = <CampaignCreative name={name} offer={offer} image={image} illustration={illustration} logo={logo} disabled={busy || generating || revising}/>
  const preview = <div className="campaign-summary-creative">{creative}</div>
  const aiContext: Pick<OfferAiInput, 'name' | 'category' | 'offer' | 'hasImage' | 'hasLogo'> = {
    name, category: business.category, offer, hasImage: Boolean(offerImage), hasLogo: Boolean(logoImage),
  }
  const finishGeneration = useCallback((method: 'automatic' | 'skip' = 'automatic') => {
    if (generationRun.current) track('v4_generation_complete', { step: 'offer', generation: generationRun.current.kind, method, duration_ms: Date.now() - generationRun.current.started })
    generationRequest.current?.abort()
    generationRequest.current = null
    generationRun.current = null
    setGenerating(false)
    setRevealing(!reduce)
    requestAnimationFrame(() => stepHeading.current?.focus({ preventScroll: true }))
  }, [track, reduce])
  const offerVisible = useOfferVisibility()
  const currentStage = complete ? 4 : step === 0 ? businessPhase === 'identify' ? 0 : 1 : step + 1
  const currentDraft: StoredCampaignDraft = { business, addresses, online, offer, offerImage, logoImage, audience, triggers,
    offerCutout: cutout.cutout, keepOriginalImage: cutout.keepOriginal, logoWebsite: logoImage ? brandLogo.website : undefined,
    skippedLogoWebsite: brandLogo.skipped,
    confirmedInn: confirmedInn.current, generatedTitle: generatedTitle.current, filled, hasProfile, registeredAddress,
    stage: currentStage, reached: Math.max(reached, currentStage), offerAccepted: !page || offerAccepted, submitted: page && complete }
  const stepName = campaignStages[currentStage]
  const offerFlags = { has_image: Boolean(offerImage), has_logo: Boolean(logoImage), has_promo: Boolean(offer.promo), has_discount: Boolean(offer.discount), tone: offer.tone }

  useEffect(() => {
    if (page && !busy && !closing && routeStage === stepName) analytics.view(`/v4/create/${stepName}` as AnalyticsPage, { step: stepName, resumed })
  }, [page, busy, closing, routeStage, stepName, resumed])

  useEffect(() => { setEditing(null); setPreviousDesign(null); setRemovedImage(null) }, [step, complete])
  useEffect(() => { if (offer !== appliedDesign.current) setPreviousDesign(null) }, [offer])
  useEffect(() => { if (offer.gift || offer.discount) setDiscountEnabled(Boolean(offer.discount)) }, [offer.gift, offer.discount])

  useEffect(() => {
    onDraftChange?.(currentDraft)
  }, [business, addresses, online, offer, offerImage, logoImage, brandLogo, cutout.cutout, cutout.keepOriginal, audience, triggers, filled, hasProfile, registeredAddress, currentStage, reached, offerAccepted, onDraftChange])

  useEffect(() => {
    const inn = business.inn
    setSuggestion(null)
    setLookupError('')
    setSearching(false)
    if (!open || step !== 0 || businessPhase !== 'identify' || innError(inn)) return
    const controller = new AbortController()
    lookup.current = controller
    const timer = window.setTimeout(async () => {
      if (controller.signal.aborted) return
      track('v4_lookup_start', { step: 'business' })
      setSearching(true)
      try {
        const result = await autocompleteInn(inn, AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]))
        if (controller.signal.aborted) return
        setSuggestion(result)
        track('v4_lookup_result', { result: 'success', method: 'lookup' })
      } catch (error) {
        if (controller.signal.aborted) return
        setLookupError(error instanceof TypeError || !(error instanceof Error)
          ? 'Поиск сейчас недоступен. Попробуйте ещё раз или заполните данные вручную'
          : error.name === 'TimeoutError' ? 'Поиск не ответил вовремя. Попробуйте ещё раз' : error.message)
        track('v4_lookup_result', { result: 'error', method: 'lookup' })
      } finally {
        if (lookup.current === controller) { lookup.current = null; setSearching(false) }
      }
    }, 350)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
      if (lookup.current === controller) lookup.current = null
    }
  }, [business.inn, businessPhase, lookupAttempt, open, step, track])

  useLayoutEffect(() => {
    if (!page) return
    const target = campaignStage(routeStage, currentDraft)
    if (routeStage && campaignStages.indexOf((routeStage === 'preview' ? 'success' : routeStage) as typeof campaignStages[number]) > target) track('v4_route_blocked', { step: campaignStages[target], reason: 'invalid' })
    if (routeStage !== campaignStages[target]) routerNavigate(`/v4/create/${campaignStages[target]}`, { replace: true })
    if (target === currentStage) return
    if (target !== 2) cancelGeneration()
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
    if (phase === 'identify' && businessPhase !== phase) track('v4_step_back', { step: 'details', target_step: 'business' })
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

  useEffect(() => () => { epoch.current++; speech.current?.abort(); lookup.current?.abort(); generationRequest.current?.abort() }, [])

  function close() {
    cancelGeneration()
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
    track('v4_flow_exit', { step: stepName, source: complete ? 'success' : 'back', target: 'landing' })
    if (page) { close(); return }
    cancelGeneration()
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
    const stage = Math.min(done ? 4 : target === 0 ? 1 : target + 1, campaignAllowedStage(currentDraft))
    target = Math.max(0, Math.min(2, stage - 1))
    done = stage === 4
    if (locked.current || (target === step && done === complete)) return
    if (stage < currentStage) track('v4_step_back', { step: stepName, target_step: campaignStages[stage] })
    if (generating && target !== 1 && generationRun.current) {
      track('v4_generation_leave', { generation: generationRun.current.kind, duration_ms: Date.now() - generationRun.current.started })
      cancelGeneration()
    }
    locked.current = true
    setBusy(true)
    setRevising(false)
    speech.current?.abort()
    const token = ++epoch.current
    direction.current = (done ? 3 : target) > (complete ? 3 : step) ? 1 : -1
    await sceneMotion.start({ opacity: 0, x: reduce ? 0 : -direction.current * 10, filter: reduce ? 'blur(0px)' : 'blur(2px)', transition: { duration: reduce ? 0 : .14, ease: glide } })
    if (token !== epoch.current || (!page && !dialog.current?.open)) return
    if (page) {
      setReached(value => Math.max(value, stage))
      routerNavigate(`/v4/create/${campaignStages[stage]}`)
    }
    setStep(target)
    if (stage <= 1) updateBusinessPhase(stage === 0 ? 'identify' : 'review')
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
      const field = invalid as HTMLInputElement | undefined
      track('v4_field_error', { step: stepName, field: (field?.dataset.analyticsField || field?.name || 'unknown') as EventParams['field'],
        reason: !field?.value.trim() ? 'required' : field.validity.rangeOverflow || field.validity.rangeUnderflow || field.validity.stepMismatch ? 'range' : field.validity.tooLong || field.validity.tooShort ? 'length' : 'invalid', error_count: form.current?.querySelectorAll('input:invalid, textarea:invalid, select:invalid').length ?? 0 })
      const panel = invalid?.closest<HTMLElement>('[data-offer-panel]')?.dataset.offerPanel
      if (panel === 'text' || panel === 'media' || panel === 'terms') setEditing(panel)
      const details = invalid?.closest('details')
      if (details) details.open = true
      requestAnimationFrame(() => invalid?.focus())
    }
    return valid
  }

  function cancelLookup(restoreFocus = false) {
    if (lookup.current !== null) track('v4_lookup_cancel', { step: 'business' })
    lookup.current?.abort()
    lookup.current = null
    setSearching(false)
    if (restoreFocus) requestAnimationFrame(() => {
      if ((page || dialog.current?.open) && !locked.current) form.current?.querySelector<HTMLInputElement>('[name="inn"]')?.focus()
    })
  }

  function acceptSuggestion(profile: BusinessProfile) {
    confirmBusinessIdentity()
    setHasProfile(true)
    setRegisteredAddress(profile.registeredAddress)
    setBusiness(current => ({ ...current, name: current.name || profile.name, category: current.category || profile.category, city: current.city || profile.city, website: current.website || profile.website || '' }))
    track('v4_identify_complete', { method: 'lookup' })
    direction.current = 1
    setBusinessPhase('review')
  }

  function confirmBusinessIdentity() {
    if (confirmedInn.current === business.inn) return
    if (confirmedInn.current) track('v4_company_change')
    confirmedInn.current = business.inn
    setHasProfile(false)
    setRegisteredAddress('')
    setBusiness(current => ({ ...current, name: '', category: '', city: '', website: '' }))
    setAddresses([''])
    setOffer({ ...emptyOffer }); setDiscountEnabled(false)
    setOfferImage(null); setBrandLogo({ file: null, website: undefined, skipped: undefined }); setFilled(false); cancelGeneration()
    setGenerationNotes([]); setGenerationClarification(undefined)
    generatedTitle.current = ''
    setReached(1)
    setAudience(groups.map(() => 0)); setTriggers(''); setOnline(false)
  }

  function manualEntry() {
    if (!validate()) return
    cancelLookup()
    confirmBusinessIdentity()
    track('v4_identify_complete', { method: 'manual' })
    direction.current = 1
    setBusinessPhase('review')
  }

  function cancelGeneration() {
    generationRequest.current?.abort()
    generationRequest.current = null
    generationRun.current = null
    setGenerating(false)
    setRevealing(false)
  }

  async function beginGeneration(kind: 'first' | 'rebuild') {
    if (generationRequest.current) return
    if (kind === 'rebuild') {
      const next = nextOfferDesign(offer, Boolean(image || illustration))
      setPreviousDesign(offer); appliedDesign.current = next; setOffer(next)
      setRevealing(!reduce)
      track('v4_generation_start', { step: 'offer', generation: kind, ...offerFlags })
      track('v4_generation_complete', { step: 'offer', generation: kind, method: 'automatic', duration_ms: 0 })
      return
    }
    const controller = new AbortController()
    generationRequest.current = controller
    const draft = kind === 'first' ? { ...offer, title: offerSuggestion(business) } : offer
    if (kind === 'first') {
      setFilled(true)
      generatedTitle.current = draft.title
      setOffer(draft)
    }
    const lockedFields: OfferAiInput['lockedFields'] = draft.title !== generatedTitle.current || draft.discount || draft.gift ? ['title'] : []
    generationRun.current = { started: Date.now(), kind }
    track('v4_generation_start', { step: 'offer', generation: kind, ...offerFlags })
    setGenerationNotes([])
    setGenerationClarification(undefined)
    setRevealing(false)
    setGenerating(true)
    try {
      const result = await requestOfferAi({ ...aiContext, offer: draft, mode: 'auto', request: '', lockedFields }, controller.signal)
      if (controller.signal.aborted || result.source === 'disabled') return
      const { answer } = result
      if (answer.status === 'draft' && answer.patch.title) {
        const title = answer.patch.title
        generatedTitle.current = title
        setOffer(current => ({ ...current, title }))
      }
      setGenerationNotes(offerAiNotes(answer))
      if (answer.question) {
        setGenerationClarification({ request: '', question: answer.question, options: answer.options.map(option => option.headline) })
      }
    } catch {
      if (!controller.signal.aborted) setGenerationNotes(['Помощник недоступен. Можно продолжить с текущим черновиком или попробовать ещё раз.'])
    } finally {
      if (generationRequest.current === controller) finishGeneration()
    }
  }

  function chooseLogo(file: File | null, fromSite = false) {
    setBrandLogo({ file, website: fromSite ? website : undefined, skipped: file ? undefined : website })
  }

  function applySiteLogo(file: File) {
    setBrandLogo(current => (current.file && (!current.website || current.website === website)) || current.skipped === website
      ? current : { file, website, skipped: undefined })
  }

  function removePhotoBackground() {
    if (!offerImage) return 'Загрузите фото или выберите изображение с сайта, чтобы убрать фон'
    if (cutout.cutout && !cutout.keepOriginal && offer.layout !== 'photo' && offer.layout !== 'text') return 'Фон уже убран'
    cutout.setKeepOriginal(false)
    setOffer(current => current.layout === 'photo' || current.layout === 'text' ? { ...current, layout: 'split' } : current)
    cutout.retry()
    return 'Убираю фон. Исходное фото сохранится'
  }

  function chooseImage(file: File | null) {
    if (!file) {
      if (offer.layout !== 'text' && (offerImage || illustration)) setRemovedImage({ file: offerImage, layout: offer.layout })
      setOfferImage(null)
      setOffer(current => ({ ...current, layout: 'text' }))
      return
    }
    setRemovedImage(null)
    setOfferImage(file)
    setOffer(current => ({ ...current, layout: current.layout === 'photo' ? 'photo' : 'split' }))
  }

  function dictate() {
    if (speech.current) { speech.current.stop(); return }
    track('v4_voice_start', { step: 'audience' })
    const browser = window as Window & { SpeechRecognition?: new () => LocalSpeech; webkitSpeechRecognition?: new () => LocalSpeech }
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition
    const recognition = Recognition ? new Recognition() : null
    if (!recognition || !('processLocally' in recognition)) {
      track('v4_voice_result', { step: 'audience', result: 'error', reason: 'unsupported' })
      setVoiceMessage('В этом браузере голосовой ввод недоступен. Напишите пожелание')
      return
    }
    recognition.lang = 'ru-RU'
    let heard = false
    recognition.processLocally = true
    recognition.onresult = ({ results }) => {
      const value = results[0]?.[0]?.transcript.trim()
      if (speech.current === recognition && value) { heard = true; setTriggers(current => [current.trim(), value].filter(Boolean).join(' ').slice(0, 400)) }
    }
    recognition.onerror = ({ error }) => {
      if (speech.current !== recognition) return
      speech.current = null
      setListening(false)
      if (error === 'aborted') return
      track('v4_voice_result', { step: 'audience', result: 'error', reason: 'recognition' })
      setVoiceMessage('Не удалось распознать речь. Попробуйте ещё раз или введите текст')
    }
    recognition.onend = () => {
      if (speech.current !== recognition) return
      speech.current = null
      setListening(false)
      track('v4_voice_result', { step: 'audience', result: heard ? 'success' : 'empty' })
      setVoiceMessage(heard ? 'Текст добавлен. Проверьте его перед отправкой' : 'Речь не распознана. Попробуйте ещё раз или введите текст')
    }
    try {
      speech.current = recognition
      setListening(true)
      setVoiceMessage('')
      recognition.start()
    } catch {
      speech.current = null
      setListening(false)
      track('v4_voice_result', { step: 'audience', result: 'error', reason: 'recognition' })
      setVoiceMessage('Голосовой ввод недоступен. Напишите пожелание')
    }
  }

  async function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked.current || searching || finalizing || (step === 1 && (generating || revising)) || cutout.processing) return
    if (complete) { void requestClose(); return }
    if (step === 0 && businessPhase === 'identify') {
      if (matchingSuggestion) {
        if (validate()) acceptSuggestion(matchingSuggestion)
      } else if (innError(business.inn)) {
        validate()
      } else {
        setLookupAttempt(attempt => attempt + 1)
      }
      return
    }
    if (!validate()) return
    if (step === 0) {
      if (innError(business.inn) || phoneError(business.phone)) { setBusinessPhase('identify'); return }
      track('v4_business_complete', { online, address_count: online ? 0 : addresses.length })
      if (!filled) void beginGeneration('first')
      if (online) setAudience(current => current.map((value,i)=>i===0?2:value))
    }
    if (step < steps.length - 1) { if (step === 1) track('v4_offer_complete', offerFlags); void navigate(step + 1); return }
    if (campaignAllowedStage(currentDraft) < 4) { void navigate(2, true); return }
    setFinishError('')
    speech.current?.abort()
    const token = epoch.current
    setFinalizing(true)
    track('v4_save_start', { step: 'audience' })
    try {
      await onSubmitDraft?.(currentDraft)
      if (token !== epoch.current) return
      track('v4_save_result', { result: 'success' })
      track('v4_setup_complete', { ...offerFlags, online, has_wishes: Boolean(triggers.trim()), address_count: online ? 0 : addresses.length, resumed })
      await navigate(2, true)
    } catch { track('v4_save_result', { result: 'error', reason: 'storage' }); setFinishError('Не удалось принять заявку. Нажмите «Завершить настройку» ещё раз') }
    finally { setFinalizing(false) }
  }

  const Surface = page ? motion.main : motion.dialog
  const Title = page ? 'h1' : 'h2'
  return (
    <Surface ref={page ? undefined : dialog} className={`v3-dialog campaign-demo${page ? ' campaign-page' : ''}`} data-closing={closing} aria-labelledby="v3-dialog-title" initial={false} animate={page ? undefined : dialogMotion} onClose={page ? undefined : close} onKeyDown={page ? undefined : containFocus} onCancel={page ? undefined : event => { event.preventDefault(); void requestClose() }}>
      <form ref={form} className="v3-dialog__form ym-hide-content ym-disable-keys" onSubmit={next} noValidate onFocusCapture={event => {
        const field = event.target
        if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return
        fieldValues.current.set(field, field.value)
        if (!interacted.current) { interacted.current = true; track('v4_flow_start', { step: stepName, resumed }) }
      }} onBlurCapture={event => {
        const field = event.target
        if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) || fieldValues.current.get(field) === field.value) return
        if (step === 1 && field.dataset.analyticsField) track('v4_offer_field_change', { field: field.dataset.analyticsField as EventParams['field'] })
        if (step === 2 && field.dataset.analyticsField === 'wishes') track('v4_wishes_change', { has_wishes: Boolean(field.value.trim()) })
      }}>
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
          {!complete && <div className="v3-step-intro"><div><h3 ref={stepHeading} tabIndex={-1}>{step === 0 ? businessPhase === 'identify' ? 'начнём с вашего бизнеса' : 'проверьте бизнес и добавьте точки' : step === 1 && generating ? 'Собираем ваш оффер' : introductions[step][0]}</h3><p>{step === 0 ? 'Сформируем оффер на основе информации о компании' : step === 1 && generating ? 'Готовим черновик на основе данных о бизнесе' : introductions[step][1]}</p></div><span>0{step + 1} / 03</span></div>}
          {!complete && step === 0 && <BusinessSetup phase={businessPhase} business={business} onChange={setBusiness} hasProfile={hasProfile} registeredAddress={registeredAddress} suggestionName={matchingSuggestion?.name} lookupError={lookupError} searching={searching} onCancel={() => cancelLookup(true)} onManual={manualEntry} addresses={addresses} onAddresses={value => { if (value.length !== addresses.length) track('v4_address_change', { action: value.length > addresses.length ? 'add' : 'remove', address_count: value.length }); setAddresses(value) }} online={online} onOnline={value => { track('v4_business_mode', { online: value }); setOnline(value) }} offerAccepted={offerAccepted} onOfferAccepted={page ? setOfferAccepted : undefined} />}
          {!complete && step === 1 && !generating && <div className="v3-campaign-context"><span><Check size={14}/> {name}</span><span>{online ? 'онлайн' : business.city + ' · точек: ' + addresses.filter(a=>a.trim()).length}</span></div>}

          {!complete && step === 1 && <div className="v3-dialog__split campaign-offer-editor" data-generating={generating}>
              <section className="v3-preview-column offer-workspace" aria-label="Визуальный редактор оффера">
                <div className="offer-workspace-toolbar" role="toolbar" aria-label="Действия с оффером">
                  <button type="button" disabled={revising || generating} onClick={() => { void beginGeneration('rebuild') }}><RotateCcw size={16}/>Другой дизайн</button>
                  <button type="button" disabled={revising || generating || !previousDesign} onClick={() => { if (previousDesign) setOffer(previousDesign); setPreviousDesign(null); setRevealing(!reduce) }}><RotateCcw size={16}/>Вернуть дизайн</button>
                </div>
                <div className="v3-offer-stage">
                  <div className="v3-offer-card" aria-busy={generating || revising}>
                    {creative}
                    {(generating || revising || revealing) && <OfferReveal ready={revealing && !generating && !revising && !waitingForLogo}
                      paused={!offerVisible || busy} onReveal={() => setRevealing(false)}/>}
                  </div>
                </div>
                <div className="offer-edit-actions" aria-label="Настройки предложения">
                  {([['text', 'Текст'], ['media', 'Фото и логотип'], ['terms', 'Условия']] as const).map(([panel, label]) =>
                    <button key={panel} type="button" disabled={generating || revising} aria-expanded={editing === panel}
                      aria-controls={manualId + panel} onClick={() => setEditing(editing === panel ? null : panel)}>{label}</button>)}
                </div>
                <fieldset id={manualId + 'text'} className="offer-edit-panel v3-fields" data-offer-panel="text" hidden={editing !== 'text'} disabled={generating || revising}>
                  <Field label="Текст предложения" data-analytics-field="title" placeholder="Например, стрижка со скидкой на первый визит" value={offer.title} onChange={e => { generatedTitle.current = ''; setOffer({ ...offer, title: e.target.value }) }} maxLength={90} required error={errors.title} />
                  <p className="bl-caption">Размер скидки и промокод можно указать в «Условиях».</p>
                </fieldset>
                <fieldset id={manualId + 'media'} className="offer-edit-panel v3-fields" data-offer-panel="media" hidden={editing !== 'media'} disabled={generating || revising}>
                  <div className="v3-fields__pair">
                    <FileField label="Фото" track={page} file={offerImage} preview={offer.layout === 'text' ? '' : image || illustration} onChange={chooseImage} />
                    <FileField label="Логотип" track={page} file={logoImage} preview={logo} onChange={chooseLogo} />
                  </div>
                  {offerImage && offer.layout !== 'text' && <div className="offer-cutout-controls">
                    <span role="status">{cutout.processing ? 'Убираем фон…' : cutout.failed ? 'Фон не удалось убрать. Показываем оригинал.'
                      : cutout.cutout && !cutout.keepOriginal && offer.layout !== 'photo' ? 'Фон убран' : 'Показываем оригинал'}</span>
                    {!cutout.processing && (cutout.cutout || cutout.failed || cutout.keepOriginal || offer.layout === 'photo') &&
                      <button type="button" className="v3-text-button" onClick={() => {
                        if (cutout.cutout && !cutout.keepOriginal && offer.layout !== 'photo') { cutout.setKeepOriginal(true); return }
                        removePhotoBackground()
                      }}>{cutout.cutout && !cutout.keepOriginal && offer.layout !== 'photo' ? 'Вернуть фон' : cutout.failed ? 'Повторить обработку' : 'Убрать фон'}</button>}
                  </div>}
                  {website && <CampaignSiteAssets key={website} website={website} logo={logoImage} image={offerImage}
                    onLogo={file => chooseLogo(file, true)} onAutoLogo={applySiteLogo} onImage={chooseImage} onLoading={setSiteLoading}
                    disabled={revising || busy || generating} hidden={false} />}
                </fieldset>
                {removedImage && <div className="offer-image-undo" role="status">Фото удалено.
                  <button type="button" className="v3-text-button" disabled={generating || revising} onClick={() => {
                    setOfferImage(removedImage.file); setOffer(current => ({ ...current, layout: removedImage.layout })); setRemovedImage(null)
                  }}>Вернуть фото</button>
                </div>}
                <fieldset id={manualId + 'terms'} className="offer-edit-panel v3-fields" data-offer-panel="terms" hidden={editing !== 'terms'} disabled={generating || revising}>
                  <label className="offer-mechanic">Что получит клиент?
                    <select aria-label="Что получит клиент?" value={offer.gift ? 'gift' : offer.discount || discountEnabled ? 'discount' : 'text'} onChange={event => {
                      const mechanic = event.target.value
                      setDiscountEnabled(mechanic === 'discount')
                      setOffer(current => mechanic === 'discount' ? { ...current, gift: false }
                        : { ...withOfferDiscount(current, ''), gift: mechanic === 'gift' })
                    }}>
                      <option value="text">Предложение из текста карточки</option>
                      <option value="discount">Скидку в процентах</option>
                      <option value="gift">Два по цене одного</option>
                    </select>
                  </label>
                  {(offer.discount || discountEnabled) && <Field required label="Размер скидки, %" data-analytics-field="discount" type="number" min={1} max={99} step={1} error={errors.discount} value={offer.discount} onChange={e => setOffer(withOfferDiscount(offer, e.target.value))} />}
                  <div className="v3-fields__pair">
                    <Field label="Промокод, если нужен" data-analytics-field="promo" placeholder="Например, ПРИВЕТ" value={offer.promo} onChange={e => setOffer({ ...offer, promo: e.target.value })} maxLength={24} error={errors.promo} />
                    <Field label="Последний день акции" data-analytics-field="until" type="date" min={localDate()} error={errors.until} value={offer.until} onChange={e => setOffer({ ...offer, until: e.target.value })} />
                  </div>
                  <p className="bl-caption">Промокод появится у клиента после нажатия. Срок можно оставить пустым.</p>
                </fieldset>
                <div className="offer-canvas-status"><span role="status" aria-live="polite"><span className="offer-status-icon" aria-hidden="true">{generating || revising ? <Sparkles size={15}/> : <Check size={15}/>}</span><MovingLabel>{generating ? 'Собираю предложение…' : revising ? 'обновляю предложение' : waitingForLogo ? 'Ищем логотип на сайте…' : cutout.processing ? 'Убираем фон…' : cutout.failed ? 'Показываем фото с исходным фоном' : storageState === 'error' ? 'Не удалось сохранить изменения' : storageState === 'saving' ? 'Сохраняем…' : page ? 'Изменения сохранены' : 'Все изменения применены'}</MovingLabel></span>{generating && <button type="button" onClick={() => finishGeneration('skip')}>Продолжить с черновиком</button>}{!generating && cutout.processing && <button type="button" onClick={() => cutout.setKeepOriginal(true)}>Оставить оригинал</button>}</div>
              </section>
              <div className="campaign-offer-control-space">
                <div className="offer-preparing-note" aria-hidden={!generating}><span className="offer-source-mark">{name.replace(/^.*«(.+)»$/, '$1')}</span><p>Собираю предложение<br/>для вашего бизнеса</p><small>Потом можно изменить текст<br/>или настроить детали вручную</small></div>
                <div className="v3-fields campaign-offer-controls" inert={generating} aria-hidden={generating}>
                {generationNotes.length > 0 && <ul className="offer-ai-notes" aria-label="Предложения помощника">
                  {generationNotes.map((note, index) => <li key={index}>{note}</li>)}
                </ul>}
                <OfferAssistant track={page} context={aiContext} initialClarification={generationClarification} active={open && !closing && !busy && !generating} onChange={value => { setDiscountEnabled(Boolean(value.discount)); if (value.title !== offer.title) generatedTitle.current = ''; setOffer(value); if (revising && !reduce) setRevealing(true) }} onWorking={setRevising} onRemoveBackground={removePhotoBackground} onRemoveImage={() => { chooseImage(null); return 'Фото удалено. Его можно вернуть под карточкой' }}/>

                </div>
              </div>
            </div>}

          {!complete && step === 2 && <>
            <AudienceSetup groups={groups} values={audience} onChange={value => {
              const group = value.findIndex((choice, index) => choice !== audience[index])
              if (group >= 0) track('v4_audience_select', { group: (['geography', 'gender', 'age', 'income', 'moment'] as const)[group], choice: value[group] })
              setAudience(value)
            }} city={business.city} onCityChange={city => setBusiness(current => ({ ...current, city }))} online={online} addresses={addresses} triggers={triggers} onTriggers={setTriggers} onDictate={dictate} listening={listening} voiceMessage={voiceMessage} disabled={finalizing} summary={audienceSummary} preview={preview}/>
            {finishError && <p className="campaign-finish-error" role="alert">{finishError}</p>}
          </>}
          {complete && <CampaignSuccess headingRef={stepHeading} preview={preview} name={name} offerTitle={title} summary={audienceSummary} saved={page && storageState === 'saved'}/>}
          </motion.div>
        </div>

        <footer className="v3-dialog__actions">
          <span className="v3-dialog__footer-note">{complete ? 'Вы завершили все три шага' : step === 1 ? 'всё можно изменить перед запуском' : step === 0 && businessPhase === 'identify' ? 'без регистрации и запуска рекламы' : `шаг 0${step + 1} из 03`}</span>
          {(step > 0 || complete || businessPhase === 'review') && <button type="button" className="bl-btn" disabled={busy || finalizing} onClick={() => { if (step === 0 && businessPhase === 'review') { direction.current = -1; setBusinessPhase('identify') } else void navigate(complete ? step : step - 1) }}><ArrowLeft size={17} aria-hidden="true" /> {complete ? 'Изменить настройки' : 'назад'}</button>}
          <motion.button type="submit" className="bl-btn bl-btn--dark" disabled={busy || searching || finalizing || cutout.processing || (step === 1 && (generating || revising))} whileTap={reduce ? undefined : { scale: .97 }}><MovingLabel>{complete ? 'Готово' : finalizing ? 'Сохраняем настройки…' : step === 1 && generating ? 'готовим предложение…' : searching ? 'ищем бизнес…' : step === 0 ? businessPhase === 'identify' ? matchingSuggestion ? 'проверить данные' : 'найти бизнес' : 'собрать оффер' : step === 2 ? 'Завершить настройку' : 'Дальше: выбрать клиентов'}</MovingLabel>{!complete && <ArrowRight size={18} aria-hidden="true" />}</motion.button>
        </footer>
      </form>
    </Surface>
  )
}
