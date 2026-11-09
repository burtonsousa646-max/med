import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'motion/react'
import { Bot, Check, Coffee, LayoutTemplate, MapPin, ScanLine, Users } from 'lucide-react'
import { Stage } from '../vendor/stageshow/kit/stage'
import { Creative, creativeOf } from '../creative'
import { DEMO_AD, ReachMap } from '../mock'
import { Chip } from '../ui'
import { MovingLabel } from './LandingMotion'
import './how-graphics.css'

const offer = { ...creativeOf('кофейня «Зерно»', '1 + 1', 0), tone: 'green' as const, big: '1 + 1', small: 'второй кофе в подарок' }
const point = [{ id: 1, addr: 'Покровка, 12', x: 310, y: 220, active: true }]

function Processing({ done, reduce }: { done: boolean; reduce: boolean | null }) {
  return <span className={`ui-processing${done?' is-done':''}`}><motion.span className="ui-marker-glyph" initial={false} animate={{opacity:done?1:0,scale:done?1:.6}} transition={{duration:reduce?0:.22}}><Check size={12}/></motion.span></span>
}

// Dark-bento framing: a cropped native product surface with one foreground payoff.
export function HowGraphic({ kind, unified = false, controlledPhase }: { kind: 'business' | 'offer' | 'audience' | 'guests'; unified?: boolean; controlledPhase?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useInView(ref, { once: true, amount: .55 })
  const reduce = useReducedMotion()
  const [localPhase, setPhase] = useState(reduce ? 2 : 0)
  const phase = reduce ? 2 : controlledPhase ?? localPhase
  useEffect(() => {
    if (controlledPhase !== undefined) return
    if (reduce) { setPhase(2); return }
    if (!seen) return
    const choosing = setTimeout(() => setPhase(1), 800)
    const done = setTimeout(() => setPhase(2), 2300)
    return () => { clearTimeout(choosing); clearTimeout(done) }
  }, [seen, reduce, controlledPhase])
  const done = phase === 2
  return <div ref={ref} className="v2-how-graphic" data-scene={kind} data-phase={phase} aria-hidden="true" inert>
    <Stage width={480} height={360} compact={{ below: 400, width: 300, height: 300 }} theme="dark" play="once" className="v2-how-ui-stage" tokens={{ '--ss-font': 'var(--font-primary)' }}>{() => <div className={`ui-scene ui-scene--${kind}`}>
      {kind === 'business' && <>
        <div className="v2-window ui-window ui-business-window">
          <div className="ui-title"><MapPin size={18}/><span>ваш бизнес</span></div>
          <div className="ui-business-details"><span className="ui-label">название</span><div className="bl-input ui-input">кофейня «Зерно»<motion.span animate={{opacity:phase>=1?1:0,scale:phase>=1?1:.7}} transition={{duration:reduce?0:.25}}><Check size={18}/></motion.span></div><span className="ui-point-address"><MapPin size={15}/>Покровка, 12</span></div>
          <div className="ui-business-map"><ReachMap points={point} animateDots={false}/></div>
        </div>
        <div className="ui-status"><span className="ui-status-icon"><MapPin size={18}/></span><MovingLabel>{done ? 'точка добавлена' : 'находим ваш бизнес…'}</MovingLabel><Processing done={done} reduce={reduce}/></div>
      </>}
      {kind === 'offer' && <>
        <motion.div className="ui-editor" initial={reduce?false:{y:10}} animate={{y:seen||reduce?0:10}} transition={{duration:reduce?0:.5,ease:[.22,1,.36,1]}}>
          <span className="ui-editor-label"><LayoutTemplate size={14}/>креатив</span>
          <div className="ui-editor-selection"><Creative o={unified ? creativeOf(DEMO_AD.brand, DEMO_AD.offer, DEMO_AD.img) : offer} erid="реклама"/><span className="ui-handle ui-handle--tl"/><span className="ui-handle ui-handle--tr"/><span className="ui-handle ui-handle--bl"/><span className="ui-handle ui-handle--br"/></div>
        </motion.div>
        <div className="ui-status ui-status--editor"><span className="ui-status-icon"><Bot size={18}/></span><MovingLabel>{done ? 'креатив готов' : 'проверяем маркировку…'}</MovingLabel><Processing done={done} reduce={reduce}/></div>
      </>}
      {kind === 'audience' && <>
        <div className="v2-window ui-window ui-audience-window">
          <div className="ui-title"><Users size={18}/><span>кому покажем</span></div>
          <div className="ui-targeting"><span className="ui-label">геолокация</span><div className="ui-chip-row"><Chip on={phase>=1}>рядом с точкой</Chip><Chip>весь город</Chip></div><span className="ui-label">интересы</span><div className="ui-chip-row"><Chip on={done}><Coffee size={15}/> любят кофе</Chip></div></div>
          <svg className="ui-audience-dots" viewBox="0 0 320 92" aria-hidden="true">{Array.from({length:80},(_,i)=><motion.circle key={i} cx={16+i%20*15} cy={16+Math.floor(i/20)*20} r={i%7===0?3.5:2.5} initial={false} animate={{fill:done&&i%7===0?'#ffc800':'#718093',opacity:done&&i%7!==0?.35:.85}} transition={{duration:reduce?0:.4,delay:reduce?0:i%7*.025}}/>)}</svg>
        </div>
        <div className="ui-status"><span className="ui-status-icon"><Users size={18}/></span><MovingLabel>{done ? 'аудитория подобрана' : 'выбираем подходящих…'}</MovingLabel><Processing done={done} reduce={reduce}/></div>
      </>}
      {kind === 'guests' && <>
        <div className="v2-window ui-window ui-results-window">
          <div className="ui-title"><Coffee size={18}/><span>кофейня «Зерно»</span><span className="ui-live-dot"/></div>
          <div className="ui-results-count"><span className="ui-label">новые гости</span><div className="ui-results-number"><MovingLabel>{String(phase)}</MovingLabel><span>в кофейне</span></div></div>
          <div className="ui-redemption"><span className="ui-redemption-code"><ScanLine size={24}/></span><div><span>{unified ? DEMO_AD.offer : "кофе и завтрак"}</span><small>{unified ? "кофейня «Зерно»" : "промокод ПРИВЕТ"}</small></div><motion.span animate={{opacity:done?1:.25}}><Check size={18}/></motion.span></div>
        </div>
        <div className="ui-status"><span className="ui-status-icon"><Check size={18}/></span><MovingLabel>{done ? 'визит подтверждён' : 'ждём первых гостей…'}</MovingLabel><Processing done={done} reduce={reduce}/></div>
      </>}
    </div>}</Stage>
  </div>
}
