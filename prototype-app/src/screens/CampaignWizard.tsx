import creativeCatalog from '../../public/img/offer-variants/catalog.json'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, BadgePercent, Building2, ChevronDown, CircleAlert, ClipboardCheck, Clock3, Globe2, ImagePlus, Mail, Phone, UserRound, PanelTop, SlidersHorizontal, Tag, Upload, Users, Check, PencilLine, RotateCcw, Sparkles, X, type LucideIcon } from 'lucide-react'
import { LayoutGroup, motion, useAnimationControls, useReducedMotion } from 'motion/react'
import { useNavigate, useParams } from 'react-router'
import { autocompleteInn, fetchCampaignSiteProfile, requestOfferAi, requestOfferImage } from '../api'
import { offerAiNotes, type OfferAiInput } from '../../shared/offer-ai'
import { analytics, type AnalyticsPage, type EventParams, type Goal } from '../analytics'
import { campaignAllowedStage, campaignStage, campaignStages, emptyCampaignDraft, type StoredCampaignDraft } from './campaign-draft'
import { audienceGroups as groups, normalizeCampaignEmail } from '../../shared/campaign-draft'
import { MovingLabel, glide, settle } from './LandingMotion'
import { Field } from './CampaignField'
import { OfferReveal, useOfferVisibility } from './OfferGeneration'
import { OfferAssistant } from './OfferAssistant'
import { emptyOffer, offerErrors, withOfferDiscount, type OfferDraft } from '../../shared/campaign-offer.ts'
import { CampaignStart } from './CampaignStart'
import { BusinessSetup, PartnerFields, type BusinessPhase } from './BusinessSetup'
import { AudienceSetup, CampaignSuccess, type AudienceSummary } from './CampaignAudience'
import { formatPhone, innError, phoneError, localDate, normalizeBusinessWebsite, offerSuggestion, offerTheme, type BusinessProfile } from '../../shared/campaign-business'
import { CampaignCreative } from './CampaignCreative'
import { OfferAssetField } from './OfferAssetField'
import { OfferSurfaces } from './OfferSurfaces'
import { OfferGuidelines } from './OfferGuidelines'
import { type Tone } from '../../shared/campaign-offer'
import { CampaignSiteAssets } from './CampaignSiteAssets'
import { useOfferCutout } from './offer-cutout'
import './business-setup.css'
import './campaign-wizard.css'

const progressIcons = [Building2, Tag, PanelTop, Users, ClipboardCheck]
const dialogSteps = ['ваш бизнес', 'дизайн оффера', 'выбор клиентов']
const pageSteps = [...dialogSteps, 'заявка']
const introductions = [
  ['начнём с вашего бизнеса', 'Укажите данные компании'],
  ['Ваш оффер', 'Посмотрите на карточку глазами клиента. Текст и фото можно изменить.'],
  ['Кому показать предложение?', 'Выберите географию и клиентов для показа'],
  ['Проверьте заявку', 'Оставьте контакты представителя, чтобы команда билайна могла обсудить запуск'],
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

function useImage(file: File | null) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    const url = file ? URL.createObjectURL(file) : ''
    setSrc(url)
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [file])
  return src
}

