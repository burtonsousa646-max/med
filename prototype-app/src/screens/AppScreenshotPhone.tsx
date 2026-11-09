import { useId } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, Gift } from 'lucide-react'
import { Creative, creativeOf } from '../creative'
import { DEMO_AD, type Surface } from '../mock'
import './app-screenshot-phone.css'

const BACKGROUNDS = { main: 'main', showcase: 'showcase', paid: 'account', rest: 'account' } as const

// Only sanitized background plates are shipped; the offer stays live HTML.
export function AppScreenshotPhone({ kind }: { kind: Surface }) {
  const reduce = useReducedMotion()
  const id = useId()
  return <div className="app-shot-phone" role="img" aria-label={`Предложение кофейни «Зерно» в приложении билайна: ${kind === 'showcase' ? 'подарки и акции' : kind === 'paid' ? 'после оплаты' : kind === 'rest' ? 'гигабайты за визит' : 'главная'}`}>
    <img className="app-shot-background" src={`${import.meta.env.BASE_URL}img/app-clean/${BACKGROUNDS[kind]}.png`} alt="" width="591" height="1280" decoding="async"/>
    <motion.div className={`app-shot-offer app-shot-offer--${kind}`} layoutId={id} layout transition={{ duration: reduce ? 0 : .4, ease: [.22, 1, .36, 1] }}>
      {kind === 'paid' && <div className="app-shot-context"><Check size={15}/><span>платёж прошёл</span></div>}
      {kind === 'rest' && <div className="app-shot-context"><Gift size={15}/><span>+1 ГБ за визит</span></div>}
      <Creative o={creativeOf(DEMO_AD.brand, DEMO_AD.offer, DEMO_AD.img)} erid="реклама"/>
      <div className="app-shot-copy"><span className="app-shot-brand">{DEMO_AD.brand}</span></div>
      <span className="app-shot-cta">{kind === 'showcase' ? 'сохранить купон' : 'забрать предложение'}</span>
    </motion.div>
  </div>
}
