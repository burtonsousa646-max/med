import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, animate, motion, useAnimationFrame, useInView, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react'
import { ArrowRight, BadgeCheck, BellRing, Bot, Check, EyeOff, FileCheck2, Globe, LayoutTemplate, MapPin, Pause, Play, Search, Smartphone, Sparkles, Tv, UserPlus, Wallet } from 'lucide-react'
import { PhoneSurface, ReachMap } from '../mock'
import { Creative, creativeOf, type CreativeData } from '../creative'
import { Brand, IdBadge, Num, Photo, Reveal } from '../ui'
import { OFFERS } from './Near'
import { PartnerLogo } from './Landing'
import logoUrl from '../../../design-system/assets/beeline-logo.svg'

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

/* «будьте везде» по мотивам блока Shopify. Карточка под курсором раскрывается на 2/4 ширины;
   активная показывает свой сценарий: ИИ правит креатив, орбита кабинета выводит раздел наверх, каналы съезжают в центр.
   Всё стоит, пока блок вне экрана или включено «уменьшить движение». */
type Cr = CreativeData & { say: string }
const BASE = creativeOf('кофейня «Зерно»', '−20% до 10:00', 0)
const EDITS: Cr[] = [
  { ...BASE, say: 'делаю условие крупнее…' },
  { ...BASE, tone: 'violet', say: 'меняю фон под бренд…' },
  { ...BASE, tone: 'violet', big: '1 + 1', small: 'второй кофе в подарок', say: 'пробую другое условие…' },
  { ...BASE, tone: 'green', big: '1 + 1', small: 'второй кофе в подарок', say: 'проверяю маркировку…' }, // светлый тон не берём: в тёмной секции текст креатива станет белым
]
function Builder({ run }: { run: boolean }) {
  const [i, setI] = useState(0)
  useEffect(() => { if (!run) return; const t = setInterval(() => setI(x => (x + 1) % EDITS.length), 2400); return () => clearInterval(t) }, [run])
  const e = EDITS[i]
  return (
    <div className="v2-builder" aria-hidden="true">
      <span className="v2-builder__label"><LayoutTemplate size={14} /> креатив</span>
      <div className="v2-builder__clip">
      <AnimatePresence initial={false}>
        <motion.div key={i} className="v2-builder__cr" initial={{ opacity: 0, filter: 'blur(8px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
          <Creative o={e} erid="реклама" wide />
        </motion.div>
      </AnimatePresence>
      {run && <motion.span key={`s${i}`} className="v2-builder__sweep" initial={{ x: '-100%' }} animate={{ x: '120%' }} transition={{ duration: 1.1, ease: 'easeInOut' }} />}
      </div>
      <div className="v2-builder__ai">
        <Bot size={18} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>{e.say}</motion.span>
        </AnimatePresence>
        <span className="v2-builder__stop" />
      </div>
    </div>
  )
}

// разделы кабинета на орбите и экран, который появляется в центре, когда раздел наверху
const HUB: { t: string; ui: ReactNode }[] = [
  { t: 'кампании', ui: <><b>2 кампании идут</b><span className="v2-mini__row"><span>кофейня у дома</span><span className="bl-tag bl-tag--soft-green">идёт</span></span><span className="v2-mini__row"><span>завтраки −20%</span><span className="bl-tag bl-tag--soft-green">идёт</span></span></> },
  { t: 'статистика', ui: <><span className="bl-caption">визиты за неделю</span><b className="bl-h2">206</b><span className="v2-mini__bars">{[30, 45, 40, 62, 75, 70, 95].map((h, n) => <i key={n} style={{ height: `${h}%` }} />)}</span></> },
  { t: 'баланс', ui: <><span className="bl-caption">на балансе</span><b className="bl-h2">12 400 ₽</b><span className="bl-caption">хватит на 9 дней</span></> },
  { t: 'заявки', ui: <><b>+3 новые заявки</b><span className="v2-mini__row"><span>Мария, 10:42</span><span>перезвонить</span></span><span className="v2-mini__row"><span>Олег, 11:05</span><span>перезвонить</span></span></> },
  { t: 'документы и ЭДО', ui: <><b>акт за октябрь</b><span className="v2-mini__row"><span>Диадок</span><span className="bl-tag bl-tag--soft-green">подписан</span></span></> },
  { t: 'модерация', ui: <><span className="v2-mini__ok"><Check size={18} strokeWidth={3} /></span><b>проверено ИИ</b><span className="bl-caption">за 2 минуты</span></> },
]
const STEP = 360 / HUB.length
function HubPill({ spin, k, on }: { spin: MotionValue<number>; k: number; on: boolean }) {
  const a = k * STEP
  const rotate = useTransform(spin, s => -s - a) // подпись остаётся горизонтальной
  return (
    <span className="v2-orbit__slot" style={{ transform: `rotate(${a}deg) translateY(calc(-1 * var(--r)))` }}>
      <motion.span className={`v2-orbit__pill${on ? ' is-on' : ''}`} style={{ rotate }}>{HUB[k].t}</motion.span>
    </span>
  )
}
function Hub({ active, run }: { active: boolean; run: boolean }) {
  const spin = useMotionValue(0)
  const [pick, setPick] = useState<number | null>(null)
  useAnimationFrame((_, dt) => { if (run && !active) spin.set(spin.get() + dt * 0.008) })
  useEffect(() => {
    if (!active || !run) { setPick(null); return }
    const next = () => {
      const to = Math.round(spin.get() / STEP) * STEP - STEP // следующий раздел встаёт наверх
      animate(spin, to, { duration: 0.7, ease: [0.2, 0.7, 0.2, 1] })
      setPick(((-to / STEP) % HUB.length + HUB.length) % HUB.length)
    }
    next()
    const t = setInterval(next, 2600)
    return () => clearInterval(t)
  }, [active, run])
  return (
    <div className="v2-orbit" aria-hidden="true">
      {[100, 160, 240, 330].map(r => <span key={r} className="v2-orbit__circle" style={{ width: r * 2, height: r * 2 }} />)}
      <AnimatePresence mode="wait" initial={false}>
        {pick === null
          ? <motion.span key="logo" className="v2-orbit__hub" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}><img src={logoUrl} alt="" width={64} height={64} /></motion.span>
          : <motion.span key={pick} className="v2-mini" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }}>{HUB[pick].ui}</motion.span>}
      </AnimatePresence>
      <motion.span className="v2-orbit__ring" style={{ rotate: spin }}>
        {HUB.map((h, k) => <HubPill key={h.t} spin={spin} k={k} on={pick === k} />)}
      </motion.span>
    </div>
  )
}

