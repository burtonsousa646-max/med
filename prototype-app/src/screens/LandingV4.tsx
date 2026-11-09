import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { analytics, type EventParams } from '../analytics'
import { Link, useNavigate } from 'react-router'
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react'
import { ArrowRight, Check } from 'lucide-react'
import { Brand } from '../ui'
import { Creative, creativeOf } from '../creative'
import { DEMO_AD } from '../mock'
import { AppScreenshotPhone } from './AppScreenshotPhone'
import { CampaignAction, Hero, LaunchContext, SketchMetrics, SURFACES as BASE_SURFACES, useHeaderCta } from './LandingV2'
import { HowGraphic } from './HowGraphics'
import './landing-v3.css'
import './landing-motion.css'
import './v3-v2-theme.css'
import './landing-v4.css'

const SURFACES = BASE_SURFACES.map(surface => ({ ...surface, ...{
  main: { d: 'Когда абонент открывает приложение и проверяет баланс' },
  showcase: { t: 'в разделе «подарки и акции»', d: 'Среди акций магазинов и кафе рядом' },
  paid: { d: 'После оплаты услуг билайна' },
  rest: { t: 'на витринах партнёров', d: 'На сайтах и в приложениях партнёров' },
}[surface.k] }))
const STEPS = [
  { kind: 'business', title: 'Информация о компании', text: 'Введите ИНН и телефон, затем добавьте адреса ваших точек' },
  { kind: 'offer', title: 'соберите оффер', text: 'Подготовим предложение по данным компании. Вы сможете изменить фото, скидку и промокод' },
  { kind: 'audience', title: 'выберите клиентов', text: 'Выберите клиентов, город и подходящий момент для показа' },
  { kind: 'guests', title: 'встречайте новых гостей', text: 'Принимайте гостей и помогайте им воспользоваться акцией' },
] as const
const NAV = [['how', 'как это работает'], ['where', 'где покажем']] as const
const STEP_STATUS = [
  'точка добавлена', 'креатив готов', 'аудитория подобрана', 'визит подтверждён',
] as const

function HowStep({ step, index, progress }: { step: typeof STEPS[number]; index: number; progress: MotionValue<number> }) {
  const reduce = useReducedMotion()
  const scale = useTransform(progress, [index / STEPS.length, 1], [1, 1 - (STEPS.length - 1 - index) * .025])
  return <li className="v4-stack-step" style={{ '--step-index': index } as CSSProperties}>
    <motion.article className={`v4-stack-card v4-stack-card--${step.kind}`} style={{ scale: reduce ? 1 : scale }} aria-labelledby={`v4-step-${step.kind}`}>
      <div className="v4-stack-copy">
        <span className="v4-stack-count">0{index + 1} / 04</span>
        <h3 id={`v4-step-${step.kind}`}>{step.title}</h3>
        <p>{step.text}</p>
        <span className="v4-stack-result"><Check size={18}/>{STEP_STATUS[index]}</span>
      </div>
      <div className="v4-stack-visual"><div className="v4-stack-art" data-ss-fill><HowGraphic kind={step.kind} unified controlledPhase={2}/></div></div>
    </motion.article>
  </li>
}

function HowItWorks() {
  const ref = useRef<HTMLOListElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 176px', 'end end'] })
  return <section id="how" className="bl-section bl-section--wide v4-how" aria-labelledby="v4-how-title">
    <div className="v4-how-head">
      <h2 id="v4-how-title" className="bl-display-l">как это работает</h2>
      <CampaignAction className="bl-btn bl-btn--dark">запустить сейчас <ArrowRight size={18}/></CampaignAction>
    </div>
    <ol className="v4-step-stack" ref={ref}>{STEPS.map((step, index) => <HowStep key={step.kind} step={step} index={index} progress={scrollYProgress}/>)}</ol>
  </section>
}

function Placements() {
  const [selected, setSelected] = useState(0)
  return <section id="where" className="bl-section bl-section--wide v4-placements">
    <div className="section-head"><h2 className="bl-display-l">где покажем</h2><p className="bl-body bl-secondary">В приложении билайна и на площадках партнёров</p></div>
    <div className="v4-placement-layout">
      <div className="v4-placement-controls">
        {SURFACES.map((surface, index) => <button key={surface.k} type="button" aria-pressed={selected === index} aria-controls="v4-placement-phone" className={`v4-placement-choice${selected === index ? ' is-selected' : ''}`} onClick={() => { if (selected !== index) analytics.event('v4_placement_select', { placement: surface.k }); setSelected(index) }}>
          <span className="v4-placement-number">0{index + 1}</span><span><span className="bl-h3">{surface.t}</span><span className="bl-body bl-secondary">{surface.d}</span></span><ArrowRight size={20}/>
        </button>)}
        <CampaignAction className="bl-btn bl-btn--dark">запустить сейчас <ArrowRight size={18}/></CampaignAction>
      </div>
      <div className="v4-placement-stage" id="v4-placement-phone">
        <span className="v4-placement-orbit" aria-hidden="true"/>
        <AppScreenshotPhone kind={SURFACES[selected].k}/>
        <div className="v4-placement-caption" aria-live="polite"><span><i className="v4-status-dot"/>{SURFACES[selected].t}</span><p>{SURFACES[selected].d}</p></div>
      </div>
    </div>
  </section>
}

