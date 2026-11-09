import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, animate, motion, useInView, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform } from 'motion/react'
import { ArrowUpRight, Check, Coffee, Gift, MapPin, Pause, Play, RotateCcw, Users } from 'lucide-react'
import { Stage } from '../vendor/stageshow/kit/stage'
import { Phone } from '../vendor/stageshow/kit/phone'
import logoUrl from '../../../design-system/assets/beeline-logo.svg'
import { Creative, creativeOf } from '../creative'
import type { Surface } from '../mock'

export const settle = { type: 'spring' as const, stiffness: 310, damping: 34, mass: .8 }
export const glide = [.22, 1, .36, 1] as const

/** Keep the line's place while its value changes. Not used on actively typed text. */
export function MovingLabel({ children, className = '' }: { children: string; className?: string }) {
  const reduce = useReducedMotion()
  return <span className={`v3-moving-label ${className}`}><AnimatePresence initial={false} mode="popLayout"><motion.span key={children} initial={reduce ? false : { opacity: 0, y: 7, filter: 'blur(2px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, filter: 'blur(2px)' }} transition={{ duration: reduce ? 0 : .22, ease: glide }}>{children}</motion.span></AnimatePresence></span>
}

/** A single nine-second narrative. User playback owns intent; visibility only suspends it. */
export function HeroStory({ map }: { map: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { amount: .3 })
  const reduce = useReducedMotion()
  const progress = useMotionValue(reduce ? 1 : 0)
  const [playing, setPlaying] = useState(true)
  const [replayVersion, setReplayVersion] = useState(0)
  const [visible, setVisible] = useState(!document.hidden)
  const [beat, setBeat] = useState(reduce ? 3 : 0)
  useMotionValueEvent(progress, 'change', value => setBeat(value >= .999 ? 3 : value < .27 ? 0 : value < .62 ? 1 : 2))
  useEffect(() => {
    const visibility = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [])
  useEffect(() => {
    if (reduce) { progress.set(1); return }
    if (!playing || !inView || !visible || progress.get() >= 1) return
    const control = animate(progress, 1, { duration: (1 - progress.get()) * 9, ease: 'linear' })
    return () => control.stop()
  }, [playing, inView, visible, reduce, progress, replayVersion])
  const photoScale = useTransform(progress, [0, .2, .36, .76, 1], [1, 1, .86, .86, 1])
  const photoRotate = useTransform(progress, [0, .2, .36, .76, 1], [-5, -5, -8, -8, -5])
  const ticketY = useTransform(progress, [0, .14, .3, .65, .8, 1], [25, 25, -10, -10, 0, 0])
  const ticketOpacity = useTransform(progress, [0, .08, .22], [0, 0, 1])
  const path = useTransform(progress, [.28, .57], [0, 1])
  const guestOpacity = useTransform(progress, [.44, .55, .8, .92], [0, 1, 1, 0])
  const guestY = useTransform(progress, [.44, .56], [12, 0])
  const successOpacity = useTransform(progress, [.6, .7], [0, 1])
  const successY = useTransform(progress, [.6, .73], [18, 0])
  const checkDraw = useTransform(progress, [.69, .76], [0, 1])
  const replay = () => { progress.set(0); setPlaying(true); setReplayVersion(value => value + 1) }
  const labels = ['ваш бизнес', 'повод познакомиться', 'новый гость', 'нашли своих']
  return <div ref={ref} className="v3-hero-story" data-beat={beat}>
    <Stage width={600} height={520} compact={{ below: 500, width: 320, height: 470 }} className="v3-story-stage" tokens={{ '--ss-font': 'var(--font-primary)' }}>{() => <div className="v3-hero-art" aria-label="История: кофейня находит нового гостя по соседству">
      {map}
      <motion.div className="v3-hero-portrait" style={{ scale: photoScale, rotate: photoRotate }}>
        <picture><source srcSet={import.meta.env.BASE_URL + 'img/hero.avif'} type="image/avif" /><img src={import.meta.env.BASE_URL + 'img/hero.jpg'} alt="Владелица кофейни смотрит новые заявки на телефоне" fetchPriority="high" width="1066" height="1600" /></picture>
        <span className="v3-portrait-caption"><Coffee size={18} /> кофейня «Зерно»<span>Москва</span></span>
      </motion.div>
      <svg className="v3-story-route" viewBox="0 0 500 500" preserveAspectRatio="none" aria-hidden="true"><motion.path d="M421 320 C480 300 490 150 405 130" fill="none" stroke="var(--v3-accent)" strokeWidth="3" strokeLinecap="round" style={{ pathLength: path, opacity: guestOpacity }} /></svg>
      <motion.div className="v3-story-neighbour" style={{ opacity: guestOpacity, y: guestY }} aria-hidden="true"><span><Users size={23} strokeWidth={1.5} /></span><div><span>любит кофе</span><small>живёт по соседству</small></div></motion.div>
      <motion.div className="v3-hero-ticket" style={{ y: ticketY, opacity: ticketOpacity, rotate: 0 }} aria-hidden="true"><div><span>повод заглянуть</span><ArrowUpRight size={21} /></div><strong>−20%</strong><p>на ваш первый<br />завтрак с кофе</p><span className="v3-ticket-bottom"><MapPin size={14} /> всего 300 м от вас</span></motion.div>
      <motion.div className="v3-hero-match" style={{ opacity: successOpacity, y: successY }} aria-hidden="true"><span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><motion.path d="m20 6-11 11-5-5" style={{ pathLength: checkDraw }} /></svg></span><div><span>нашли своих</span><small>гости из соседнего дома</small></div></motion.div>
    </div>}</Stage>
    <div className="v3-story-controls">
      <span className="v3-story-caption"><span className="v3-story-index">0{Math.min(beat + 1, 3)}</span><MovingLabel>{labels[beat]}</MovingLabel></span>
      <div className="v3-story-track" aria-hidden="true"><motion.span style={{ scaleX: progress }} /></div>
      <button type="button" aria-label={beat === 3 ? 'Повторить историю' : playing ? 'Приостановить историю' : 'Продолжить историю'} onClick={beat === 3 ? replay : () => setPlaying(value => !value)} disabled={!!reduce}><AnimatePresence mode="popLayout" initial={false}><motion.span key={beat === 3 ? 'replay' : String(playing)} initial={{ opacity: 0, rotate: -30 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 30 }} transition={{ duration: .15 }}>{beat === 3 ? <RotateCcw size={15} /> : playing ? <Pause size={15} /> : <Play size={15} />}</motion.span></AnimatePresence></button>
    </div>
  </div>
}

const phoneTop: Record<Surface, number> = { main: 205, showcase: 126, paid: 310, rest: 336 }
const imageHeight: Record<Surface, number> = { main: 182, showcase: 220, paid: 180, rest: 145 }
const titles: Record<Surface, string> = { main: 'билайн', showcase: 'лучшее рядом', paid: 'платёж прошёл', rest: 'ваши остатки' }

/** Adapted from Stageshow phone-touch: keep the device and focal card mounted.
 * The real phone geometry is vendored; the app is our existing creative system.
 * Mid-flight switches retarget the same spring instead of replaying an entrance.
 */
export function PlacementPhone({ kind }: { kind: Surface }) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(296)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(220, Math.min(296, entry.contentRect.width - 32))))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const spring = reduce ? { duration: 0 } : settle
  return <div className="v3-phone-stage" ref={ref} aria-hidden="true">
    <Phone width={width} frame="pro" wallpaper="#f2f1ec" className="v3-device">
      <div className="v3-phone-app">
        <div className="v3-phone-app__title"><MovingLabel>{titles[kind]}</MovingLabel><img className="v3-app-brand" src={logoUrl} alt="" width="30" height="30" /></div>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div className="v3-phone-context" key={kind} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: reduce ? 0 : .22 }}>
            {kind === 'main' && <><div className="v3-phone-balance"><span>баланс</span><b>760 ₽</b><span>всё под контролем</span></div><div className="v3-phone-pills"><span>мой тариф</span><span>услуги</span></div></>}
            {kind === 'showcase' && <><p>приятные открытия по соседству</p><div className="v3-phone-pills"><span className="is-active">рядом</span><span>еда</span><span>покупки</span></div></>}
            {kind === 'paid' && <div className="v3-phone-payment"><span><Check size={30} /></span><b>+500 ₽</b><p>уже на вашем балансе</p></div>}
            {kind === 'rest' && <div className="v3-phone-meters"><div><span>интернет</span><b>0,4 ГБ</b><i><span style={{ width: '12%' }} /></i></div><div><span>минуты</span><b>210</b><i><span style={{ width: '62%' }} /></i></div></div>}
          </motion.div>
        </AnimatePresence>
        <motion.div className={`v3-phone-offer pm-card${kind === 'rest' ? ' pm-card--reward' : ''}`} animate={{ top: phoneTop[kind] }} transition={spring} data-kind={kind}>
          <motion.div className="v3-phone-offer__image" animate={{ height: imageHeight[kind] }} transition={spring}><Creative o={creativeOf('кофейня «Зерно»', '−20% до 10:00', 0)} erid="реклама" wide /></motion.div>
          <div className="v3-phone-offer__copy"><span>кофейня «Зерно» · 300 м от вас</span><b><MovingLabel>{kind === 'rest' ? 'кофе и гигабайты в подарок' : 'ваш завтрак со скидкой 20%'}</MovingLabel></b><span className="v3-phone-offer__cta"><MovingLabel>{kind === 'rest' ? 'получить +1 ГБ' : 'сохранить предложение'}</MovingLabel>{kind === 'rest' ? <Gift size={18} /> : <ArrowUpRight size={18} />}</span></div>
        </motion.div>
        <motion.div className="v3-phone-discover" initial={false} animate={{ opacity: kind === 'main' || kind === 'showcase' ? 1 : 0 }} transition={{ duration: reduce ? 0 : .18 }}><MapPin size={25} strokeWidth={1.5} /><span>ещё больше рядом<small>открывайте новые места</small></span></motion.div>
        <div className="v3-phone-bottom"><span>главная</span><span>финансы</span><span>для вас</span></div>
      </div>
    </Phone>
  </div>
}