// каналы летают по двум кругам вокруг знака билайна; в активной карточке центр орбиты съезжает внутрь
const CHANNELS: { k: string; i: ReactNode; r: 0 | 1; a: number }[] = [
  { k: 'app', i: <Smartphone size={30} />, r: 0, a: 0 }, { k: 'near', i: <MapPin size={30} />, r: 0, a: 90 },
  { k: 'tv', i: <Tv size={30} />, r: 0, a: 180 }, { k: 'push', i: <BellRing size={30} />, r: 0, a: 270 },
  { k: 'avito', i: <PartnerLogo id="avito" />, r: 1, a: 45 }, { k: 'alfabank', i: <PartnerLogo id="alfabank" />, r: 1, a: 135 },
  { k: 'tbank', i: <PartnerLogo id="tbank" />, r: 1, a: 225 }, { k: 'web', i: <Globe size={30} />, r: 1, a: 315 },
]
const RADII = [150, 260]
function ChannelTile({ spin, c }: { spin: MotionValue<number>; c: (typeof CHANNELS)[number] }) {
  const deg = useTransform(spin, s => (c.a + s * (c.r ? 0.7 : 1)) * Math.PI / 180) // внешний круг медленнее
  const x = useTransform(deg, d => Math.cos(d) * RADII[c.r])
  const y = useTransform(deg, d => Math.sin(d) * RADII[c.r])
  return <motion.span className="v2-tile" style={{ x, y }}>{c.i}</motion.span>
}
function Channels({ active, run }: { active: boolean; run: boolean }) {
  const spin = useMotionValue(-30)
  useAnimationFrame((_, dt) => { if (run) spin.set(spin.get() + dt * (active ? 0.012 : 0.006)) })
  return (
    <div className={`v2-orbit v2-channels${active ? ' is-active' : ''}`} aria-hidden="true">
      <div className="v2-channels__center">
        <svg className="v2-channels__rings" viewBox="-300 -300 600 600">{RADII.map(r => <circle key={r} r={r} />)}</svg>
        <span className="v2-orbit__hub v2-channels__hub"><img src={logoUrl} alt="" width={48} height={48} /></span>
        {CHANNELS.map(c => <ChannelTile key={c.k} spin={spin} c={c} />)}
      </div>
    </div>
  )
}

function Anywhere() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const run = useInView(ref) && !reduce
  const [active, setActive] = useState(0)
  // карточки друг под другом (планшет, телефон): наводить нечего, сценарии идут во всех сразу
  const [stacked, setStacked] = useState(() => matchMedia('(max-width: 1023px)').matches)
  useEffect(() => {
    const m = matchMedia('(max-width: 1023px)'), f = () => setStacked(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  const items = [
    { ui: (on: boolean) => <Builder run={run && on} />, t: 'оффер, собранный для продаж', d: <><Link to="/login">Соберите оффер</Link> по ссылке на сайт или Карты с помощью ИИ. Или из готовых шаблонов.</> },
    { ui: (on: boolean) => <Hub active={on} run={run} />, t: 'управляйте всем из одного места', d: <><Link to="/cab/campaigns">Кампании</Link>, <Link to="/cab/balance">баланс</Link>, <Link to="/cab/docs">документы</Link>. Платите за клик, заявку, купон или подписку.</> },
    { ui: (on: boolean) => <Channels active={on} run={run} />, t: 'показывайте во всех каналах', d: <>Приложение билайна, <Link to="/near">витрина «лучшее рядом»</Link>, ТВ и пуши. И у партнёров: Авито, Альфа-Банк, Т-Банк.</> },
  ]
  return (
    <section className="bl-section bl-section--wide v2-anywhere" data-theme="invert">
      <h2 className="bl-display-l">будьте везде.<br />не выходя из кабинета</h2>
      <div ref={ref} className="v2-any" style={{ ['--any-cols' as string]: items.map((_, i) => `minmax(0, ${i === active ? 2 : 1}fr)`).join(' ') }}>
        {items.map((x, i) => (
          <article key={x.t} className={`v2-any__item${i === active ? ' is-active' : ''}`} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)}>
            <div className="v2-any__card">{x.ui(stacked || i === active)}</div>
            <h3 className="bl-h3">{x.t}</h3>
            <p className="bl-body bl-secondary">{x.d}</p>
          </article>
        ))}
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
        <Anywhere />
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
