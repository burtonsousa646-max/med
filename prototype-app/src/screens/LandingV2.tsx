import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, animate, motion, useAnimationFrame, useInView, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react'
import { ArrowRight, BellRing, Bot, Check, EyeOff, FileCheck2, Globe, LayoutTemplate, MapPin, Pause, Play, Smartphone, Sparkles, Tv, UserPlus, Wallet } from 'lucide-react'
import { PhoneSurface, ReachMap } from '../mock'
import { Creative, creativeOf, type CreativeData } from '../creative'
import { Brand, Chip, Num, PartnerLogo, Photo, Reveal, Segmented } from '../ui'
import { OFFERS } from './Near'
import { NICHES, n, rub } from '../data'
import logoUrl from '../../../design-system/assets/beeline-logo.svg'

/* Лендинг v2: подача и анимации по мотивам shopify.com, всё из дизайн-системы.
   Порядок — вопросы владельца бизнеса: что это (hero) → кто уже с нами → какая аудитория → кому покажем → где увидят → и в чате →
   сколько стоит → как запустить и управлять → помощник → истории → отзыв → вопросы → запуск. */

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
    <section id="v2-hero" className="bl-section bl-section--wide v2-hero" data-theme="invert">
      <HeroVideo />
      <div className="v2-hero__text">
        <h1 className="bl-display-xl">пусть вас выбирают<br /><Rotator /></h1>
        <p className="bl-lead bl-secondary">Покажем вашу акцию абонентам билайна, которые живут или бывают рядом, — в приложении и в момент, когда им это нужно. Показы бесплатно: платите за переходы, заявки или продажи.</p>
        <div className="bl-row" style={{ ['--bl-gap' as string]: '20px' }}>
          <Link className="bl-btn bl-btn--primary bl-btn--xl" to="/login">узнать охват</Link>
        </div>
      </div>
      {/* так абонент увидит вашу акцию — вместо ссылки на витрину */}
      <motion.div className="v2-hero__phone" aria-hidden="true" initial={{ opacity: 0, y: 40, rotate: 4 }} animate={{ opacity: 1, y: 0, rotate: -3 }} transition={{ delay: 0.3, duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }}>
        <PhoneSurface kind="main" />
      </motion.div>
    </section>
  )
}

// автосмена шагов, как вкладки у Shopify: идёт, пока блок на экране и курсор не над ним; клик выбирает шаг и сбрасывает таймер
function useAuto(len: number, ms: number) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { amount: 0.4 })
  const reduce = useReducedMotion()
  const [i, pick] = useState(0)
  const [hold, setHold] = useState(false)
  const run = inView && !reduce && !hold
  useEffect(() => { if (!run) return; const t = setTimeout(() => pick(x => (x + 1) % len), ms); return () => clearTimeout(t) }, [run, i, len, ms])
  return { ref, i, pick, run, hover: { onMouseEnter: () => setHold(true), onMouseLeave: () => setHold(false) } }
}
// полоска прогресса под активным шагом, длиной в один шаг
const Prog = ({ i, ms, run }: { i: number; ms: number; run: boolean }) =>
  <span key={i} className="v2-prog" style={{ animationDuration: `${ms}ms`, animationPlayState: run ? 'running' : 'paused' }} />
// целевое действие блока. Жёлтая кнопка на экране одна (hero, финал или шапка), поэтому здесь тёмная или ссылка
const Go = ({ to, ghost, children }: { to: string; ghost?: boolean; children: ReactNode }) =>
  <Link className={`bl-btn v2-go ${ghost ? 'bl-btn--ghost' : 'bl-btn--dark'}`} to={to}>{children} <ArrowRight size={18} /></Link>

