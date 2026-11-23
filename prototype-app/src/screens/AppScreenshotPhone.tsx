import { ArrowUpRight, Check, CreditCard, Gift, House, ScanBarcode, UserRound } from 'lucide-react'
import { Creative, creativeOf } from '../creative'
import { DEMO_AD, type Surface } from '../mock'
import { Phone } from '../vendor/stageshow/kit/phone'
import { Stage } from '../vendor/stageshow/kit/stage'
import './app-screenshot-phone.css'

const BACKGROUNDS = { main: 'main', showcase: 'showcase', paid: 'account' } as const
const coffeeOffer = creativeOf(DEMO_AD.brand, DEMO_AD.offer, DEMO_AD.img)

function PartnerAccountPreview({ animate }: { animate: boolean }) {
  return <div className="partner-account-preview" role="img" aria-label="Пример личного кабинета у партнёра. В разделе «Мои привилегии» кофейня «Зерно» предлагает скидку 20% на первую покупку.">
    <Stage width={428} height={900} unframed>{() =>
      <Phone width={428} frame="silver" wallpaper="white">
        <div className="partner-account" data-animate={animate}>
          <div className="partner-account-head">Личный кабинет <UserRound aria-hidden="true"/></div>
          <div className="partner-account-balance">
            <span>Бонусный баланс</span>
            <strong>1 240 <small>баллов</small></strong>
            <ScanBarcode aria-hidden="true"/>
          </div>
          <strong className="partner-account-title">Мои привилегии</strong>
          <div className="partner-account-offer">
            <Creative o={coffeeOffer} erid="реклама" wide/>
            <div className="partner-account-offer-name">Кофейня «Зерно»</div>
            <span className="partner-account-action">Получить предложение <ArrowUpRight size={20}/></span>
          </div>
          <div className="partner-account-tabs">
            <span><House/>Главная</span><span><CreditCard/>Карта</span><span><Gift/>Привилегии</span><span><UserRound/>Профиль</span>
          </div>
        </div>
      </Phone>
    }</Stage>
  </div>
}

// Only sanitized background plates are shipped; the offer stays live HTML.
export function AppScreenshotPhone({ kind, animate = false }: { kind: Surface; animate?: boolean }) {
  if (kind === 'rest') return <PartnerAccountPreview animate={animate}/>
  return <div className="app-shot-phone" role="img" aria-label={`Предложение кофейни «Зерно»: ${kind === 'showcase' ? 'подарки и акции в приложении билайна' : kind === 'paid' ? 'после оплаты' : 'главная приложения билайна'}`}>
    <div key={kind} className="app-shot-screen" data-animate={animate}>
      <img className="app-shot-background" src={`${import.meta.env.BASE_URL}img/app-clean/${BACKGROUNDS[kind]}.png`} alt="" width="591" height="1280" decoding="async"/>
      <div className={`app-shot-offer app-shot-offer--${kind}`}>
        {kind === 'paid' && <div className="app-shot-context"><Check size={15}/><span>платёж прошёл</span></div>}
        <Creative o={coffeeOffer} erid="реклама"/>
        <div className="app-shot-copy"><span className="app-shot-brand">{DEMO_AD.brand}</span></div>
        <span className="app-shot-cta">{kind === 'showcase' ? 'сохранить купон' : 'забрать предложение'}</span>
      </div>
    </div>
  </div>
}