export default function CampaignWizard({ open, onClose, presentation = 'dialog', initialDraft, onDraftChange, onRequestEmailCode, onSubmitDraft, storageState }: {
  open: boolean; onClose: () => void; presentation?: 'dialog' | 'page'; initialDraft?: StoredCampaignDraft;
  onDraftChange?: (draft: StoredCampaignDraft) => void; onRequestEmailCode?: (draft: StoredCampaignDraft, email: string) => Promise<void>;
  onSubmitDraft?: (draft: StoredCampaignDraft, code: string) => Promise<void>; storageState?: 'loading' | 'saving' | 'saved' | 'error';
}) {
  const page = presentation === 'page'
  const steps = page ? pageSteps : dialogSteps
  const successStage = page ? 5 : 4
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
  const [emailInput, setEmailInput] = useState(initial.contactEmailInput ?? initial.emailCheck?.email ?? initial.email ?? '')
  const [emailCheck, setEmailCheck] = useState(initial.contactName?.trim() && !phoneError(initial.business.phone) && !innError(initial.business.inn) && initial.offerAccepted ? initial.emailCheck : undefined)
  const [emailCode, setEmailCode] = useState('')
  const [sendingCode, setSendingCode] = useState(false)
  const email = normalizeCampaignEmail(emailInput)
  const codeRequested = Boolean(email && emailCheck?.email === email)
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
  const [step, setStep] = useState(Math.max(0, Math.min(steps.length - 1, initialStage - 1)))
  const [complete, setComplete] = useState(initialStage === successStage)
  const [manualSteps, setManualSteps] = useState<number[]>(initial.manualSteps ?? [])
  const [contactName, setContactName] = useState(initial.contactName ?? '')
  const [bySite, setBySite] = useState(initial.bySite ?? true)
  const [readingSite, setReadingSite] = useState(false)
  const profileRequest = useRef<AbortController | null>(null)
  const [siteNote, setSiteNote] = useState('')
  const [business, setBusiness] = useState(initial.business)
  const [partnerDetails, setPartnerDetails] = useState(initial.partnerDetails)
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
  const [clientView, setClientView] = useState(false)
  const [editing, setEditing] = useState<'text' | 'media' | 'terms' | null>(null)
  const [previousDesign, setPreviousDesign] = useState<{ file: File | null; layout: OfferDraft['layout']; keepOriginal: boolean } | null>(null)
  const appliedImage = useRef<File | null>(null)
  const [imageGenerating, setImageGenerating] = useState(false)
  const [imageMessage, setImageMessage] = useState('')
  const [imageError, setImageError] = useState('')
  const [creativeVariant, setCreativeVariant] = useState(initial.creativeVariant ?? 0)
  const imageRequest = useRef<AbortController | null>(null)
  const [removedImage, setRemovedImage] = useState<{ file: File | null; layout: OfferDraft['layout'] } | null>(null)
  const manualId = useId()
  const interacted = useRef(false)
  const fieldValues = useRef(new WeakMap<HTMLInputElement | HTMLTextAreaElement, string>())
  const generationRequest = useRef<AbortController | null>(null)
  const generationRun = useRef<{ started: number; kind: 'first' | 'rebuild' } | null>(null)
  const [offerImage, setOfferImage] = useState<File | null>(initial.offer.layout === 'artwork' ? initial.editorImage ?? null : initial.offerImage)
  const initialPhotoSite = useRef('')
  const [artworkImage, setArtworkImage] = useState<File | null>(initial.artworkImage ?? (initial.offer.layout === 'artwork' ? initial.offerImage : null))
  const artwork = offer.layout === 'artwork'
  const editorLayout = useRef(initial.editorLayout)
  const artworkSrc = useImage(artworkImage)
  const [brandLogo, setBrandLogo] = useState({
    file: initial.logoImage, website: initial.logoWebsite, skipped: initial.skippedLogoWebsite,
  })
  const website = normalizeBusinessWebsite(business.website)
  const logoImage = brandLogo.website && brandLogo.website !== website ? null : brandLogo.file
  const waitingForLogo = siteLoading && !logoImage && brandLogo.skipped !== website
  const cutout = useOfferCutout(offerImage, open && step > 0 && offer.layout !== 'photo' && offer.layout !== 'text' && !artwork,
    initial.offerCutout, initial.keepOriginalImage)
  const [audience, setAudience] = useState(initial.audience)
  const [audienceCity, setAudienceCity] = useState(initial.audienceCity)
  const displayCity = audienceCity ?? business.city
  const [triggers, setTriggers] = useState(initial.triggers)
  const [listening, setListening] = useState(false)
  const [voiceMessage, setVoiceMessage] = useState('')
  const photo = useImage(cutout.keepOriginal || offer.layout === 'photo' ? offerImage : cutout.cutout ?? offerImage)
  const image = artwork ? artworkSrc : photo
  const logo = useImage(logoImage)
  const name = business.name.trim() || 'ваш бизнес'
  const title = offer.title.trim()
  const errors = offerErrors(offer)
  const audienceSummary: AudienceSummary = {
    place: audience[0] === 0 ? `${business.city} · рядом с точками` : audience[0] === 1 ? displayCity.trim() || 'Город не указан' : 'Вся Россия',
    people: groups.slice(1, 4).flatMap((group, index) => {
      const choice = group.choices[audience[index + 1]]
      return audience[index + 1] ? [index === 2 ? `доход ${choice}` : index === 1 ? `возраст ${choice}` : choice] : []
    }).join(' · ') || 'Все клиенты',
    moment: ['В любой момент', 'После переезда', 'В день зарплаты'][audience[4]],
  }
  const theme = offerTheme(business.category)
  const illustration = 'illustration' in theme ? import.meta.env.BASE_URL + 'img/near/' + theme.illustration + '.avif' : ''
  const creative = <CampaignCreative name={name} offer={offer} image={image} illustration={illustration} logo={logo} disabled={busy || generating || revising || imageGenerating}/>
  const editableCreative = <CampaignCreative name={name} offer={offer} image={image} illustration={illustration} logo={logo} disabled={busy || generating || revising || imageGenerating}
    onEdit={panel => {
      setEditing(panel)
      requestAnimationFrame(() => document.getElementById(manualId + panel)?.querySelector<HTMLElement>('input:not([type=hidden]), select, button')?.focus())
    }} onTitleChange={artwork ? undefined : value => { generatedTitle.current = ''; setOffer(current => ({ ...current, title: value })) }}/>
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
    setRevealing(!reduce && (!page || method === 'automatic'))
    requestAnimationFrame(() => stepHeading.current?.focus({ preventScroll: true }))
  }, [track, reduce, page])
  const offerVisible = useOfferVisibility()
  const currentStage = complete ? successStage : step === 0 ? businessPhase === 'identify' ? 0 : 1 : step + 1
  const setupMode = manualSteps.includes(currentStage) ? 'manual' : 'quick'
  function toggleStepSettings() {
    setManualSteps(current => current.includes(currentStage) ? current.filter(stage => stage !== currentStage) : [...current, currentStage])
    setClientView(false)
  }
  const verifiedEmail = page && complete ? email || undefined : undefined
  const currentDraft: StoredCampaignDraft = { business, ...(page && { manualSteps, bySite, setupMode: manualSteps.length ? 'manual' : 'quick', contactName, contactEmailInput: emailInput }), partnerDetails, addresses, online, offer, offerImage: artwork ? artworkImage : offerImage, editorImage: offerImage, editorLayout: artwork ? editorLayout.current : offer.layout, artworkImage: artworkImage ?? undefined, logoImage, audience, audienceCity, triggers, email: verifiedEmail, emailCheck,
    offerCutout: cutout.cutout, keepOriginalImage: cutout.keepOriginal, logoWebsite: logoImage ? brandLogo.website : undefined,
    skippedLogoWebsite: brandLogo.skipped, creativeVariant,
    confirmedInn: page ? business.inn : confirmedInn.current, generatedTitle: generatedTitle.current, filled, hasProfile, registeredAddress,
    stage: currentStage, reached: Math.max(reached, currentStage), offerAccepted: !page || offerAccepted, submitted: page && complete }
  const stepName = campaignStages[currentStage]
  const offerFlags = { has_image: Boolean(offerImage), has_logo: Boolean(logoImage), has_promo: Boolean(offer.promo), has_discount: Boolean(offer.discount), tone: offer.tone }

  useEffect(() => {
    if (page && !busy && !closing && routeStage === stepName) analytics.view(`/v4/create/${stepName}` as AnalyticsPage, { step: stepName, resumed })
  }, [page, busy, closing, routeStage, stepName, resumed])

  useEffect(() => { setClientView(false); setEditing(null); setPreviousDesign(null); setRemovedImage(null) }, [step, complete])
  useEffect(() => { if (offerImage !== appliedImage.current) { setPreviousDesign(null); setImageMessage('') } }, [offerImage])
  useEffect(() => () => { imageRequest.current?.abort(); imageRequest.current = null; setImageGenerating(false) }, [step])
  useEffect(() => { if (offer.gift || offer.discount) setDiscountEnabled(Boolean(offer.discount)) }, [offer.gift, offer.discount])

  useEffect(() => {
    onDraftChange?.(currentDraft)
  }, [business, manualSteps, bySite, contactName, emailInput, partnerDetails, addresses, online, offer, offerImage, artworkImage, creativeVariant, logoImage, brandLogo, cutout.cutout, cutout.keepOriginal, audience, audienceCity, triggers, verifiedEmail, emailCheck, filled, hasProfile, registeredAddress, currentStage, reached, offerAccepted, onDraftChange])

  useEffect(() => {
    const inn = business.inn
    setSuggestion(null)
    setLookupError('')
    setSearching(false)
    if (!open || (page ? step !== 3 || complete : step !== 0 || businessPhase !== 'identify') || innError(inn)) return
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
  }, [business.inn, businessPhase, lookupAttempt, open, step, track, page, complete])

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
    setStep(Math.max(0, Math.min(steps.length - 1, target - 1)))
    setComplete(target === successStage)
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
    const allowed = campaignAllowedStage(currentDraft)
    const stage = done && allowed === 4 ? successStage : Math.min(target + 1, allowed)
    target = Math.max(0, Math.min(steps.length - 1, stage - 1))
    done = stage === successStage
    if (locked.current || (target === step && done === complete)) return
    if (imageRequest.current && target !== 1) cancelGeneration()
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
    direction.current = (done ? steps.length : target) > (complete ? steps.length : step) ? 1 : -1
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
      if (step === 1) setClientView(false)
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
    setPartnerDetails(undefined)
    setBusiness(current => ({ ...current, name: '', category: '', city: '', website: '' }))
    setAddresses([''])
    setOffer({ ...emptyOffer }); setDiscountEnabled(false)
    setOfferImage(null); setArtworkImage(null); setCreativeVariant(0); setImageMessage(''); setImageError(''); setBrandLogo({ file: null, website: undefined, skipped: undefined }); setFilled(false); cancelGeneration()
    setGenerationNotes([]); setGenerationClarification(undefined)
    generatedTitle.current = ''
    setReached(1)
    setEmailInput(''); setEmailCode(''); setEmailCheck(undefined); setFinishError('')
    setAudience(groups.map(() => 0)); setAudienceCity(undefined); setTriggers(''); setOnline(false)
  }

  useEffect(() => () => profileRequest.current?.abort(), [routeStage])
  async function prepareProfile() {
    if (!validate() || profileRequest.current) return
    setSiteNote('')
    if (bySite) {
      const site = normalizeBusinessWebsite(business.website)
      const controller = new AbortController()
      profileRequest.current = controller
      setReadingSite(true)
      try {
        const profile = await fetchCampaignSiteProfile(site, AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]))
        if (controller.signal.aborted) return
        setBusiness(current => ({ ...current, website: site, name: current.name || profile.name, category: current.category || profile.subject }))
        setSiteNote([profile.name, profile.subject, profile.description].filter(Boolean).length
          ? 'На странице нашли: ' + [...new Set([profile.name, profile.subject, profile.description].filter(Boolean))].join(' · ')
          : 'Страница доступна. Заполните название и предложение вручную.')
      } catch {
        if (controller.signal.aborted) return
        setSiteNote('Не удалось прочитать страницу. Ссылка сохранена, сведения можно заполнить вручную.')
      } finally {
        profileRequest.current = null
        setReadingSite(false)
      }
    } else setBusiness(current => ({ ...current, website: '' }))
    direction.current = 1
    setBusinessPhase('review')
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
    imageRequest.current?.abort(); imageRequest.current = null; setImageGenerating(false)
    setGenerating(false)
    setRevealing(false)
  }

  async function beginGeneration(kind: 'first') {
    if (generationRequest.current) return
    const controller = new AbortController()
    generationRequest.current = controller
    initialPhotoSite.current = page && !offerImage && !artwork && offer.layout !== 'text' ? website : ''
    const draft = { ...offer, title: page && business.category.trim().length >= 5 ? business.category.trim().slice(0, 90) : offerSuggestion(business) }
    setFilled(true)
    generatedTitle.current = draft.title
    setOffer(draft)
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

  const library = Object.values(creativeCatalog).find(group => group.categories.some(category => business.category.toLowerCase().includes(category)))?.files ?? []
  const libraryBase = import.meta.env.BASE_URL + 'img/offer-variants/'
  async function rebuildCreative(asset?: string) {
    if (artwork || imageRequest.current || generating || revising) return
    initialPhotoSite.current = ''
    const controller = new AbortController()
    imageRequest.current = controller
    setImageGenerating(true); setImageError(''); setImageMessage('')
    const started = Date.now()
    track('v4_generation_start', { step: 'offer', generation: 'rebuild', ...offerFlags })
    try {
      let result
      if (asset && library.includes(asset)) {
        const response = await fetch(libraryBase + asset, { signal: controller.signal })
        if (!response.ok) throw new Error('Не удалось загрузить изображение')
        const blob = await response.blob()
        if (blob.type !== 'image/png') throw new Error('Не удалось открыть изображение')
        result = { file: new File([blob], asset, { type: blob.type }), demo: true }
      } else result = await requestOfferImage({ category: business.category, title: offer.title, variant: creativeVariant }, offerImage, controller.signal)
      if (controller.signal.aborted) return
      setPreviousDesign({ file: offerImage, layout: offer.layout, keepOriginal: cutout.keepOriginal })
      appliedImage.current = result.file
      setOfferImage(result.file)
      cutout.setKeepOriginal(false)
      setOffer(current => ({ ...current, layout: current.layout === 'text' ? 'split' : current.layout }))
      setRemovedImage(null)
      setCreativeVariant(value => value + 1)
      setImageMessage(asset ? 'Изображение заменено' : result.demo ? 'Демо: подготовленный ИИ-креатив. Можно выбрать другой вариант.' : 'Новый креатив готов')
      setRevealing(!asset && !reduce)
      track('v4_generation_complete', { step: 'offer', generation: 'rebuild', method: 'automatic', duration_ms: Date.now() - started })
    } catch (error) {
      if (!controller.signal.aborted) setImageError(error instanceof Error ? error.message : 'Не удалось создать креатив. Попробуйте ещё раз')
    } finally {
      if (imageRequest.current === controller) { imageRequest.current = null; setImageGenerating(false) }
    }
  }

  function undoCreative() {
    if (!previousDesign) return
    appliedImage.current = previousDesign.file
    setOfferImage(previousDesign.file)
    setOffer(current => ({ ...current, layout: previousDesign.layout }))
    cutout.setKeepOriginal(previousDesign.keepOriginal, previousDesign.file)
    setPreviousDesign(null); setImageMessage('Вернули предыдущий креатив'); setImageError(''); setRevealing(!reduce)
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
    initialPhotoSite.current = ''
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

  async function requestCode() {
    if (!email || !onRequestEmailCode || sendingCode || finalizing) return
    setSendingCode(true)
    setFinishError('')
    try {
      await onRequestEmailCode(currentDraft, email)
      setEmailCode('')
      setEmailCheck({ email })
      requestAnimationFrame(() => form.current?.querySelector<HTMLInputElement>('[name="emailCode"]')?.focus())
    } catch (error) {
      setFinishError(error instanceof Error && error.name === 'Error' ? error.message : 'Не удалось отправить письмо. Попробуйте ещё раз')
    } finally { setSendingCode(false) }
  }

  const skipGeneration = page && step === 1 && generating
  const primaryLabel = complete ? 'Готово'
    : sendingCode ? 'Отправляем код…'
    : finalizing ? 'Проверяем код…'
    : skipGeneration ? 'Продолжить с черновиком'
    : step === 1 && generating ? 'готовим предложение…'
    : readingSite ? 'Читаем страницу…'
    : searching && !page ? 'ищем бизнес…'
    : step === 0 ? businessPhase === 'identify' ? page ? 'Подготовить черновик' : matchingSuggestion ? 'проверить данные' : 'найти бизнес' : page ? 'Перейти к офферу' : 'собрать оффер'
    : step === 3 ? codeRequested ? 'Подтвердить и отправить заявку' : 'Получить код'
    : step === 2 ? page ? 'Проверить заявку' : 'Завершить настройку'
    : 'Дальше: выбрать клиентов'

  async function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked.current || readingSite || (!page && searching) || finalizing || sendingCode) return
    if (skipGeneration) { finishGeneration('skip'); return }
    if ((step === 1 && (generating || revising || imageGenerating)) || cutout.processing) return
    if (complete) { void requestClose(); return }
    if (step === 0 && businessPhase === 'identify') {
      if (page) { await prepareProfile(); return }
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
      if (!page && (innError(business.inn) || phoneError(business.phone))) { setBusinessPhase('identify'); return }
      track('v4_business_complete', { online, address_count: online ? 0 : addresses.length })
      if (!filled) void beginGeneration('first')
      if (online && audience[0] === 0) setAudience(current => current.map((value,i)=>i===0?2:value))
    }
    if (step < steps.length - 1) { if (step === 1) track('v4_offer_complete', offerFlags); void navigate(step + 1); return }
    if (campaignAllowedStage(currentDraft) < 4) { void navigate(2); return }
    if (!page) { await navigate(2, true); return }
    if (!codeRequested) { await requestCode(); return }
    setFinishError('')
    speech.current?.abort()
    const token = epoch.current
    setFinalizing(true)
    track('v4_save_start', { step: 'email' })
    try {
      if (!onSubmitDraft) throw new Error('Не удалось отправить заявку. Попробуйте ещё раз')
      await onSubmitDraft({ ...currentDraft, email }, emailCode)
      if (token !== epoch.current) return
      track('v4_save_result', { result: 'success' })
      track('v4_setup_complete', { ...offerFlags, online, has_wishes: Boolean(triggers.trim()), address_count: online ? 0 : addresses.length, resumed })
      setEmailCode('')
      setEmailCheck(undefined)
      await navigate(3, true)
    } catch (error) {
      track('v4_save_result', { result: 'error' })
      setFinishError(error instanceof Error && error.name === 'Error' ? error.message : 'Не удалось отправить заявку. Попробуйте ещё раз')
    }
    finally { setFinalizing(false) }
  }

  const quick = page && setupMode === 'quick'
  const progress = page ? ['Бизнес', 'Предложение', 'Оффер', 'Клиенты', 'Заявка'] : steps
  const activeStep = page ? Math.min(currentStage, progress.length - 1) : step
  const siteAssets = website && <CampaignSiteAssets key={website} website={website} logo={logoImage} image={offerImage}
                    onLogo={file => chooseLogo(file, true)} onAutoLogo={applySiteLogo} onAutoImage={file => {
                      if (initialPhotoSite.current !== website) return
                      initialPhotoSite.current = ''
                      setOfferImage(current => current ?? file)
                    }} onImage={chooseImage} onLoading={setSiteLoading}
                    disabled={revising || busy || generating || imageGenerating} hidden={false} />
  const termsPanel = <fieldset id={manualId + 'terms'} className="offer-edit-panel v3-fields" data-offer-panel="terms" hidden={!quick && editing !== 'terms'} disabled={generating || revising || imageGenerating}>
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
  const imageChoices = library.length > 0 && <div className="offer-variants">{library.map((file, index) => <button key={file} type="button" aria-label={'Выбрать креатив ' + (index + 1)} aria-pressed={offerImage?.name === file} disabled={generating || revising || imageGenerating} onClick={() => void rebuildCreative(file)}><img src={libraryBase + file} alt="" loading="lazy"/></button>)}</div>
  const creativeActions = <div className="offer-workspace-toolbar" role="toolbar" aria-label="Действия с оффером" hidden={artwork}>
                  <button type="button" disabled={artwork || revising || generating || imageGenerating} onClick={() => { void rebuildCreative() }}><Sparkles size={16}/>{imageGenerating ? 'Создаём креатив…' : 'Создать ещё'}</button>
                  <button type="button" disabled={revising || generating || imageGenerating || !previousDesign} onClick={undoCreative}><RotateCcw size={16}/>Вернуть предыдущий</button>
                </div>
  const placementCreative = artwork && !image ? null : <CampaignCreative name={name} offer={offer} image={image} illustration={illustration} logo={logo} disabled={false}/>
  const quickSurfaces = <OfferSurfaces compact>{placementCreative}</OfferSurfaces>
  function editorStatus(): [LucideIcon, string] {
    if (generating) return [Sparkles, 'Собираю предложение…']
    if (imageGenerating) return [Sparkles, 'Создаём новое изображение…']
    if (revising) return [Sparkles, 'Обновляю предложение…']
    if (storageState === 'error') return [CircleAlert, 'Не удалось сохранить изменения']
    if (storageState === 'saving') return [Clock3, 'Сохраняем…']
    if (waitingForLogo) return [Clock3, 'Ищем логотип на сайте…']
    if (cutout.processing) return [Clock3, 'Убираем фон…']
    if (cutout.failed) return [CircleAlert, 'Показываем фото с исходным фоном']
    return [Check, page ? 'Изменения сохранены' : 'Все изменения применены']
  }
  const [StatusIcon, statusText] = editorStatus()
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
          <LayoutGroup id="campaign-progress"><ol className="v3-progress" aria-label="Шаги настройки">{progress.map((label, i) => {
            const Icon = progressIcons[i]
            return (
            <li key={label} aria-current={i === activeStep && !complete ? 'step' : undefined} className={i < activeStep || complete ? 'is-done' : ''}>
              <button type="button" aria-label={page && (i < activeStep || complete) ? label + ', шаг завершён' : undefined} disabled={busy || readingSite || (!page && searching) || finalizing || sendingCode || (i > activeStep && !complete)} onClick={() => page ? routerNavigate('/v4/create/' + campaignStages[i]) : void navigate(i)}>{i === activeStep && <motion.span className="v3-step-indicator" layoutId="progress-line" transition={reduce ? { duration: 0 } : settle} />}<span className="v3-progress__number" aria-hidden="true">{i < activeStep || complete ? <motion.span className="v3-progress-check" initial={reduce ? false : { scale: .5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}><Check size={page ? 16 : 14} /></motion.span> : page ? <Icon size={16}/> : '0' + (i + 1)}</span>{label}</button>
            </li>
          )})}</ol></LayoutGroup>
        </header>

        <div className="v3-dialog__body" ref={scroller}>
          <motion.div className="v3-dialog__scene" initial={false} animate={sceneMotion} inert={busy}>
          {!complete && <div className="v3-step-intro"><div><h3 ref={stepHeading} tabIndex={-1}>{step === 0 ? businessPhase === 'identify' ? page ? 'Что хотите продвигать?' : 'начнём с вашего бизнеса' : page ? 'Проверьте ваш бизнес' : 'проверьте бизнес и добавьте точки' : step === 1 && generating ? 'Собираем ваш оффер' : step === 3 && codeRequested ? 'Подтвердите почту' : introductions[step][0]}</h3><p>{step === 0 ? page && businessPhase === 'identify' ? 'Подготовим черновик, а вы проверите, как выглядит предложение' : 'По этим данным подготовим предложение для клиентов' : step === 1 && generating ? 'Готовим черновик на основе данных о бизнесе' : step === 3 && codeRequested ? email : introductions[step][1]}</p></div><span>0{step + 1} / 0{steps.length}</span></div>}
          {page && !complete && currentStage >= 1 && currentStage <= 3 && <div className="campaign-mode-line">
            <button type="button" className="campaign-settings-toggle" aria-expanded={!quick} onClick={toggleStepSettings}>
              <SlidersHorizontal size={16} aria-hidden="true"/>{quick ? 'Настроить самостоятельно' : 'Вернуться к быстрой настройке'}<ChevronDown size={15} aria-hidden="true"/>
            </button>
          </div>}
          {page && !complete && step === 0 && businessPhase === 'identify' && <CampaignStart business={business} bySite={bySite} loading={readingSite} onSource={setBySite} onChange={setBusiness}/>}
          {page && !complete && step === 0 && businessPhase === 'review' && siteNote && <details className="campaign-site-note"><summary><Globe2 size={16}/>Что удалось узнать с сайта<ChevronDown size={16}/></summary><p>{siteNote}</p></details>}
          {!complete && step === 0 && (!page || businessPhase === 'review') && <BusinessSetup quickPreview={quick ? <aside className="campaign-draft-preview"><h4>Ваш черновик</h4><CampaignCreative name={name} offer={{ ...offer, title: filled ? offer.title : business.category || 'Ваше предложение' }} logo={logo} image={image} illustration={illustration} disabled/></aside> : undefined} websiteFirst={page} phase={businessPhase} business={business} onChange={setBusiness} partnerDetails={partnerDetails} onPartnerDetails={setPartnerDetails} hasProfile={hasProfile} registeredAddress={registeredAddress} suggestionName={matchingSuggestion?.name} lookupError={lookupError} searching={searching} onCancel={() => cancelLookup(true)} onManual={manualEntry} addresses={addresses} onAddresses={value => { if (value.length !== addresses.length) track('v4_address_change', { action: value.length > addresses.length ? 'add' : 'remove', address_count: value.length }); setAddresses(value) }} online={online} onOnline={value => { track('v4_business_mode', { online: value }); setOnline(value) }} offerAccepted={offerAccepted} onOfferAccepted={page ? setOfferAccepted : undefined} />}
          {!complete && step === 1 && !quick && !generating && <div className="v3-campaign-context"><span><Check size={14}/> {name}</span><span>{online ? 'онлайн' : business.city + ' · точек: ' + addresses.filter(a=>a.trim()).length}</span></div>}

          {!complete && step === 1 && quick && <div className="campaign-simple-grid">
            <div className="v3-fields">
              <Field label="Текст предложения" required maxLength={90} value={offer.title} error={errors.title} disabled={generating || revising}
                onChange={e => { generatedTitle.current = ''; setOffer({ ...offer, title: e.target.value }) }}/>
              <details className="campaign-disclosure"><summary><BadgePercent size={18}/>Условия акции<ChevronDown size={16}/></summary>{termsPanel}</details>
              {!artwork && <details className="campaign-disclosure"><summary><ImagePlus size={18}/>Выбрать изображение<ChevronDown size={16}/></summary>
                {imageChoices}{creativeActions}<OfferAssetField kind="photo" track={page} file={offerImage} preview={photo || illustration} onChange={chooseImage}/>{siteAssets}
                {imageMessage && <p role="status">{imageMessage}</p>}{imageError && <p role="alert">{imageError}</p>}
              </details>}
              {artwork && <OfferAssetField kind="artwork" file={artworkImage} onChange={setArtworkImage}/>}
            </div>{quickSurfaces}
          </div>}
          {!complete && step === 1 && !quick && <div className="offer-source-switch offer-mode-switch" role="group" aria-label="Режим оффера">
            <button type="button" aria-pressed={!clientView} onClick={() => setClientView(false)}>Редактор</button>
            <button type="button" aria-pressed={clientView} disabled={generating || revising || imageGenerating} onClick={() => setClientView(true)}>Как увидит клиент</button>
          </div>}
          {!complete && step === 1 && !quick && clientView && <OfferSurfaces>{placementCreative}</OfferSurfaces>}
          {!complete && step === 1 && !quick && <div hidden={clientView} className="v3-dialog__split campaign-offer-editor" data-generating={generating}>
              <section className="v3-preview-column offer-workspace" aria-label="Визуальный редактор оффера">
                <div className="v3-offer-stage">
                  <div className="v3-offer-card" aria-busy={generating || revising || imageGenerating}>
                    {artwork && !artworkImage ? <div className="offer-artwork-empty"><PencilLine size={32}/><h4>Ваш готовый оффер</h4><p>Загрузите макет ниже. Покажем его целиком и сохраним ваши тексты и дизайн.</p></div> : editableCreative}
                    {(generating || revising || imageGenerating || revealing) && <OfferReveal ready={revealing && !generating && !revising && !imageGenerating && !waitingForLogo}
                      paused={!offerVisible || busy} onReveal={() => setRevealing(false)}/>}
                  </div>
                </div>
                <p className="offer-editor-hint">{artwork ? 'Макет показывается целиком. Текст внутри изображения меняется в исходном файле.' : 'Нажмите на заголовок, скидку или фото прямо в карточке, чтобы изменить их.'}</p>
                {!artwork && <details className="offer-variant-tray"><summary>Другие креативы</summary>
                  {imageChoices}
                {creativeActions}
                </details>}
                {(imageError || imageMessage) && <p className="offer-image-feedback" data-error={Boolean(imageError)} role={imageError ? 'alert' : 'status'}>{imageError || imageMessage}</p>}
                <div className="offer-source-switch" role="group" aria-label="Способ создания оффера"><button type="button" aria-pressed={!artwork} disabled={generating || revising || imageGenerating} onClick={() => { if (artwork) setOffer(current => ({ ...current, layout: editorLayout.current ?? 'split' })) }}><PencilLine size={16}/>Карточка оффера</button><button type="button" aria-pressed={artwork} disabled={generating || revising || imageGenerating} onClick={() => { if (!artwork) editorLayout.current = offer.layout; setEditing(null); setOffer(current => ({ ...current, layout: 'artwork' })) }}><Upload size={16} aria-hidden="true"/>Загрузить готовый макет</button></div>
                {artwork && <div className="offer-artwork-upload"><OfferAssetField kind="artwork" file={artworkImage} onChange={setArtworkImage}/></div>}
                <div className="offer-canvas-status"><span role="status" aria-live="polite"><span className="offer-status-icon" data-saved={StatusIcon === Check} aria-hidden="true"><StatusIcon size={15}/></span><MovingLabel>{statusText}</MovingLabel></span>{generating && !page && <button type="button" onClick={() => finishGeneration('skip')}>Продолжить с черновиком</button>}{!generating && cutout.processing && <button type="button" onClick={() => cutout.setKeepOriginal(true)}>Оставить оригинал</button>}</div>
              </section>
              <div className="campaign-offer-control-space">
                <div className="offer-inspector" hidden={generating}><h4>Настройки оффера</h4>
                <div className="offer-edit-actions" aria-label="Настройки предложения">
                  {([['text', artwork ? 'Описание акции' : 'Заголовок'], ['media', 'Фото и логотип'], ['terms', 'Условия акции']] as const).map(([panel, label]) =>
                    <button key={panel} type="button" disabled={generating || revising || imageGenerating} hidden={artwork && panel === 'media'} aria-expanded={editing === panel}
                      aria-controls={manualId + panel} onClick={() => setEditing(editing === panel ? null : panel)}>{label}</button>)}
                </div>
                <fieldset id={manualId + 'text'} className="offer-edit-panel v3-fields" data-offer-panel="text" hidden={editing !== 'text'} disabled={generating || revising || imageGenerating}>
                  <Field label="Текст предложения" data-analytics-field="title" placeholder="Например, стрижка со скидкой на первый визит" value={offer.title} onChange={e => { generatedTitle.current = ''; setOffer({ ...offer, title: e.target.value }) }} maxLength={90} required error={errors.title} />
                  <p className="bl-caption">Размер скидки и промокод можно указать в «Условиях акции».</p>
                </fieldset>
                <fieldset id={manualId + 'media'} className="offer-edit-panel v3-fields" data-offer-panel="media" hidden={artwork || editing !== 'media'} disabled={artwork || generating || revising || imageGenerating}>
                  <div className="v3-fields__pair">
                    <OfferAssetField kind="photo" track={page} file={offerImage} preview={offer.layout === 'text' ? '' : photo || illustration} onChange={chooseImage} />
                    <OfferAssetField kind="logo" track={page} file={logoImage} preview={logo} onChange={chooseLogo} />
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
                  {siteAssets}
                </fieldset>
                {removedImage && <div className="offer-image-undo" role="status">Фото удалено.
                  <button type="button" className="v3-text-button" disabled={generating || revising || imageGenerating} onClick={() => {
                    setOfferImage(removedImage.file); setOffer(current => ({ ...current, layout: removedImage.layout })); setRemovedImage(null)
                  }}>Вернуть фото</button>
                </div>}
                {termsPanel}
                {!artwork && (!page || setupMode === 'manual') && <details className="offer-design-controls"><summary>Цвет фона</summary>
                  <div className="offer-tone-picker" role="group" aria-label="Цвет оффера">{([['violet', 'Фиолетовый'], ['blue', 'Синий'], ['red', 'Красный'], ['teal', 'Бирюзовый'], ['green', 'Зелёный'], ['magenta', 'Розовый'], ['dark', 'Тёмный'], ['light', 'Жёлтый']] as [Tone, string][]).map(([tone, label]) => <button key={tone} type="button" className={'cr--' + tone} aria-label={label} title={label} aria-pressed={!offer.background && offer.tone === tone} disabled={generating || revising || imageGenerating} onClick={() => setOffer(current => ({ ...current, tone, background: undefined }))}>{!offer.background && offer.tone === tone && <Check size={16}/>}</button>)}</div>
                  <label className="offer-custom-color">Свой цвет <input type="color" aria-label="Свой цвет фона" disabled={generating || revising || imageGenerating} value={offer.background ?? '#7851e8'} onChange={e => { const background = e.target.value; setOffer(current => ({ ...current, background })) }}/>{offer.background?.toUpperCase()}</label>
                </details>}
                <div className="offer-material-help"><OfferGuidelines/></div>
                </div>
                <div className="offer-preparing-note" aria-hidden={!generating}><span className="offer-source-mark">{name.replace(/^.*«(.+)»$/, '$1')}</span><p>Собираю предложение<br/>для вашего бизнеса</p><small>Потом можно изменить текст<br/>или настроить детали вручную</small></div>
                <div className="v3-fields campaign-offer-controls" inert={generating} aria-hidden={generating}>
                {generationNotes.length > 0 && <ul className="offer-ai-notes" aria-label="Предложения помощника">
                  {generationNotes.map((note, index) => <li key={index}>{note}</li>)}
                </ul>}
                {!artwork && (!page || setupMode === 'manual') && <details className="offer-assistant-disclosure"><summary><Sparkles size={16}/>Изменить с помощью ИИ</summary><OfferAssistant track={page} context={aiContext} initialClarification={generationClarification} active={open && !closing && !busy && !generating && !imageGenerating} onChange={value => { setDiscountEnabled(Boolean(value.discount)); if (value.title !== offer.title) generatedTitle.current = ''; setOffer(value); if (revising && !reduce) setRevealing(true) }} onWorking={setRevising} onRemoveBackground={removePhotoBackground} onRemoveImage={() => { chooseImage(null); return 'Фото удалено. Его можно вернуть под карточкой' }}/></details>}

                </div>
              </div>
            </div>}

          {!complete && step === 2 && <>
            <AudienceSetup quick={page && setupMode === 'quick'} groups={groups} values={audience} onChange={value => {
              const group = value.findIndex((choice, index) => choice !== audience[index])
              if (group >= 0) track('v4_audience_select', { group: (['geography', 'gender', 'age', 'income', 'moment'] as const)[group], choice: value[group] })
              setAudience(value)
            }} city={displayCity} onCityChange={page ? setAudienceCity : city => setBusiness(current => ({ ...current, city }))} online={online} addresses={addresses} triggers={triggers} onTriggers={setTriggers} onDictate={dictate} listening={listening} voiceMessage={voiceMessage} disabled={finalizing} summary={audienceSummary} preview={preview}/>
          </>}
          {!complete && step === 3 && <div className={codeRequested ? 'v3-fields campaign-email' : 'campaign-simple-grid campaign-final-review'}>
            {!codeRequested && <div className="v3-fields">

            <Field label="ИНН компании или ИП" name="inn" inputMode="numeric" maxLength={12} required value={business.inn}
              error={innError(business.inn)} disabled={sendingCode || finalizing} hint={matchingSuggestion?.name || lookupError || 'По ИНН проверим реквизиты компании или ИП.'}
              onChange={e => { const inn = e.target.value.replace(/\D/g, ''); setBusiness(current => ({ ...current, inn })); setPartnerDetails(undefined); setHasProfile(false); setRegisteredAddress('') }}/>
            <PartnerFields inn={business.inn} partnerDetails={partnerDetails} onPartnerDetails={setPartnerDetails}/>
            <Field label="Как к вам обращаться?" icon={UserRound} autoComplete="name" name="contactName" maxLength={100} required value={contactName} disabled={sendingCode || finalizing} error={contactName && !contactName.trim() ? 'Введите имя представителя' : ''} onChange={e => setContactName(e.target.value)} />
            <Field label="Телефон представителя" icon={Phone} autoComplete="tel" type="tel" name="phone" maxLength={25} required disabled={sendingCode || finalizing}
              value={business.phone} error={phoneError(business.phone)} placeholder="+7 (900) 000-00-00" hint="Сюда позвонит сотрудник, если понадобится уточнить детали."
              onChange={e => setBusiness({ ...business, phone: e.target.value })} onBlur={e => setBusiness({ ...business, phone: formatPhone(e.target.value) })}/>
            <Field label="Электронная почта" icon={Mail} hint="Пришлём код для подтверждения заявки." name="email" type="email" autoComplete="email" maxLength={254} required
              value={emailInput} disabled={sendingCode || finalizing}
              error={emailInput && !email ? 'Укажите корректный email' : ''}
              onChange={event => { setEmailInput(event.target.value); setEmailCode(''); setFinishError('') }}/>
            <div className="v3-offer-consent"><label className="bl-check"><input type="checkbox" name="offerAccepted" required disabled={sendingCode || finalizing} checked={offerAccepted} onChange={e => setOfferAccepted(e.target.checked)}/><span className="bl-check__box" aria-hidden="true"/><span>Принимаю условия <a href={import.meta.env.BASE_URL + 'docs/oferta_0.1.pdf'} target="_blank" rel="noopener noreferrer">оферты</a></span></label>
              <p className="bl-caption">После принятия оферты черновик сохраняется на сервере. Команда билайна увидит заявку после подтверждения и отправки.</p></div>
            </div>}
            {!codeRequested && <section className="campaign-review-summary">{preview}<h4>{business.name}</h4><p>{offer.title}</p><p>{audienceSummary.place} · {audienceSummary.people} · {audienceSummary.moment}</p>
              <button type="button" className="v3-text-button" disabled={sendingCode || finalizing} onClick={() => void navigate(1)}>Проверить оффер</button>
              <button type="button" className="v3-text-button" disabled={sendingCode || finalizing} onClick={() => void navigate(2)}>Изменить аудиторию</button></section>}
            {codeRequested && <>
              <p role="status" className="bl-caption campaign-mail-hint"><Mail size={18} aria-hidden="true"/> Отправили письмо с шестизначным кодом. Проверьте входящие и папку «Спам».</p>
              <button type="button" className="v3-text-button" disabled={sendingCode || finalizing} onClick={() => { setEmailCheck(undefined); setEmailCode(''); setFinishError('') }}>Изменить контакты</button>
              <Field label="Код из письма" name="emailCode" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required
                value={emailCode} disabled={sendingCode || finalizing} error={emailCode && emailCode.length !== 6 ? 'Введите 6 цифр' : ''}
                onChange={event => { setEmailCode(event.target.value.replace(/\D/g, '')); setFinishError('') }}/>
              <button type="button" className="v3-text-button" disabled={sendingCode || finalizing} onClick={() => void requestCode()}>Отправить код ещё раз</button>
            </>}
            {finishError && <p className="campaign-finish-error" role="alert">{finishError}</p>}
          </div>}
          {complete && <CampaignSuccess headingRef={stepHeading} preview={preview} name={name} offerTitle={title} summary={audienceSummary} email={page ? email : undefined} submitted={page} saved={page && storageState === 'saved'}/>}
          {page && complete && <aside className="campaign-beegpt-banner">
            <div className="campaign-beegpt-banner__content">
              <h4>Используй ИИ бесплатно в приложении билайн</h4>
              <a className="bl-btn bl-btn--dark" href="https://samara.beeline.ru/customers/products/mobile/promobeegpt/"
                target="_blank" rel="noopener noreferrer">
                Попробовать <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
            <img src={import.meta.env.BASE_URL + 'img/beegpt-banner.png'} alt="" loading="lazy" decoding="async" />
          </aside>}
          </motion.div>
        </div>

        <footer className="v3-dialog__actions">
          <span className="v3-dialog__footer-note">{complete ? page ? 'Кампания подготовлена' : 'Вы завершили все три шага' : page ? `Шаг ${activeStep + 1} из ${progress.length}` : step === 1 ? 'всё можно изменить перед запуском' : step === 0 && businessPhase === 'identify' ? 'без регистрации и запуска рекламы' : `шаг 0${step + 1} из 0${steps.length}`}</span>
          {(step > 0 || complete || businessPhase === 'review') && <button type="button" className="bl-btn" disabled={busy || finalizing || sendingCode} onClick={() => { if (step === 3 && codeRequested) { setEmailCheck(undefined); setEmailCode(''); setFinishError('') } else if (step === 0 && businessPhase === 'review') { direction.current = -1; setBusinessPhase('identify') } else void navigate(complete ? 2 : step - 1) }}><ArrowLeft size={17} aria-hidden="true" /> {complete ? 'Изменить настройки' : 'назад'}</button>}
          <motion.button type="submit" className="bl-btn bl-btn--dark" disabled={busy || readingSite || (!page && searching) || finalizing || sendingCode || (!skipGeneration && (cutout.processing || (step === 1 && (generating || revising || imageGenerating))))} whileTap={reduce ? undefined : { scale: .97 }}><MovingLabel>{primaryLabel}</MovingLabel>{!complete && <ArrowRight size={18} aria-hidden="true" />}</motion.button>
        </footer>
      </form>
    </Surface>
  )
}