const SURFACES = [
  { k: 'main' as const, t: 'на главной приложения', d: 'Первое, что абонент видит утром, когда проверяет баланс.' },
  { k: 'showcase' as const, t: 'в разделе «лучшее рядом»', d: 'Акции заведений у дома, ближние — первыми.' },
  { k: 'paid' as const, t: 'сразу после оплаты', d: 'В момент, когда деньги есть и решение близко.' },
  { k: 'rest' as const, t: 'за гигабайты в подарок', d: 'Абонент получает гигабайты за визит к вам — и приходит.' },
]
const SURF_MS = 4200
function Everywhere() {
  const a = useAuto(SURFACES.length, SURF_MS)
  return (
    <section id="where" className="bl-section bl-section--wide">
      <div ref={a.ref} className="v2-stage" {...a.hover}>
        <div className="bl-stack" style={{ ['--bl-gap' as string]: '32px' }}>
          <h2 className="bl-display-l">вас увидят там,<br />где абонент проводит день</h2>
          <ol className="v2-tabs">
            {SURFACES.map((x, n) => (
              <li key={x.k} className={n === a.i ? 'is-on' : ''}>
                <button type="button" onClick={() => a.pick(n)} aria-pressed={n === a.i}>
                  <span className="bl-h3">{x.t}</span>
                  {n === a.i && <motion.span className="bl-body bl-secondary" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>{x.d}</motion.span>}
                </button>
                {n === a.i && <Prog i={a.i} ms={SURF_MS} run={a.run} />}
              </li>
            ))}
          </ol>
          <Go to="/login">выбрать, где показать</Go>
        </div>
        <div className="v2-stage__phone">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={a.i} initial={{ opacity: 0, y: 24, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}>
              <PhoneSurface kind={SURFACES[a.i].k} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}

// ИИ-поиск витрины: вопрос печатается, ИИ «думает», отвечает и выкладывает офферы. Чипсами можно выбрать вопрос самому
const ASKS = [
  { q: 'где позавтракать рядом до 300 ₽?', a: 'Нашёл два места в 5 минутах. Завтрак с кофе дешевле в «Колосе».', ids: ['kolos', 'schi'], more: ['ближе', 'с собой', 'открыто сейчас'] },
  { q: 'переобуть машину до выходных', a: 'В «Колесе 24» есть запись на четверг, «Мотор» бесплатно проверит ходовую.', ids: ['koleso', 'motor'], more: ['по записи', 'дешевле'] },
  { q: 'чем занять ребёнка в субботу?', a: 'Пробное занятие в «Сове» бесплатно, а в «Кубике» −15% на конструкторы.', ids: ['sova', 'toys'], more: ['4–6 лет', 'рядом с домом'] },
]
function Chat() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { amount: 0.4 })
  const reduce = useReducedMotion()
  const [s, setS] = useState(0)
  const [k, setK] = useState(0) // тики по 45 мс от начала сценария
  const x = ASKS[s], typed = reduce ? x.q.length : Math.min(k, x.q.length)
  const T = { think: x.q.length + 6, answer: x.q.length + 22, cards: x.q.length + 30, next: x.q.length + 150 }
  const at = reduce ? T.next : k
  useEffect(() => {
    if (!inView || reduce) return
    const t = setInterval(() => setK(v => v + 1), 45)
    return () => clearInterval(t)
  }, [inView, reduce, s])
  useEffect(() => { if (at >= T.next && !reduce) { setS(v => (v + 1) % ASKS.length); setK(0) } }, [at])
  const play = (n: number) => { setS(n); setK(0) }
  return (
    <section className="bl-section bl-section--wide v2-split">
      <div className="bl-stack" style={{ ['--bl-gap' as string]: '20px' }}>
        <span className="bl-tag bl-tag--soft-violet" style={{ alignSelf: 'flex-start' }}><Sparkles size={14} /> новое</span>
        <h2 className="bl-display-l">и даже когда спрашивают словами</h2>
        <p className="bl-lead bl-secondary">Абонент спрашивает приложение словами, ИИ подбирает акции рядом. Ваша появится сама, если подходит. Настраивать ничего не нужно.</p>
        <div className="bl-stack" style={{ ['--bl-gap' as string]: '8px' }}>
          <span className="bl-caption">спросите сами:</span>
          <div className="bl-row">{ASKS.map((a, n) => <Chip key={a.q} on={n === s} onClick={() => play(n)}>{a.q}</Chip>)}</div>
        </div>
        <Go to="/login">разместить акцию в «лучшее рядом»</Go>
      </div>
      <div ref={ref} className="v2-chat v2-chat--live" aria-live="polite" aria-label="Пример диалога в витрине">
        <div className="v2-bubble v2-bubble--me">{x.q.slice(0, typed)}{typed < x.q.length && <span className="v2-caret" />}</div>
        <AnimatePresence mode="popLayout">
          {at >= T.think && at < T.answer && <motion.div key={`t${s}`} className="v2-bubble v2-typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><i /><i /><i /></motion.div>}
          {at >= T.answer && <motion.div key={`a${s}`} className="v2-bubble" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><Bot size={16} /> {x.a}</motion.div>}
        </AnimatePresence>
        <div className="v2-chat__cards">
          {at >= T.cards && x.ids.map((id, n) => (
            <motion.div key={`${s}${id}`} initial={{ opacity: 0, scale: 0.9, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: n * 0.12, type: 'spring', stiffness: 260, damping: 22 }}>
              <Creative o={OFFERS.find(o => o.id === id)!} erid="реклама" />
            </motion.div>
          ))}
        </div>
        {at >= T.cards && <motion.div className="bl-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>{x.more.map(m => <span key={m} className="bl-chip">{m}</span>)}</motion.div>}
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
    { ui: (on: boolean) => <Builder run={run && on} />, t: 'объявление за 5 минут', d: <>Дайте ссылку на сайт или Карты — <Link to="/login">ИИ соберёт объявление</Link> сам. Поправить можно словами.</> },
    { ui: (on: boolean) => <Hub active={on} run={run} />, t: 'всё в одном кабинете', d: 'Кампании, баланс, заявки и документы. Статистика каждый день.' },
    { ui: (on: boolean) => <Channels active={on} run={run} />, t: 'одна кампания — все каналы', d: 'Приложение билайна, раздел «лучшее рядом», ТВ и пуши. И у партнёров: Авито, Альфа-Банк, Т-Банк.' },
  ]
  return (
    <section id="how" className="bl-section bl-section--wide v2-anywhere" data-theme="invert">
      <h2 className="bl-display-l">запуск за вечер.<br />дальше — из одного окна</h2>
      <div ref={ref} className="v2-any" style={{ ['--any-cols' as string]: items.map((_, i) => `minmax(0, ${i === active ? 2 : 1}fr)`).join(' ') }}>
        {items.map((x, i) => (
          <article key={x.t} className={`v2-any__item${i === active ? ' is-active' : ''}`} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)}>
            <div className="v2-any__card">{x.ui(stacked || i === active)}</div>
            <h3 className="bl-h3">{x.t}</h3>
            <p className="bl-body bl-secondary">{x.d}</p>
          </article>
        ))}
      </div>
      <Go to="/login">собрать объявление самому</Go>
    </section>
  )
}

