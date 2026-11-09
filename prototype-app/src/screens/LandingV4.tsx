import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { motion, useInView, useReducedMotion } from 'motion/react'
import { ArrowRight, Check } from 'lucide-react'
import { Brand } from '../ui'
import { Creative, creativeOf } from '../creative'
import { DEMO_AD } from '../mock'
import { AppScreenshotPhone } from './AppScreenshotPhone'
import { CampaignAction, Clients, ForEveryone, Hero, LaunchContext, SketchMetrics, SURFACES as BASE_SURFACES, useHeaderCta } from './LandingV2'
import { HowGraphic } from './HowGraphics'
import CampaignWizard from './CampaignWizard'
import './landing-v3.css'
import './landing-motion.css'
import './v3-v2-theme.css'
import './landing-v4.css'

const SURFACES = BASE_SURFACES.map(surface => surface.k === 'showcase' ? { ...surface, t: 'в разделе «подарки и акции»' } : surface)
const STEPS = [
  { kind: 'business', title: 'укажите ваш бизнес', text: 'Введите ИНН и телефон, проверьте сведения и добавьте точки, куда приглашать клиентов.' },
  { kind: 'offer', title: 'соберите оффер', text: 'Подготовьте предложение на основе данных бизнеса. Добавьте изображение, скидку или промокод.' },
  { kind: 'audience', title: 'выберите клиентов', text: 'Укажите, кому и в каких ситуациях показывать рекламу. От вашего района до всей страны.' },
  { kind: 'guests', title: 'встречайте новых гостей', text: 'Гости приходят за кофе и завтраком. Встречайте их с улыбкой и давайте повод вернуться.' },
] as const
const NAV = [['how', 'как это работает'], ['where', 'где покажем'], ['cases', 'для кого']] as const
const STEP_STATUS = [
  ['находим ваш бизнес…', 'точка добавлена'],
  ['собираем креатив…', 'креатив готов'],
  ['выбираем подходящих…', 'аудитория подобрана'],
  ['ждём первых гостей…', 'визит подтверждён'],
] as const

function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { amount: .35 })
  const reduce = useReducedMotion()
  const [tick, setTick] = useState(0)
  const [pageVisible, setPageVisible] = useState(!document.hidden)
  const selected = Math.floor(tick / 3)
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  useEffect(() => {
    if (!visible || !pageVisible || reduce) return
    const timer = setTimeout(() => setTick(value => (value + 1) % 12), tick % 3 === 2 ? 1500 : 800)
    return () => clearTimeout(timer)
  }, [visible, pageVisible, reduce, tick])
  return <section id="how" className="bl-section bl-section--wide v4-how">
    <div className="section-head"><h2 className="bl-display-l">как это работает</h2></div>
    <div className="v4-how-layout">
      <ol className="v4-step-list">
        {STEPS.map((step, index) => <li key={step.kind}>
          <button type="button" className={selected === index ? 'is-selected' : ''} aria-pressed={selected === index} aria-controls="v4-how-scene" onClick={() => {
            setTick(index * 3)
            if (matchMedia('(max-width: 767px)').matches) ref.current?.scrollIntoView({ behavior: reduce ? 'instant' : 'smooth', block: 'center' })
          }}>
            <span className="v4-step-number">0{index + 1}</span>
            <span><span className="bl-h3">{step.title}</span><span className="bl-body bl-secondary">{step.text}</span></span>
            <ArrowRight size={20} className="v4-step-arrow"/>
          </button>
        </li>)}
      </ol>
      <div className="v4-how-stage" ref={ref} id="v4-how-scene" role="img" aria-label={`Демонстрация: ${STEPS[selected].title}`}>
        <div className="v4-how-art">
        {STEPS.map((step, index) => <motion.div className="v4-how-scene" key={step.kind} aria-hidden="true" initial={false} animate={{ opacity: selected === index ? 1 : 0, y: selected === index ? 0 : 12 }} transition={{ duration: reduce ? 0 : .35 }}>
          <HowGraphic kind={step.kind} unified controlledPhase={index === selected ? tick % 3 : 2}/>
        </motion.div>)}
        </div>
        <div className={`v4-scene-status${reduce || tick % 3 === 2 ? ' is-done' : ''}`}>
          <span>{STEP_STATUS[selected][reduce || tick % 3 === 2 ? 1 : 0]}</span>
          <span className="v4-scene-status-icon"><Check size={16}/></span>
        </div>
        <div className="v4-scene-caption"><span>кофейня «Зерно»</span><span>0{selected + 1} / 04</span></div>
      </div>
    </div>
    <div className="v4-action-row"><CampaignAction className="bl-btn bl-btn--dark">запустить сейчас <ArrowRight size={18}/></CampaignAction><span className="bl-caption bl-secondary">начните с ИНН и телефона</span></div>
  </section>
}