function Final() {
  return <section id="v2-final" className="bl-section bl-section--wide v4-final" data-theme="invert">
    <div className="v4-final-copy"><h2 className="bl-display-l">привлекайте клиентов с билайном</h2>
      <CampaignAction className="bl-btn bl-btn--primary bl-btn--xl">запустить сейчас <ArrowRight size={22}/></CampaignAction>
      <p className="bl-caption bl-secondary">начните с данных компании</p>
    </div>
    <div className="v4-final-preview" aria-label="Пример кампании кофейни Зерно">
      <Creative o={creativeOf(DEMO_AD.brand, DEMO_AD.offer, DEMO_AD.img)} erid="реклама" wide/>
      <div className="v4-final-checks"><span><Check size={16}/> ваш бизнес</span><span><Check size={16}/> предложение</span><span><Check size={16}/> аудитория</span></div>
      <span className="bl-caption">пример вашей будущей кампании</span>
    </div>
  </section>
}

export default function LandingV4() {
  const start = useNavigate()
  const showCta = useHeaderCta()
  const reduce = useReducedMotion()
  const seen = useRef(new Set<string>())
  useEffect(() => {
    const names: Record<string, EventParams['section']> = { 'v2-hero': 'hero', how: 'how', where: 'where', 'v2-final': 'final' }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const section = names[entry.target.id] ?? 'metrics'
        if (entry.isIntersecting && !seen.current.has(section)) {
          seen.current.add(section)
          analytics.event('v4_section_view', { section })
        }
      }
    }, { rootMargin: '-20% 0px', threshold: 0 })
    document.querySelectorAll('.v4-content > section').forEach(section => observer.observe(section))
    return () => observer.disconnect()
  }, [])
  function navigate(id: string) {
    if (id === 'how' || id === 'where') analytics.event('v4_navigation_click', { target: id })
    const target = document.getElementById(id)
    target?.scrollIntoView({ behavior: reduce ? 'instant' : 'smooth', block: 'start' })
    target?.setAttribute('tabindex', '-1')
    target?.focus({ preventScroll: true })
  }
  return <div className="v3-v2-theme v4-theme" onClickCapture={event => {
    const target = event.target instanceof Element ? event.target : null
    if (!target?.closest('[data-campaign-start]')) return
    const section = target.closest('section')?.id
    const source = target.closest('header') ? 'header' : section === 'v2-hero' ? 'hero' : section === 'how' ? 'how' : section === 'where' ? 'where' : section === 'v2-final' ? 'final' : 'direct'
    analytics.event('v4_cta_click', { source })
  }}><LaunchContext.Provider value={() => start('/v4/create')}>
    <div className="bl-page wrap v2 v4">
      <a className="v2-skip-link" href="#v4-content" onClick={event => { event.preventDefault(); navigate('v4-content') }}>к содержимому</a>
      <header className="bl-header landing-head v2-head">
        <div className="bl-header__side"><Brand to="/v4"/></div>
        <nav className="bl-header__side bl-header__side--end" aria-label="Разделы лендинга">
          {NAV.map(([id, title]) => <button type="button" className="bl-hide-mobile bl-btn" key={id} onClick={() => navigate(id)}>{title}</button>)}
          <details className="v2-mobile-nav" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.removeAttribute('open'); event.currentTarget.querySelector('summary')?.focus() } }}><summary className="bl-btn">разделы</summary><div>{NAV.map(([id, title]) => <button key={id} type="button" className="bl-btn" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); navigate(id) }}>{title}</button>)}</div></details>
          {showCta && <CampaignAction className="bl-btn bl-btn--primary">запустить сейчас</CampaignAction>}
          <Link className="bl-btn bl-btn--dark" to="/login?from=v4" onClick={() => analytics.event('v4_navigation_click', { source: 'header', target: 'login' })}>войти</Link>
        </nav>
      </header>
      <main id="v4-content" tabIndex={-1} className="bl-stack v4-content">
        <Hero showPlaybackControl={false} phone={<AppScreenshotPhone kind="main"/>}/><SketchMetrics calm pulse/><HowItWorks/>
        {/* Временно скрыто: <Clients calm/> */}
        <Placements/>
        {/* Временно скрыто: <ForEveryone calm/> */}
        <Final/>
      </main>
      <footer className="footer bl-caption"><span>© 2026 партнёрская платформа билайна</span><span className="bl-row"><Link to="/v4/offer" onClick={() => analytics.event('v4_navigation_click', { source: 'footer', target: 'offer_document' })}>оферта</Link><Link to="/v4/privacy" onClick={() => analytics.event('v4_navigation_click', { source: 'footer', target: 'privacy_document' })}>обработка данных</Link><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Карта © OpenStreetMap</a></span></footer>
    </div>
  </LaunchContext.Provider></div>
}