const POINTS = [
  { id: 1, addr: 'Покровка, 12', x: 230, y: 250, active: true },
  { id: 2, addr: 'Плющиха, 22', x: 450, y: 170, active: true },
]
// нам доверяют — сразу после hero, бегущей лентой, как полоса брендов у Shopify. Логотипы из Википедии в public/logos:
// серые, в цвете при наведении; multiply убирает белый фон у PNG Brandshop. Ряд повторён дважды для бесшовной прокрутки
const CLIENTS: [string, string][] = [
  ['pyaterochka.svg', 'Пятёрочка'], ['alfabank.svg', 'Альфа-Банк'], ['tbank.svg', 'Т-Банк'], ['yandex.svg', 'Яндекс'],
  ['ozon.svg', 'Ozon'], ['cdek.svg', 'СДЭК'], ['brandshop.png', 'Brandshop'],
]
function Clients() {
  return (
    <section className="bl-section bl-section--wide v2-clients" aria-labelledby="clients-h">
      <div className="v2-clients__head">
        <h2 id="clients-h" className="bl-h3">нам доверяют</h2>
        <Go ghost to="/login">стать партнёром</Go>
      </div>
      <div className="v2-ticker v2-ticker--logos">
        <ul className="v2-ticker__track">
          {[...CLIENTS, ...CLIENTS].map(([f, t], k) => (
            <li key={k} className="v2-logo" aria-hidden={k >= CLIENTS.length}><img src={`${import.meta.env.BASE_URL}logos/${f}`} alt={k < CLIENTS.length ? t : ''} /></li>
          ))}
        </ul>
      </div>
    </section>
  )
}

