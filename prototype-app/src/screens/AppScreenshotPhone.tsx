import { Check, Store } from 'lucide-react'
import { Creative, creativeOf } from '../creative'
import { DEMO_AD, type Surface } from '../mock'
import './app-screenshot-phone.css'

const BACKGROUNDS = { main: 'main', showcase: 'showcase', paid: 'account', rest: 'account' } as const

// Only sanitized background plates are shipped; the offer stays live HTML.
export function AppScreenshotPhone({ kind, animate = false }: { kind: Surface; animate?: boolean }) {
  return <div className="app-shot-phone" role="img" aria-label={`Предложение кофейни «Зерно»: ${kind === 'showcase' ? 'подарки и акции в приложении билайна' : kind === 'paid' ? 'после оплаты' : kind === 'rest' ? 'витрина партнёра' : 'главная приложения билайна'}`}>
    <div key={kind} className="app-shot-screen" data-animate={animate}>
      <img className="app-shot-background" src={`${import.meta.env.BASE_URL}img/app-clean/${BACKGROUNDS[kind]}.png`} alt="" width="591" height="1280" decoding="async"/>
      <div className={`app-shot-offer app-shot-offer--${kind}`}>
        {kind === 'paid' && <div className="app-shot-context"><Check size={15}/><span>платёж прошёл</span></div>}
        {kind === 'rest' && <div className="app-shot-context"><Store size={15}/><span>витрина партнёра</span></div>}
        <Creative o={creativeOf(DEMO_AD.brand, DEMO_AD.offer, DEMO_AD.img)} erid="реклама"/>
        <div className="app-shot-copy"><span className="app-shot-brand">{DEMO_AD.brand}</span></div>
        <span className="app-shot-cta">{kind === 'showcase' ? 'сохранить купон' : 'забрать предложение'}</span>
      </div>
    </div>
  </div>
}