function Placements() {
  const [selected, setSelected] = useState(0)
  return <section id="where" className="bl-section bl-section--wide v4-placements">
    <div className="section-head"><h2 className="bl-display-l">где покажем</h2><p className="bl-body bl-secondary">Показываем там, где решение ближе всего.</p></div>
    <div className="v4-placement-layout">
      <div className="v4-placement-controls">
        {SURFACES.map((surface, index) => <button key={surface.k} type="button" aria-pressed={selected === index} aria-controls="v4-placement-phone" className={`v4-placement-choice${selected === index ? ' is-selected' : ''}`} onClick={() => setSelected(index)}>
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
    <div className="v4-final-copy"><h2 className="bl-display-l">новый эффективный канал привлечения клиентов</h2>
      <CampaignAction className="bl-btn bl-btn--primary bl-btn--xl">запустить сейчас <ArrowRight size={22}/></CampaignAction>
      <p className="bl-caption bl-secondary">сначала — ваш бизнес и первая кампания</p>
    </div>
    <div className="v4-final-preview" aria-label="Пример кампании кофейни Зерно">
      <Creative o={creativeOf(DEMO_AD.brand, DEMO_AD.offer, DEMO_AD.img)} erid="реклама" wide/>
      <div className="v4-final-checks"><span><Check size={16}/> ваш бизнес</span><span><Check size={16}/> предложение</span><span><Check size={16}/> аудитория</span></div>
      <span className="bl-caption">пример вашей будущей кампании</span>
    </div>
  </section>
}

export default function LandingV4() {
  const [wizardOpen, setWizardOpen] = useState(false)
  const showCta = useHeaderCta()
  const reduce = useReducedMotion()
  function navigate(id: string) {
    const target = document.getElementById(id)
    target?.scrollIntoView({ behavior: reduce ? 'instant' : 'smooth', block: 'start' })
    target?.setAttribute('tabindex', '-1')
    target?.focus({ preventScroll: true })
  }
  return <div className="v3-v2-theme v4-theme"><LaunchContext.Provider value={() => setWizardOpen(true)}>
    <div className="bl-page wrap v2 v4">
      <a className="v2-skip-link" href="#v4-content" onClick={event => { event.preventDefault(); navigate('v4-content') }}>к содержимому</a>
      <header className="bl-header landing-head v2-head">
        <div className="bl-header__side"><Brand to="/v4"/></div>
        <nav className="bl-header__side bl-header__side--end" aria-label="Разделы лендинга">
          {NAV.map(([id, title]) => <button type="button" className="bl-hide-mobile bl-btn" key={id} onClick={() => navigate(id)}>{title}</button>)}
          <details className="v2-mobile-nav" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.removeAttribute('open'); event.currentTarget.querySelector('summary')?.focus() } }}><summary className="bl-btn">разделы</summary><div>{NAV.map(([id, title]) => <button key={id} type="button" className="bl-btn" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); navigate(id) }}>{title}</button>)}</div></details>
          {showCta && <CampaignAction className="bl-btn bl-btn--primary">запустить сейчас</CampaignAction>}
          <Link className="bl-btn bl-btn--dark" to="/login">войти</Link>
        </nav>
      </header>
      <main id="v4-content" tabIndex={-1} className="bl-stack v4-content">
        <Hero showPlaybackControl={false} phone={<AppScreenshotPhone kind="main"/>}/><SketchMetrics calm pulse/><HowItWorks/><Clients calm/><Placements/><ForEveryone calm/><Final/>
      </main>
      <footer className="footer bl-caption"><span>© 2026 рекламная платформа билайна</span><span className="bl-row"><Link to="/offer">оферта</Link><Link to="/offer">обработка данных</Link></span></footer>
    </div>
    <CampaignWizard open={wizardOpen} onClose={() => setWizardOpen(false)}/>
  </LaunchContext.Provider></div>
}