// кому покажем: радиус и момент выбирает сам посетитель лендинга — круги и число людей меняются вживую.
// Доли моментов — заглушки, в бою придут из охвата по точкам
const RADIUS: [string, number, number][] = [['500 м', 60, 4100], ['1 км', 105, 12400], ['3 км', 190, 61000]]
const WHEN: [string, string, number][] = [['всегда', '', 1], ['в день зарплаты', ' · в день зарплаты', 0.18], ['после переезда', ' · недавно переехали', 0.03], ['после оплаты', ' · сразу после оплаты', 0.35]]
function AroundPoint() {
  const [n, setN] = useState(0)
  const [rad, setRad] = useState(1)
  const [when, setWhen] = useState(0)
  const reduce = useReducedMotion()
  useEffect(() => { if (reduce) return; const t = setInterval(() => setN(x => x + 1), 2600); return () => clearInterval(t) }, [reduce])
  const [label, r, people] = RADIUS[rad]
  return (
    <section id="who" className="bl-section bl-section--wide v2-split v2-split--map">
      <div className="v2-map">
        <ReachMap points={POINTS} r={r} />
        <AnimatePresence>
          <motion.div key={n} className="float-card v2-map__guest" style={{ left: `${18 + (n * 23) % 50}%`, top: `${12 + (n * 37) % 55}%` }}
            initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
            <span className="guest-dot"><UserPlus size={16} /></span>
            <span><b className="bl-medium">+1 гость</b><span className="bl-micro" style={{ display: 'block' }}>{['300 м', '650 м', '900 м'][n % 3]} от точки</span></span>
          </motion.div>
        </AnimatePresence>
        <span className="bl-pill-dark v2-map__today">сегодня пришли: <b className="bl-nums">{14 + n}</b></span>
      </div>
      <div className="bl-stack" style={{ ['--bl-gap' as string]: '24px' }}>
        <h2 className="bl-display-l">покажем тем, кто рядом и&nbsp;кому это нужно сейчас</h2>
        <p className="bl-body bl-secondary">Тем, кто живёт, работает или каждый день бывает рядом с вашей точкой. Данные абонентов вам не передаём — только итоги кампании.</p>
        <div className="bl-stack" style={{ ['--bl-gap' as string]: '12px' }}>
          <span className="bl-caption">радиус от точки</span>
          <Segmented label="Радиус охвата" value={rad} onChange={setRad} options={RADIUS.map(([t], i) => [i, t] as [number, string])} />
          <span className="bl-caption">когда показать</span>
          <div className="bl-row">{WHEN.map(([t], i) => <Chip key={t} on={i === when} onClick={() => setWhen(i)}>{t}</Chip>)}</div>
        </div>
        <div className="bl-stat"><span className="bl-stat__value"><Num value={Math.round(people * POINTS.length * WHEN[when][2] / 10) * 10} /></span><span className="bl-stat__label">человек в {label} от двух ваших точек{WHEN[when][1]}</span></div>
        <Go to="/login">посчитать для своих точек</Go>
      </div>
    </section>
  )
}

