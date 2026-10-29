import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, BadgeCheck, Bot, EyeOff, FileCheck2, MapPin, Pause, Play, Search, Sparkles, UserPlus, Wallet } from 'lucide-react'
import { Trend } from '../charts'
import { PhoneSurface, ReachMap } from '../mock'
import { Creative, creativeOf } from '../creative'
import { Brand, IdBadge, Num, Photo, Reveal } from '../ui'
import { OFFERS } from './Near'

/* Лендинг v2: порядок и подача блоков по мотивам shopify.com, всё из дизайн-системы.
   Hero со сменным словом и видео на фоне → где увидят → ИИ-поиск → один кабинет → вокруг точки →
   от малого до крупного → ИИ-помощник → интеграции → цифры и доверие → отзыв и бонус → три шага. */

const WORDS = ['рядом с домом', 'в день зарплаты', 'после переезда', 'по дороге на работу', 'когда кончился трафик']

function Rotator() {
  const [i, setI] = useState(0)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce) return
    const t = setInterval(() => setI(x => (x + 1) % WORDS.length), 2400)
    return () => clearInterval(t)
  }, [reduce])
  return (
    <span className="v2-rot" aria-live="off">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={i} initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '-100%', opacity: 0 }} transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}>
          {WORDS[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

// фон hero, как у Shopify: public/video/hero.mp4 и первый кадр hero.jpg. Нет файла — остаётся тёмный блок.
// Без звука и по кругу; при «уменьшить движение» не стартует сам. Кнопка паузы обязательна: движение дольше 5 секунд
function HeroVideo() {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)
  // автозапуск успевает раньше подписки на onPlay, поэтому стартуем с «играет»
  const [paused, setPaused] = useState(!!reduce)
  if (failed) return null
  const base = `${import.meta.env.BASE_URL}video/hero`
  return (
    <>
      <video ref={ref} className="v2-hero__video" src={`${base}.mp4`} poster={`${base}.jpg`} autoPlay={!reduce} muted loop playsInline preload="metadata" aria-hidden="true"
        onError={() => setFailed(true)} onPlay={() => setPaused(false)} onPause={() => setPaused(true)} />
      <button type="button" className="bl-icon-btn v2-hero__pause" onClick={() => { const v = ref.current!; if (v.paused) v.play(); else v.pause() }} aria-label={paused ? 'включить видео' : 'остановить видео'}>
        {paused ? <Play size={18} /> : <Pause size={18} />}
      </button>
    </>
  )
}

function Hero() {
  return (
    <section className="bl-section bl-section--wide v2-hero" data-theme="invert">
      <HeroVideo />
      <div className="v2-hero__text">
        <h1 className="bl-display-xl">пусть вас выбирают<br /><Rotator /></h1>
        <p className="bl-lead bl-secondary">Реклама для 45 млн абонентов билайна: в приложении, витрине «лучшее рядом» и после оплаты. Платите только за результат.</p>
        <div className="bl-row" style={{ ['--bl-gap' as string]: '20px' }}>
          <Link className="bl-btn bl-btn--primary bl-btn--xl" to="/login">узнать охват</Link>
          <Link className="bl-btn bl-btn--ghost" to="/near">как это видит абонент <ArrowRight size={18} /></Link>
        </div>
      </div>
    </section>
  )
}

function Everywhere() {
  const s = [
    { k: 'main' as const, t: 'главная приложения', d: 'первое, что видят утром' },
    { k: 'showcase' as const, t: 'лучшее рядом', d: 'витрина офферов у дома' },
    { k: 'paid' as const, t: 'после оплаты', d: 'в момент, когда деньги есть' },
    { k: 'rest' as const, t: 'остатки', d: 'гигабайты за визит к вам' },
  ]
  return (
    <section className="bl-section bl-section--wide">
      <div className="section-head">
        <h2 className="bl-display-l">вас увидят там,<br />где абонент проводит день</h2>
        <p className="bl-body bl-secondary" style={{ maxWidth: 360 }}>Четыре экрана в приложении, ТВ и пуши по согласию. Места подберём сами или выберите вручную.</p>
      </div>
      <div className="v2-phones">
        {s.map((x, i) => (
          <Reveal key={x.k} delay={i * 0.08} className="v2-phone">
            <PhoneSurface kind={x.k} compact />
            <b className="bl-h4">{x.t}</b>
            <span className="bl-caption">{x.d}</span>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function Chat() {
  const pick = ['kolos', 'schi'].map(id => OFFERS.find(o => o.id === id)!)
  return (
    <section className="bl-section bl-section--wide v2-split">
      <div className="bl-stack" style={{ ['--bl-gap' as string]: '20px' }}>
        <span className="bl-tag bl-tag--soft-violet" style={{ alignSelf: 'flex-start' }}><Sparkles size={14} /> новое</span>
        <h2 className="bl-display-l">ваш бизнес уже в&nbsp;чате</h2>
        <p className="bl-lead bl-secondary">Абонент спрашивает витрину словами: «где позавтракать рядом до 300 ₽». ИИ подбирает офферы и уточняет. Вам ничего настраивать не нужно.</p>
        <Link className="bl-btn" to="/near" style={{ alignSelf: 'flex-start' }}><Search size={18} /> спросить витрину</Link>
      </div>
      <div className="v2-chat" aria-label="Пример диалога в витрине">
        <Reveal className="v2-bubble v2-bubble--me">где позавтракать рядом до 300 ₽?</Reveal>
        <Reveal delay={0.2} className="v2-bubble"><Bot size={16} /> Нашёл два места в 5 минутах. Завтрак с кофе дешевле в «Колосе».</Reveal>
        <Reveal delay={0.35} className="v2-chat__cards">
          {pick.map(o => <Creative key={o.id} o={o} erid="реклама" />)}
        </Reveal>
        <Reveal delay={0.5} className="bl-row" ><span className="bl-chip">ближе</span><span className="bl-chip">с собой</span><span className="bl-chip">открыто сейчас</span></Reveal>
      </div>
    </section>
  )
}

function OneCabinet() {
  const week = [14, 22, 19, 31, 38, 35, 47].map((v, i) => ({ label: `${i + 1} день`, value: v }))
  return (
    <section className="bl-section bl-section--wide">
      <div className="section-head"><h2 className="bl-display-l">везде, где абонент.<br />из одного кабинета</h2></div>
      <div className="bl-grid v2-cards" style={{ ['--bl-cols' as string]: 3 }}>
        <Reveal className="bl-card">
          <h3 className="bl-h3">оффер за 5 минут</h3>
          <p className="bl-body bl-secondary">Дайте ссылку на сайт или Карты. ИИ напишет текст и соберёт креатив.</p>
          <div className="v2-card__ui"><span className="bl-input v2-fake-input">zerno-coffee.ru</span><Creative o={creativeOf('кофейня «Зерно»', '−20% до 10:00', 0)} erid="реклама" /></div>
        </Reveal>
        <Reveal delay={0.08} className="bl-card">
          <h3 className="bl-h3">всё в одном месте</h3>
          <p className="bl-body bl-secondary">Кампании, баланс, документы через ЭДО и статистика каждый день.</p>
          <div className="v2-card__ui"><span className="bl-caption">визиты за неделю</span><span className="bl-h2"><Num value={206} from={0} /></span><Trend label="Визиты по дням" data={week} fmt={v => `${v} визитов`} height={120} axis={false} /></div>
        </Reveal>
        <Reveal delay={0.16} className="bl-card">
          <h3 className="bl-h3">платите за результат</h3>
          <p className="bl-body bl-secondary">Клик, заявка, купон или подписка. Показы бесплатно.</p>
          <div className="v2-card__ui v2-models">
            {[['переход', '9 ₽'], ['заявка', '350 ₽'], ['купон', '12 %'], ['подписка', '20 %']].map(([t, v]) => <div key={t} className="v2-model"><span>{t}</span><b>{v}</b></div>)}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

const POINTS = [
  { id: 1, addr: 'Покровка, 12', x: 230, y: 250, active: true },
  { id: 2, addr: 'Плющиха, 22', x: 450, y: 170, active: true },
]
function AroundPoint() {
  const [n, setN] = useState(0)
  const reduce = useReducedMotion()
  useEffect(() => { if (reduce) return; const t = setInterval(() => setN(x => x + 1), 3000); return () => clearInterval(t) }, [reduce])
  return (
    <section className="bl-section bl-section--wide v2-split v2-split--map">
      <div className="v2-map">
        <ReachMap points={POINTS} />
        <AnimatePresence>
          <motion.div key={n} className="float-card v2-map__guest" style={{ left: `${18 + (n * 23) % 50}%`, top: `${12 + (n * 37) % 55}%` }}
            initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
            <span className="guest-dot"><UserPlus size={16} /></span>
            <span><b className="bl-medium">+1 гость</b><span className="bl-micro" style={{ display: 'block' }}>{['300 м', '650 м', '1 км'][n % 3]} от точки</span></span>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="bl-stack" style={{ ['--bl-gap' as string]: '20px' }}>
        <h2 className="bl-display-l">растите вокруг своей точки</h2>
        <p className="bl-lead bl-secondary">Покажем тем, кто живёт, работает или каждый день проезжает в километре от вас. Открыли вторую точку — добавьте второй круг.</p>
        <ul className="v2-list">
          <li><MapPin size={18} /> 12 400 подходящих людей в среднем рядом с одной точкой</li>
          <li><BadgeCheck size={18} /> визиты в точку видно через день-два</li>
        </ul>
      </div>
    </section>
  )
}

function ForEveryone() {
  const s = [
    { photo: 'case-coffee.jpg', label: 'Кофейня с гостями у стойки', t: 'начните за вечер', d: 'Кофейня «Зерно» запустилась за 10 минут и за месяц получила 280 гостей.', plan: 'автопилот', price: 'от 3 000 ₽' },
    { photo: 'case-auto.jpg', label: 'Автосервис, смена шин', t: 'растите без агентства', d: 'Сеть автосервисов из трёх точек сама настраивает сигналы и ставки.', plan: 'PRO', price: 'от 30 000 ₽' },
    { photo: 'case-dev.jpg', label: 'Офис продаж жилого комплекса', t: 'по-крупному', d: 'Застройщик запускает спецпроекты и медиаплан с персональным менеджером.', plan: 'медиаплан', price: 'по запросу' },
  ]
  return (
    <section className="bl-section bl-section--wide">
      <div className="section-head">
        <h2 className="bl-display-l">от кофейни до федеральной сети</h2>
        <Link className="bl-btn" to="/login">подобрать план <ArrowRight size={18} /></Link>
      </div>
      <div className="bl-grid" style={{ ['--bl-cols' as string]: 3 }}>
        {s.map((x, i) => (
          <Reveal key={x.t} delay={i * 0.08} as="article" className="v2-story">
            <Photo name={x.photo} label={x.label} ratio="4 / 3" />
            <h3 className="bl-h3">{x.t}</h3>
            <p className="bl-body bl-secondary">{x.d}</p>
            <div className="v2-story__plan"><span>{x.plan}</span><b>{x.price}</b></div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function Assistant() {
  return (
    <section className="bl-section bl-section--wide v2-split v2-assist">
      <div className="bl-stack" style={{ ['--bl-gap' as string]: '20px' }}>
        <h2 className="bl-display-l">помощник, который считает за вас</h2>
        <p className="bl-lead bl-secondary">ИИ в кабинете замечает просадки, предлагает ставку и пишет тексты. Решение всегда за вами.</p>
      </div>
      <div className="v2-chat v2-chat--white">
        <Reveal className="v2-bubble v2-bubble--me">почему вчера меньше заявок?</Reveal>
        <Reveal delay={0.2} className="v2-bubble"><Bot size={16} /> Шёл дождь, визиты в обед упали на 18 %. Поднять ставку с 12 до 15 часов на 2 ₽? Это около +9 гостей в неделю.</Reveal>
        <Reveal delay={0.35} className="bl-row"><span className="bl-btn bl-btn--dark bl-btn--s">поднять</span><span className="bl-btn bl-btn--s">оставить как есть</span></Reveal>
      </div>
    </section>
  )
}

function Integrations() {
  const items = ['ЭДО: Диадок и СБИС', 'заявки в amoCRM и Битрикс24', 'постбэк и сквозная аналитика', 'AppsFlyer и другие MMP', 'API для своих систем', 'оплата по СБП и счёту']
  return (
    <section className="bl-section bl-section--wide">
      <div className="section-head">
        <h2 className="bl-display-l">подключается к тому,<br />что у вас уже есть</h2>
        <p className="bl-body bl-secondary" style={{ maxWidth: 360 }}>Вход через бизнес-ID: компанию, точки и реквизиты узнаем сами.</p>
      </div>
      <div className="v2-ids">
        {([['gos', 'Госуслуги'], ['sber', 'СберБизнес ID'], ['alfa', 'Альфа ID для бизнеса']] as const).map(([id, t]) => <span key={id} className="v2-id"><IdBadge id={id} />{t}</span>)}
      </div>
      <div className="bl-row v2-integr">{items.map(t => <span key={t} className="bl-chip">{t}</span>)}</div>
    </section>
  )
}

function Trust() {
  const stats = [
    { v: 45, s: ' млн', t: 'абонентов билайна' },
    { v: 19, s: '', t: 'сигналов: место, событие, деньги, момент' },
    { v: 2, s: ' мин', t: 'на модерацию, ИИ проверяет до оплаты' },
  ]
  const trust = [
    { i: EyeOff, t: 'данные абонентов не уходят к вам', d: 'Вы видите результат, а не людей. Всё по закону о персональных данных.' },
    { i: FileCheck2, t: 'маркировка — наша забота', d: 'erid и отчёты в ОРД оформим сами.' },
    { i: Wallet, t: 'деньги под контролем', d: 'Лимит в день, возврат остатка на счёт.' },
  ]
  return (
    <section className="bl-section bl-section--wide v2-trust" data-theme="invert">
      <h2 className="bl-display-l">лучше места для рекламы<br />рядом с домом не найти</h2>
      <div className="bl-grid v2-stats" style={{ ['--bl-cols' as string]: 3 }}>
        {stats.map(x => <div key={x.t} className="v2-stat"><span className="v2-stat__v"><Num value={x.v} suffix={x.s} from={0} /></span><span className="bl-body bl-secondary">{x.t}</span></div>)}
      </div>
      <div className="bl-grid" style={{ ['--bl-cols' as string]: 3 }}>
        {trust.map(x => <div key={x.t} className="bl-stack" style={{ ['--bl-gap' as string]: '8px' }}><x.i size={24} /><b className="bl-h4">{x.t}</b><span className="bl-body bl-secondary">{x.d}</span></div>)}
      </div>
    </section>
  )
}

function Quote() {
  return (
    <section className="bl-section bl-section--wide v2-quote">
      <figure className="bl-stack" style={{ ['--bl-gap' as string]: '24px', margin: 0 }}>
        <blockquote className="bl-h1">«Раньше листовки у метро. Теперь новые гости приходят из соседних домов, и я вижу, сколько стоил каждый»</blockquote>
        <figcaption className="bl-row" style={{ ['--bl-gap' as string]: '16px' }}>
          <Photo name="quote-anna.jpg" label="Портрет владелицы кофейни" ratio="1 / 1" className="v2-quote__face" />
          <span className="bl-body bl-secondary">Анна, владелица кофейни «Зерно»<br />пример для прототипа</span>
        </figcaption>
      </figure>
      <div className="v2-bonus">
        {[['3 000 ₽', 'на баланс за первую кампанию'], ['0 ₽', 'за показы и подключение'], ['1 день', 'до первых гостей']].map(([v, t]) => (
          <div key={t} className="v2-bonus__row"><b className="bl-h2">{v}</b><span className="bl-body bl-secondary">{t}</span></div>
        ))}
      </div>
    </section>
  )
}

function Final() {
  const steps = [['введите ИНН или сайт', 'узнаем компанию и точки'], ['выберите, кому показать', 'или доверьтесь автопилоту'], ['пополните и запустите', 'СБП, оферта галочкой']]
  return (
    <section className="bl-section bl-section--wide v2-final" data-theme="invert">
      <div className="bl-stack" style={{ ['--bl-gap' as string]: '32px' }}>
        <h2 className="bl-display-l">запустите сегодня</h2>
        <ol className="v2-steps">
          {steps.map(([t, d], i) => <li key={t}><span className="v2-steps__n">0{i + 1}</span><span><b className="bl-h4">{t}</b><span className="bl-caption" style={{ display: 'block' }}>{d}</span></span></li>)}
        </ol>
        <div className="bl-row" style={{ ['--bl-gap' as string]: '20px' }}>
          <Link className="bl-btn bl-btn--primary bl-btn--xl" to="/login">узнать охват</Link>
          <Link className="bl-btn bl-btn--ghost" to="/inn">без входа: по ИНН <ArrowRight size={18} /></Link>
        </div>
      </div>
      <Photo name="cta.jpg" label="Владелец бизнеса у входа в своё заведение" ratio="4 / 3" className="v2-final__photo" />
    </section>
  )
}

export default function LandingV2() {
  return (
    <div className="bl-page wrap v2">
      <header className="bl-header landing-head">
        <div className="bl-header__side"><Brand to="/v2" /></div>
        <nav className="bl-header__side bl-header__side--end" aria-label="Разделы лендинга">
          <Link className="bl-hide-mobile bl-btn" to="/near">витрина</Link>
          <Link className="bl-hide-mobile bl-btn" to="/">версия 1</Link>
          <Link className="bl-btn bl-btn--dark" to="/login">войти</Link>
        </nav>
      </header>
      <main className="bl-stack" style={{ ['--bl-gap' as string]: '16px' }}>
        <Hero />
        <Everywhere />
        <Chat />
        <OneCabinet />
        <AroundPoint />
        <ForEveryone />
        <Assistant />
        <Integrations />
        <Trust />
        <Quote />
        <Final />
      </main>
      <footer className="footer bl-caption">
        <span>© 2026 рекламная платформа билайна</span>
        <span className="bl-row" style={{ ['--bl-gap' as string]: '24px' }}><Link to="/offer">оферта</Link><Link to="/offer">обработка данных</Link></span>
      </footer>
    </div>
  )
}