// сколько стоит: расчёт по сфере и бюджету + четыре модели оплаты. Средние — из NICHES, как в калькуляторе первой версии
const MODELS = [
  { t: 'переход', v: 'от 9 ₽', d: 'за клик на сайт, в Карты или звонок', tag: 'чаще всего' },
  { t: 'заявка', v: 'от 350 ₽', d: 'за заявку, которую вы получили' },
  { t: 'купон', v: '12 %', d: 'с проданного купона', tag: 'без вложений' },
  { t: 'подписка', v: '20 %', d: 'с платежей абонента', tag: 'без вложений' },
]
function Pricing() {
  const [niche, setNiche] = useState(NICHES[0])
  const [budget, setBudget] = useState(10000)
  const clicks = budget / niche.cpc, got = clicks * niche.conv
  return (
    <section id="price" className="bl-section bl-section--wide">
      <div className="section-head">
        <h2 className="bl-display-l">платите за действия,<br />а не за показы</h2>
        <p className="bl-body bl-secondary" style={{ maxWidth: 380 }}>Показы бесплатно. Пополнение от 3 000 ₽, остаток вернём. На первую кампанию добавим ещё 3 000 ₽ бонусом.</p>
      </div>
      <div className="v2-price">
        <div className="v2-calc">
          <div className="bl-stack" style={{ ['--bl-gap' as string]: '12px' }}>
            <span className="bl-caption">ваша сфера</span>
            <div className="bl-row">{NICHES.map(x => <Chip key={x.id} on={x.id === niche.id} onClick={() => setNiche(x)}>{x.t}</Chip>)}</div>
          </div>
          <label className="bl-field">
            <span className="bl-field__label">бюджет в месяц: <b className="bl-medium">{rub(budget)}</b></span>
            <input className="bl-range" type="range" min={3000} max={100000} step={1000} value={budget} onChange={e => setBudget(+e.target.value)} aria-label="Бюджет в месяц" />
          </label>
          <div className="bl-card v2-calc__result" data-theme="invert">
            <span className="bl-caption">придут к вам за месяц</span>
            <span className="bl-number-xl"><Num value={got} /> <span className="bl-h3">{niche.unit}</span></span>
            <span className="bl-caption">{n(clicks)} переходов по {niche.cpc} ₽ · в среднем {rub(budget / got)} за каждого</span>
          </div>
          <Go to="/login">точный расчёт в кабинете</Go>
        </div>
        <ul className="v2-models">
          {MODELS.map((m, k) => (
            <li key={m.t} className={k ? '' : 'is-main'}>
              <span className="bl-h4">{m.t} {m.tag && <span className={`bl-tag ${k ? 'bl-tag--soft-green' : 'bl-tag--brand'}`}>{m.tag}</span>}</span>
              <b className="bl-h2">{m.v}</b><span className="bl-caption">{m.d}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function ForEveryone() {
  const s = [
    { photo: 'case-coffee.jpg', label: 'Кофейня с гостями у стойки', t: 'начните за вечер', d: 'Кофейня «Зерно» запустилась за 10 минут. Автопилот сам выбрал, кому и где показать.', v: 289, u: 'гостей за месяц', plan: 'автопилот', price: '10 000 ₽ в месяц' },
    { photo: 'case-auto.jpg', label: 'Автосервис, смена шин', t: 'растите без агентства', d: 'Сеть из трёх автосервисов сама выбирает моменты и ставки — например, первые заморозки.', v: 72, u: 'записи за две недели холодов', plan: 'вручную', price: '5 600 ₽ за две недели' },
    { photo: 'case-dev.jpg', label: 'Офис продаж жилого комплекса', t: 'по-крупному', d: 'Застройщик согласовал медиаплан и спецпроект с персональным менеджером.', v: 178, u: 'визитов в офис продаж за месяц', plan: 'медиаплан', price: '125 000 ₽ в месяц' },
  ]
  return (
    <section id="cases" className="bl-section bl-section--wide">
      <div className="section-head">
        <h2 className="bl-display-l">от кофейни до федеральной сети</h2>
        <Link className="bl-btn" to="/login">запустить свою кампанию <ArrowRight size={18} /></Link>
      </div>
      <div className="bl-grid" style={{ ['--bl-cols' as string]: 3 }}>
        {s.map((x, i) => (
          <Reveal key={x.t} delay={i * 0.08} as="article" className="v2-story">
            <Photo name={x.photo} label={x.label} ratio="4 / 3">
              <span className="v2-story__result"><b className="bl-h2"><Num value={x.v} from={0} /></b><span className="bl-caption">{x.u}</span></span>
            </Photo>
            <h3 className="bl-h3">{x.t}</h3>
            <p className="bl-body bl-secondary">{x.d}</p>
            <div className="v2-story__plan"><span>{x.plan}</span><b>{x.price}</b></div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

// помощник: кнопки настоящие — «поднять» двигает прогноз на графике, «оставить» отвечает и тоже ждёт решения заново
const BASE_WEEK = [38, 41, 22, 24, 40, 52, 47]
function Assistant() {
  const [choice, setChoice] = useState<'up' | 'keep' | null>(null)
  const week = BASE_WEEK.map((v, d) => choice === 'up' && (d === 2 || d === 3) ? v + 11 : v)
  const max = 64
  return (
    <section className="bl-section bl-section--wide v2-split v2-assist">
      <div className="bl-stack" style={{ ['--bl-gap' as string]: '20px' }}>
        <h2 className="bl-display-l">помощник, который считает за вас</h2>
        <p className="bl-lead bl-secondary">ИИ в кабинете замечает просадки, предлагает ставку и пишет тексты. Решение всегда за вами — попробуйте.</p>
        <Go to="/login">попробовать в своём кабинете</Go>
      </div>
      <div className="v2-chat v2-chat--white">
        <div className="v2-bubble v2-bubble--me">почему в среду меньше гостей?</div>
        <div className="v2-bubble"><Bot size={16} /> Шёл дождь, гостей в обед пришло почти вдвое меньше. Поднять ставку с 12 до 15 часов на 2 ₽? В среду и четверг это около +22 гостей.</div>
        <div className="v2-week" role="img" aria-label={`Прогноз гостей по дням: ${week.join(', ')}`}>
          {week.map((v, d) => (
            <span key={d} className="v2-week__day">
              <motion.i className={choice === 'up' && (d === 2 || d === 3) ? 'is-up' : ''} animate={{ height: `${(v / max) * 100}%` }} transition={{ type: 'spring', stiffness: 140, damping: 18 }} />
              <span className="bl-micro">{['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'][d]}</span>
            </span>
          ))}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {choice === null
            ? <motion.div key="ask" className="bl-row" exit={{ opacity: 0 }}>
                <button type="button" className="bl-btn bl-btn--dark bl-btn--s" onClick={() => setChoice('up')}>поднять ставку</button>
                <button type="button" className="bl-btn bl-btn--s" onClick={() => setChoice('keep')}>оставить как есть</button>
              </motion.div>
            : <motion.div key={choice} className="v2-bubble" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Bot size={16} /> {choice === 'up' ? 'Готово: ставка 11 ₽ в обед, прогноз +22 гостя за среду и четверг. Бюджет недели +1 200 ₽.' : 'Оставил. Если в пятницу снова будет дождь, напомню.'}
                {' '}<button type="button" className="v2-link" onClick={() => setChoice(null)}>спросить снова</button>
              </motion.div>}
        </AnimatePresence>
      </div>
    </section>
  )
}

// аудитория: толпа точек — абоненты, жёлтые — те, кому ваша акция подходит прямо сейчас;
// сигналы загораются по очереди, шаги запуска отмечаются, когда блок на экране
const COLS = 40, ROWS = 30, GAP = 14
const lit = (i: number, t: number) => ((Math.imul(i + 1, 2654435761) ^ Math.imul(t + 1, 40503)) >>> 0) % 100 < 4
const dim = (i: number) => 0.18 + ((Math.imul(i + 7, 2246822519) >>> 0) % 100) / 220 // разная яркость — глубина толпы
const SIGNALS = ['живёт рядом', 'работает рядом', 'каждый день мимо', 'переехал', 'новая работа', 'скоро отпуск', 'день зарплаты', 'после оплаты', 'крупная покупка', 'кончился трафик', 'утро буднего дня', 'вечер пятницы']
const LAUNCH = ['ИНН', 'кому', 'оплата', 'в эфире']
function Audience() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { amount: 0.3 }), reduce = useReducedMotion()
  const run = inView && !reduce
  const [t, setT] = useState(0)
  useEffect(() => { if (!run) return; const x = setInterval(() => setT(v => v + 1), 1300); return () => clearInterval(x) }, [run])
  const trust = [
    { i: EyeOff, t: 'данные абонентов не уходят к вам', d: 'Вы видите итоги, а не людей. Всё по закону о персональных данных.' },
    { i: FileCheck2, t: 'маркировка — наша забота', d: 'erid и отчёты в ОРД оформим сами.' },
    { i: Wallet, t: 'деньги под контролем', d: 'Лимит в день, возврат остатка на счёт.' },
  ]
  return (
    <section className="bl-section bl-section--wide v2-trust" data-theme="invert">
      <span className="v2-glow" aria-hidden="true" />
      <h2 className="bl-display-l">ваши клиенты уже<br />среди абонентов билайна</h2>
      <div ref={ref} className="v2-aud">
        <Reveal className="v2-aud__tile v2-aud__crowd">
          <svg className="v2-crowd" viewBox={`0 0 ${COLS * GAP} ${ROWS * GAP}`} aria-hidden="true" preserveAspectRatio="xMidYMid slice">
            {Array.from({ length: COLS * ROWS }, (_, i) => {
              const on = lit(i, t)
              return <circle key={i} cx={(i % COLS + 0.5) * GAP} cy={(Math.floor(i / COLS) + 0.5) * GAP} r={on ? 4 : 2.2} className={on ? 'is-on' : ''} style={on ? undefined : { opacity: dim(i) }} />
            })}
          </svg>
          <span className="v2-aud__legend bl-caption"><i /> подходят под вашу акцию прямо сейчас</span>
          <div className="v2-stat">
            <span className="v2-stat__v"><Num value={45} suffix=" млн" from={0} /></span>
            <span className="bl-body bl-secondary">абонентов билайна по всей России — и те, кто живёт и работает рядом с вами</span>
          </div>
        </Reveal>
        <Reveal delay={0.1} className="v2-aud__tile">
          <div className="v2-stat">
            <span className="v2-stat__v"><Num value={130} from={0} /></span>
            <span className="bl-body bl-secondary">сигналов, по которым найдём своих: место, событие, деньги, момент</span>
          </div>
          <div className="v2-sigs" aria-hidden="true">
            {SIGNALS.map((x, k) => <span key={x} className={`v2-sig${k === t % SIGNALS.length ? ' is-on' : ''}`}>{x}</span>)}
          </div>
        </Reveal>
        <Reveal delay={0.2} className="v2-aud__tile">
          <div className="v2-stat">
            <span className="v2-stat__v"><Num value={5} suffix=" мин" from={0} /></span>
            <span className="bl-body bl-secondary">на запуск кампании — от ИНН до первых показов</span>
          </div>
          <ol className="v2-launch" aria-hidden="true">
            <motion.span className="v2-launch__bar" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 2, ease: 'easeInOut', delay: 0.3 }} />
            {LAUNCH.map((x, k) => (
              <li key={x}>
                <motion.span className="v2-launch__dot" initial={{ scale: 0.4, opacity: 0.4 }} whileInView={{ scale: 1, opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.3 + k * 0.6, type: 'spring', stiffness: 300, damping: 18 }}><Check size={14} strokeWidth={3} /></motion.span>
                <span className="bl-caption">{x}</span>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
      <div className="bl-grid v2-trust__row" style={{ ['--bl-cols' as string]: 3 }}>
        {trust.map((x, n) => <Reveal key={x.t} delay={0.2 + n * 0.1} className="bl-stack v2-trust__item"><x.i size={24} /><b className="bl-h4">{x.t}</b><span className="bl-body bl-secondary">{x.d}</span></Reveal>)}
      </div>
      <Go to="/login">запустить самостоятельно</Go>
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
        {([[3000, ' ₽', 'на баланс за первую кампанию'], [0, ' ₽', 'за показы и подключение'], [1, ' день', 'до первых гостей']] as const).map(([v, u, t], n) => (
          <Reveal key={t} delay={n * 0.1} className="v2-bonus__row"><b className="bl-h2"><Num value={v} suffix={u} from={0} /></b><span className="bl-body bl-secondary">{t}</span></Reveal>
        ))}
        <Go to="/login">получить бонус 3 000 ₽</Go>
      </div>
    </section>
  )
}

// финал: три шага сменяют друг друга, справа — тот же шаг в интерфейсе вместо фото
const FINAL_MS = 3600
const FINAL = [
  { t: 'введите ИНН или сайт', d: 'узнаем компанию и точки', ui: <><span className="bl-caption">ИНН или сайт</span><span className="v2-mock-input">7701 234 567<span className="v2-caret" /></span><span className="v2-mini__row"><span>ООО «Зерно» · 2 точки</span><Check size={16} /></span></> },
  { t: 'выберите, кому показать', d: 'или доверьтесь автопилоту', ui: <><span className="bl-caption">кому показать</span><span className="bl-row"><span className="bl-chip is-active">соседи в 1 км</span><span className="bl-chip is-active">утром</span><span className="bl-chip">после оплаты</span></span><b className="bl-h2">24 800</b><span className="bl-caption">подходящих людей</span></> },
  { t: 'пополните и запустите', d: 'СБП, оферта галочкой', ui: <><span className="bl-caption">к оплате по СБП</span><b className="bl-h2">3 000 ₽</b><span className="v2-mini__row"><span className="v2-mini__ok"><Check size={18} strokeWidth={3} /></span><span>кампания запущена</span></span></> },
]
function Final() {
  const a = useAuto(FINAL.length, FINAL_MS)
  return (
    <section id="v2-final" className="bl-section bl-section--wide v2-final" data-theme="invert">
      <div ref={a.ref} className="bl-stack" style={{ ['--bl-gap' as string]: '32px' }} {...a.hover}>
        <h2 className="bl-display-l">запустите сегодня</h2>
        <ol className="v2-steps">
          {FINAL.map((x, n) => (
            <li key={x.t} className={n === a.i ? 'is-on' : ''}>
              <button type="button" onClick={() => a.pick(n)} aria-pressed={n === a.i}>
                <span className="v2-steps__n">0{n + 1}</span>
                <span><b className="bl-h4">{x.t}</b><span className="bl-caption" style={{ display: 'block' }}>{x.d}</span></span>
              </button>
              {n === a.i && <Prog i={a.i} ms={FINAL_MS} run={a.run} />}
            </li>
          ))}
        </ol>
        <div className="bl-row" style={{ ['--bl-gap' as string]: '20px' }}>
          <Link className="bl-btn bl-btn--primary bl-btn--xl" to="/login">узнать охват</Link>
        </div>
        <span className="bl-caption">вход через Госуслуги или бизнес-ID — компанию и точки узнаем сами</span>
      </div>
      <div className="v2-final__stage" aria-hidden="true">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={a.i} className="v2-final__card" initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.4 }}>
            {FINAL[a.i].ui}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}

// сомнения, которые останавливают перед кнопкой. Ответы — как в кабинете: оферта, СБП, ЭДО позже, остаток возвращаем
const FAQ: [string, string][] = [
  ['сколько нужно денег на старт?', 'От 3 000 ₽. Показы бесплатные: деньги списываются только за переходы, заявки или проданные купоны. Остаток вернём на счёт компании.'],
  ['нужен ли договор и ЭДО?', 'Нет. Оферту принимаете галочкой при оплате, это и есть договор. ЭДО подключите позже — для закрывающих документов.'],
  ['когда придут первые клиенты?', 'Модерация занимает пару минут, переходы начинаются в первый час. Визиты в точку видно через день-два.'],
  ['а если реклама не сработает?', 'Показы бесплатные, деньги списываются только за действия абонентов: переходы, заявки, проданные купоны. Нет действий — нет списаний. Дневной лимит ставите сами, кампанию можно остановить в любой момент.'],
  ['нужен ли сайт?', 'Нет. Хватит карточки в Картах или телефона. Можно продавать купоны прямо в приложении билайна — оплата со счёта телефона.'],
  ['увижу ли я данные абонентов?', 'Нет. Вы видите результат: переходы, заявки, визиты. Персональные данные остаются у билайна, всё по закону.'],
]
function Faq() {
  return (
    <section id="faq" className="bl-section bl-section--wide v2-faq">
      <div className="bl-stack" style={{ ['--bl-gap' as string]: '20px' }}>
        <h2 className="bl-display-l">остались вопросы?</h2>
        <p className="bl-body bl-secondary">Не нашли ответ — в кабинете на каждом шаге подсказывает помощник, а в разделе помощи есть ответы на остальное.</p>
        <Go to="/login">зарегистрироваться</Go>
      </div>
      <div className="bl-accordion">
        {FAQ.map(([q, a], k) => <details key={q} open={k === 0}><summary>{q}</summary><div className="bl-accordion__body">{a}</div></details>)}
      </div>
    </section>
  )
}

// кнопка в шапке — когда hero и финал с главной кнопкой ушли с экрана: на экране всегда одна жёлтая
function useHeaderCta() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const seen = new Map<Element, boolean>()
    const io = new IntersectionObserver(es => { es.forEach(e => seen.set(e.target, e.isIntersecting)); setShow(![...seen.values()].some(Boolean)) })
    for (const id of ['v2-hero', 'v2-final']) { const el = document.getElementById(id); if (el) io.observe(el) }
    return () => io.disconnect()
  }, [])
  return show
}
const NAV: [string, string][] = [['who', 'кому покажем'], ['price', 'цены'], ['how', 'как запустить'], ['faq', 'вопросы']]
const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

export default function LandingV2() {
  const cta = useHeaderCta()
  return (
    <div className="bl-page wrap v2">
      <header className="bl-header landing-head v2-head">
        <div className="bl-header__side"><Brand to="/v2" /></div>
        <nav className="bl-header__side bl-header__side--end" aria-label="Разделы лендинга">
          {NAV.map(([id, t]) => <button key={id} type="button" className="bl-hide-mobile bl-btn" onClick={() => go(id)}>{t}</button>)}
          <AnimatePresence initial={false}>
            {cta && <motion.span key="cta" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}><Link className="bl-btn bl-btn--primary" to="/login">узнать охват</Link></motion.span>}
          </AnimatePresence>
          <Link className="bl-btn bl-btn--dark" to="/login">войти</Link>
        </nav>
      </header>
      <main className="bl-stack" style={{ ['--bl-gap' as string]: '16px' }}>
        <Hero />
        <Clients />
        <Audience />
        <AroundPoint />
        <Everywhere />
        <Chat />
        <Pricing />
        <Anywhere />
        <Assistant />
        <ForEveryone />
        <Quote />
        <Faq />
        <Final />
      </main>
      <footer className="footer bl-caption">
        <span>© 2026 рекламная платформа билайна</span>
        <span className="bl-row" style={{ ['--bl-gap' as string]: '24px' }}><Link to="/offer">оферта</Link><Link to="/offer">обработка данных</Link></span>
      </footer>
    </div>
  )
}
