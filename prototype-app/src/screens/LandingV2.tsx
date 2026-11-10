import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type FocusEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion, useInView } from 'motion/react'
import { ArrowRight, Bot, Briefcase, Check, Clock, Coins, CreditCard, EyeOff, FileCheck2, Footprints, Home, Pause, PenLine, Play, Smartphone, Sparkles, TrendingDown, Truck, Wallet } from 'lucide-react'
import { DEMO_AD, PhoneSurface, ReachMap } from '../mock'
import { Creative, creativeOf } from '../creative'
import { Brand, Chip, Num, Photo, Reveal, Segmented } from '../ui'
import { OFFERS } from './Near'
import { NICHES, n, rub } from '../data'
import { HowGraphic } from './HowGraphics'
import { CityAudienceMap } from './CityAudienceMap'

function subscribeReducedMotion(listener: () => void) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}
function useLiveReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia('(prefers-reduced-motion: reduce)').matches, () => true)
}

// Лендинг открыт и как MVP (/mvp): тогда все кнопки ведут на вход MVP
const mvp = () => location.hash.startsWith('#/mvp')
const login = () => (mvp() ? '/mvp/login' : '/login')

export const LaunchContext = createContext<(() => void) | undefined>(undefined)

export function CampaignAction({ to = login(), className, children, describedBy }: { to?: string; className?: string; children: ReactNode; describedBy?: string }) {
  const launch = useContext(LaunchContext)
  return launch
    ? <button type="button" data-campaign-start className={className} onClick={launch} aria-haspopup="dialog" aria-describedby={describedBy}>{children === 'узнать охват' ? 'запустить сейчас' : children}</button>
    : <Link to={to} className={className} aria-describedby={describedBy}>{children}</Link>
}

const DEMO_CREATIVE = creativeOf(DEMO_AD.brand, DEMO_AD.offer, DEMO_AD.img)

function OfferPreview({ caption }: { caption: string }) {
  return (
    <figure className="v2-offer-preview">
      <figcaption className="bl-caption">{caption}</figcaption>
      <Creative o={DEMO_CREATIVE} erid="реклама" wide />
    </figure>
  )
}

// фон hero, как у Shopify: public/video/hero.mp4 и первый кадр hero.jpg. Нет файла — остаётся тёмный блок.
// Без звука и по кругу; при «уменьшить движение» не стартует сам.
function HeroVideo() {
  const reduce = useLiveReducedMotion()
  const ref = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)
  // автозапуск успевает раньше подписки на onPlay, поэтому стартуем с «играет»
  const [paused, setPaused] = useState(!!reduce)
  useEffect(() => { if (reduce) { ref.current?.pause(); setPaused(true) } }, [reduce])
  if (failed) return null
  const base = `${import.meta.env.BASE_URL}video/hero`
  return (
    <>
      <video ref={ref} className="v2-hero__media" src={`${base}.mp4`} poster={`${base}.jpg`} autoPlay={!reduce} muted loop playsInline preload="metadata" aria-hidden="true"
        onError={() => setFailed(true)} onPlay={() => setPaused(false)} onPause={() => setPaused(true)} />
      <button type="button" className="bl-icon-btn v2-hero__pause" onClick={() => { const v = ref.current!; if (v.paused) void v.play().catch(() => setPaused(true)); else v.pause() }} aria-label={paused ? 'включить видео' : 'остановить видео'}>
        {paused ? <Play size={18} /> : <Pause size={18} />}
      </button>
    </>
  )
}

export function Hero({ phone, staticBackground = false }: { phone?: ReactNode; staticBackground?: boolean } = {}) {
  const sketch = Boolean(useContext(LaunchContext))
  return (
    <section id="v2-hero" className="bl-section bl-section--wide v2-hero" data-theme="invert">
      {staticBackground ? <img className="v2-hero__media" src={`${import.meta.env.BASE_URL}video/hero.jpg`} alt="" fetchPriority="high"/> : <HeroVideo/>}
      <div className="v2-hero__text">
        <h1 className="bl-display-xl">{sketch ? 'Находите новых клиентов' : 'покажите свою акцию тем, кто рядом'}</h1>
        <p className="bl-lead bl-secondary">{sketch ? 'Показывайте рекламу абонентам билайна и приглашайте их на сайт, в приложение или мессенджер' : 'Разместите акцию в приложении билайна. Показы бесплатны — платите за переходы, заявки или продажи.'}</p>
        <div className="bl-row" style={{ ['--bl-gap' as string]: '20px' }}>
          <CampaignAction className="bl-btn bl-btn--primary bl-btn--xl">узнать охват</CampaignAction>
        </div>
      </div>
      <div className="v2-hero__offer">
        <OfferPreview caption="так абонент увидит вашу акцию" />
      </div>
      <div className="v2-hero__phone" aria-hidden="true">
        {phone ?? <PhoneSurface kind="main" />}
      </div>
    </section>
  )
}

// автосмена шагов, как вкладки у Shopify: идёт, пока блок на экране и курсор не над ним; клик выбирает шаг и сбрасывает таймер
function useAuto(len: number, ms: number) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { amount: 0.4 })
  const reduce = useLiveReducedMotion()
  const [i, pick] = useState(0)
  const [hold, setHold] = useState(false)
  const [focused, setFocused] = useState(false)
  const [paused, setPaused] = useState(false)
  const run = inView && !reduce && !hold && !focused && !paused
  useEffect(() => { if (!run) return; const t = setTimeout(() => pick(x => (x + 1) % len), ms); return () => clearTimeout(t) }, [run, i, len, ms])
  return { ref, i, pick, run, paused, reduce, toggle: () => setPaused(value => !value), hover: { onMouseEnter: () => setHold(true), onMouseLeave: () => setHold(false), onFocusCapture: () => setFocused(true), onBlurCapture: (event: FocusEvent<HTMLDivElement>) => setFocused(event.currentTarget.contains(event.relatedTarget)) } }
}
// полоска прогресса под активным шагом, длиной в один шаг
const Prog = ({ i, ms, run }: { i: number; ms: number; run: boolean }) =>
  <span key={i} className="v2-prog" style={{ animationDuration: `${ms}ms`, animationPlayState: run ? 'running' : 'paused' }} />
// целевое действие блока. Жёлтая кнопка на экране одна (hero, финал или шапка), поэтому здесь тёмная или ссылка
const Go = ({ to, ghost, children }: { to: string; ghost?: boolean; children: ReactNode }) =>
  <CampaignAction className={`bl-btn v2-go ${ghost ? 'bl-btn--ghost' : 'bl-btn--dark'}`} to={to}>{children} <ArrowRight size={18} /></CampaignAction>

export const SURFACES = [
  { k: 'main' as const, t: 'на главной приложения', d: 'Первое, что абонент видит утром, когда проверяет баланс.' },
  { k: 'showcase' as const, t: 'в разделе «лучшее рядом»', d: 'Акции заведений у дома, ближние — первыми.' },
  { k: 'paid' as const, t: 'сразу после оплаты', d: 'В момент, когда деньги есть и решение близко.' },
  { k: 'rest' as const, t: 'за гигабайты в подарок', d: 'Абонент получает гигабайты за визит к вам — и приходит.' },
]
const SURF_MS = 4200
function Everywhere() {
  const sketch = Boolean(useContext(LaunchContext))
  const a = useAuto(SURFACES.length, SURF_MS)
  return (
    <section id="where" className="bl-section bl-section--wide">
      <div ref={a.ref} {...a.hover}>
        <div className="section-head">
          <h2 className="bl-display-l">{sketch ? 'где покажем' : <>вас увидят там,<br />где абонент проводит день</>}</h2>
          <div className="bl-stack" style={{ ['--bl-gap' as string]: '16px', maxWidth: 400 }}>
            <p className="bl-body bl-secondary">Одна кампания — четыре места в приложении билайна. Показываем там, где решение ближе всего.</p>
            <Go to={login()}>{sketch ? 'запустить сейчас' : 'выбрать, где показать'}</Go>
          </div>
        </div>
        <div className="v2-backdrop v2-backdrop--teal v2-where">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={a.i} initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }} transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}>
              <PhoneSurface kind={SURFACES[a.i].k} />
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="v2-playback"><button type="button" className="bl-btn" aria-pressed={a.paused} disabled={!!a.reduce} onClick={a.toggle}>{a.paused ? <Play size={16}/> : <Pause size={16}/>} автосмена: {a.paused || a.reduce ? 'выключена' : 'включена'}</button></div>
        <ol className="v2-tabs v2-tabs--row">
          {SURFACES.map((x, n) => (
            <li key={x.k} className={n === a.i ? 'is-on' : ''}>
              <button type="button" onClick={() => a.pick(n)} aria-pressed={n === a.i}>
                <span className="bl-h4">{x.t}</span>
                <span className="bl-body bl-secondary">{x.d}</span>
              </button>
              {n === a.i && <Prog i={a.i} ms={SURF_MS} run={a.run} />}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// Готовый пример виден сразу. Другой вопрос выбирает посетитель.
const ASKS = [
  { q: 'где позавтракать рядом до 300 ₽?', a: 'Нашёл два места в 5 минутах. Завтрак с кофе дешевле в «Колосе».', ids: ['kolos', 'schi'] },
  { q: 'переобуть машину до выходных', a: 'В «Колесе 24» есть запись на четверг, «Мотор» бесплатно проверит ходовую.', ids: ['koleso', 'motor'] },
  { q: 'чем занять ребёнка в субботу?', a: 'Пробное занятие в «Сове» бесплатно, а в «Кубике» −15% на конструкторы.', ids: ['sova', 'toys'] },
]
function Chat() {
  const [selected, select] = useState(0)
  const reduce = useLiveReducedMotion()
  return (
    <section className="bl-section bl-section--wide">
      <div className="section-head">
        <div className="bl-stack" style={{ ['--bl-gap' as string]: '16px' }}>
          <span className="bl-tag bl-tag--soft-violet" style={{ alignSelf: 'flex-start' }}><Sparkles size={14} /> новое</span>
          <h2 className="bl-display-l">и даже когда<br />спрашивают словами</h2>
        </div>
        <div className="bl-stack" style={{ ['--bl-gap' as string]: '16px', maxWidth: 400 }}>
          <p className="bl-body bl-secondary">Абонент спрашивает приложение словами, ИИ подбирает акции рядом. Ваша появится сама, если подходит. Настраивать ничего не нужно.</p>
          <Go to={login()}>разместить акцию в «лучшее рядом»</Go>
        </div>
      </div>
      <div className="v2-backdrop v2-backdrop--violet v2-center">
        <div className="bl-row v2-asks" role="group" aria-label="Вопросы для примера">{ASKS.map((a, i) => <Chip key={a.q} on={i === selected} onClick={() => select(i)}>{a.q}</Chip>)}</div>
        <div className="v2-window v2-window--chat">
          <div className="v2-window__bar"><Sparkles size={16} /> лучшее рядом · поиск словами</div>
          <div className="v2-chat v2-chat--white v2-chat--live" role="group" aria-label="Пример диалога в витрине">
            {ASKS.map((example, i) => (
              <motion.div key={example.q} className="v2-chat__scene" aria-hidden={i !== selected}
                initial={false} animate={{ opacity: i === selected ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.22 }}>
                <div className="v2-bubble v2-bubble--me">{example.q}</div>
                <div className="v2-bubble">{example.a}</div>
                <div className="v2-chat__cards">
                  {example.ids.map(id => <Creative key={id} o={OFFERS.find(o => o.id === id)!} erid="реклама" />)}
                </div>
              </motion.div>
            ))}
            <span className="v2-visually-hidden" role="status">{ASKS[selected].a}</span>
          </div>
        </div>
      </div>
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
export function Clients({ calm = false }: { calm?: boolean } = {}) {
  const clients = useContext(LaunchContext) ? CLIENTS.slice(0, 6) : CLIENTS
  const [paused, setPaused] = useState(false)
  return (
    <section className="bl-section bl-section--wide v2-clients" aria-labelledby="clients-h">
      <div className="v2-clients__head">
        <h2 id="clients-h" className="bl-h3">нам доверяют</h2>
        <div className="bl-row">{!calm && <button type="button" className="bl-icon-btn" aria-label={paused ? 'Продолжить прокрутку логотипов' : 'Приостановить прокрутку логотипов'} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={18}/> : <Pause size={18}/>}</button>}<Go ghost to={login()}>стать партнёром</Go></div>
      </div>
      <div className="v2-ticker v2-ticker--logos">
        <ul className="v2-ticker__track" style={{ animationPlayState: paused ? 'paused' : undefined }}>
          {(calm ? clients : [...clients, ...clients]).map(([f, t], k) => (
            <li key={k} className="v2-logo" aria-hidden={k >= clients.length}><img src={`${import.meta.env.BASE_URL}logos/${f}`} alt={k < clients.length ? t : ''} /></li>
          ))}
        </ul>
      </div>
    </section>
  )
}

// кому покажем — как продуктовые экраны у Shopify: заголовок, под ним окно кабинета на цветной подложке
// (настройки слева живые — круги и число людей меняются), ниже три коротких пояснения.
// Доли моментов — заглушки, в бою придут из охвата по точкам
const RADIUS: [string, number, number][] = [['500 м', 60, 4100], ['1 км', 105, 12400], ['3 км', 190, 61000]]
const WHEN: [string, string, number, typeof Wallet][] = [['всегда', '', 1, Clock], ['в день зарплаты', ' · в день зарплаты', 0.18, Wallet], ['после переезда', ' · недавно переехали', 0.03, Truck], ['после оплаты', ' · сразу после оплаты', 0.35, CreditCard]]
const NEAR = [
  { i: Home, t: 'живут рядом', d: 'Соседи в радиусе, который вы выбрали.' },
  { i: Briefcase, t: 'работают рядом', d: 'Заходят в обед и после работы.' },
  { i: Footprints, t: 'бывают каждый день', d: 'Проходят мимо по дороге домой или в метро.' },
]
type ReachSelection = {
  rad: number
  setRad: (value: number) => void
  when: number
  setWhen: (value: number) => void
}

const RADIUS_OPTIONS: [number, string][] = RADIUS.map(([label], i) => [i, label])
const reach = (rad: number, when: number) => Math.round(RADIUS[rad][2] * POINTS.length * WHEN[when][2] / 10) * 10

function AroundPoint({ rad, setRad, when, setWhen }: ReachSelection) {
  const [label, r] = RADIUS[rad]
  return (
    <section id="who" className="bl-section bl-section--wide v2-reach">
      <div className="section-head">
        <h2 className="bl-display-l">покажем тем, кто рядом<br />и кому это нужно сейчас</h2>
        <div className="bl-stack" style={{ ['--bl-gap' as string]: '16px', maxWidth: 400 }}>
          <p className="bl-body bl-secondary">Выберите радиус и момент — охват посчитаем сразу. Данные абонентов вам не передаём, только итоги кампании.</p>
          <Go to={login()}>посчитать для своих точек</Go>
        </div>
      </div>
      <div className="v2-backdrop">
        <div className="v2-window v2-app">
          <aside className="v2-app__panel">
            <div className="v2-app__top"><b className="bl-h4">кому показать</b><span className="bl-caption">кофейня «Зерно» · 2 точки</span></div>
            <div className="bl-stack" style={{ ['--bl-gap' as string]: '8px' }}>
              <span className="bl-caption">радиус от точки</span>
              <Segmented label="Радиус охвата" value={rad} onChange={setRad} options={RADIUS_OPTIONS} />
            </div>
            <div className="bl-stack" style={{ ['--bl-gap' as string]: '8px' }}>
              <span className="bl-caption">когда показать</span>
              <div className="v2-when" role="radiogroup" aria-label="Когда показать">
                {WHEN.map(([t, , share, I], i) => (
                  <button key={t} type="button" role="radio" aria-checked={i === when} className={i === when ? 'is-on' : ''} onClick={() => setWhen(i)}>
                    <I size={18} /><span>{t}</span><span className="bl-caption">{Math.round(share * 100)} %</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="v2-app__result">
              <span className="bl-caption">примерный охват</span>
              <b className="bl-h1"><Num value={reach(rad, when)} /></b>
              <span className="bl-caption">в {label} от двух точек{WHEN[when][1]}</span>
            </div>
          </aside>
          <div className="v2-map">
            <ReachMap points={POINTS} r={r} radiusLabel={label} animateDots={false} />
          </div>
        </div>
      </div>
      <div className="bl-grid v2-feats" style={{ ['--bl-cols' as string]: 3 }}>
        {NEAR.map((x, k) => <Reveal key={x.t} delay={k * 0.08} className="bl-stack v2-trust__item"><x.i size={24} /><b className="bl-h4">{x.t}</b><span className="bl-body bl-secondary">{x.d}</span></Reveal>)}
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
        <div className="bl-stack" style={{ ['--bl-gap' as string]: '16px', maxWidth: 400 }}>
          <p className="bl-body bl-secondary">Показы бесплатно. Пополнение от 3 000 ₽, остаток вернём. На первую кампанию добавим ещё 3 000 ₽ бонусом.</p>
          <Go to={login()}>точный расчёт в кабинете</Go>
        </div>
      </div>
      <div className="v2-backdrop v2-backdrop--green">
      <div className="v2-window v2-price">
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
      </div>
    </section>
  )
}

export function ForEveryone({ calm = false }: { calm?: boolean } = {}) {
  const s = [
    { photo: 'case-coffee.jpg', label: 'Кофейня с гостями у стойки', t: 'начните за вечер', d: 'Кофейня «Зерно» запустилась за 10 минут. Автопилот сам выбрал, кому и где показать.', v: 289, u: 'гостей за месяц', plan: 'автопилот', price: '10 000 ₽ в месяц' },
    { photo: 'case-auto.jpg', label: 'Автосервис, смена шин', t: 'растите без агентства', d: 'Сеть из трёх автосервисов сама выбирает моменты и ставки — например, первые заморозки.', v: 72, u: 'записи за две недели холодов', plan: 'вручную', price: '5 600 ₽ за две недели' },
    { photo: 'case-dev.jpg', label: 'Офис продаж жилого комплекса', t: 'по-крупному', d: 'Застройщик согласовал медиаплан и спецпроект с персональным менеджером.', v: 178, u: 'визитов в офис продаж за месяц', plan: 'медиаплан', price: '125 000 ₽ в месяц' },
  ]
  return (
    <section id="cases" className="bl-section bl-section--wide">
      <div className="section-head">
        <h2 className="bl-display-l">от кофейни до федеральной сети</h2>
        <CampaignAction className="bl-btn">запустить свою кампанию <ArrowRight size={18} /></CampaignAction>
      </div>
      <div className="bl-grid" style={{ ['--bl-cols' as string]: 3 }}>
        {s.map((x, i) => (
          <Reveal key={x.t} delay={i * 0.08} as="article" className="v2-story">
            <Photo name={x.photo} label={x.label} ratio="4 / 3">
              <span className="v2-story__result"><b className="bl-h2">{calm ? x.v : <Num value={x.v} from={0} />}</b><span className="bl-caption">{x.u}</span></span>
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
const HELPS = [
  { i: TrendingDown, t: 'замечает просадки', d: 'Дождь, праздник, ремонт улицы — скажет, почему гостей стало меньше.' },
  { i: Coins, t: 'предлагает ставку', d: 'Посчитает, сколько гостей добавит каждый рубль, и спросит вас.' },
  { i: PenLine, t: 'пишет тексты', d: 'Предложит условие и текст объявления. Поправить можно словами.' },
]
const BASE_WEEK = [38, 41, 22, 24, 40, 52, 47]
function Assistant() {
  const [choice, setChoice] = useState<'up' | 'keep' | null>(null)
  const week = BASE_WEEK.map((v, d) => choice === 'up' && (d === 2 || d === 3) ? v + 11 : v)
  const max = 64
  return (
    <section className="bl-section bl-section--wide">
      <div className="section-head">
        <h2 className="bl-display-l">помощник,<br />который считает за вас</h2>
        <div className="bl-stack" style={{ ['--bl-gap' as string]: '16px', maxWidth: 400 }}>
        <p className="bl-body bl-secondary">ИИ в кабинете замечает просадки, предлагает ставку и пишет тексты. Решение всегда за вами — попробуйте.</p>
        <Go to={login()}>попробовать в своём кабинете</Go>
        </div>
      </div>
      <div className="v2-backdrop v2-backdrop--magenta v2-center">
      <div className="v2-window v2-window--chat">
      <div className="v2-window__bar"><Bot size={16} /> помощник · кофейня «Зерно»</div>
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
      </div>
      </div>
      <div className="bl-grid v2-feats" style={{ ['--bl-cols' as string]: 3 }}>
        {HELPS.map((x, k) => <Reveal key={x.t} delay={k * 0.08} className="bl-stack v2-trust__item"><x.i size={24} /><b className="bl-h4">{x.t}</b><span className="bl-body bl-secondary">{x.d}</span></Reveal>)}
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
  const inView = useInView(ref, { amount: 0.3 }), reduce = useLiveReducedMotion()
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
      <Go to={login()}>запустить самостоятельно</Go>
    </section>
  )
}

export function Quote({ calm = false }: { calm?: boolean } = {}) {
  return (
    <section className="bl-section bl-section--wide v2-quote">
      <figure className="bl-stack" style={{ ['--bl-gap' as string]: '24px', margin: 0 }}>
        <blockquote className="bl-h1">«Раньше листовки у метро. Теперь новые гости приходят из соседних домов, и я вижу, сколько стоил каждый»</blockquote>
        <figcaption className="bl-row" style={{ ['--bl-gap' as string]: '16px' }}>
          {/* портрет несуществующего человека: StyleGAN, Викисклад «Woman 1.jpg», общественное достояние */}
          <Photo name="quote-anna.jpg" label="Портрет владелицы кофейни" ratio="1 / 1" className="v2-quote__face" />
          <span className="bl-body bl-secondary">Анна, владелица кофейни «Зерно»<br />пример для прототипа</span>
        </figcaption>
      </figure>
      <div className="v2-bonus">
        {([[3000, ' ₽', 'на баланс за первую кампанию'], [0, ' ₽', 'за показы и подключение'], [1, ' день', 'до первых гостей']] as const).map(([v, u, t], n) => (
          <Reveal key={t} delay={n * 0.1} className="v2-bonus__row"><b className="bl-h2">{calm ? `${v.toLocaleString("ru-RU")}${u}` : <Num value={v} suffix={u} from={0} />}</b><span className="bl-body bl-secondary">{t}</span></Reveal>
        ))}
        <Go to={login()}>получить бонус 3 000 ₽</Go>
      </div>
    </section>
  )
}

const LAUNCH_STEPS = ['выберите радиус', 'оцените охват', 'посмотрите, как выглядит акция']

function Final({ rad, setRad, when }: Omit<ReachSelection, 'setWhen'>) {
  const launch = useContext(LaunchContext)
  const [step, setStep] = useState(2)
  const reduce = useLiveReducedMotion()
  const [label, radius] = RADIUS[rad]
  return (
    <section id="v2-final" className="bl-section bl-section--wide v2-final" data-theme="invert">
      <div className="v2-final__intro bl-stack">
        <h2 className="bl-display-l">как запустить кампанию</h2>
        <p className="bl-body bl-secondary">На примере кофейни «Зерно» с двумя точками.</p>
        <ol className="v2-steps" aria-label="Шаги примера">
          {LAUNCH_STEPS.map((title, i) => (
            <li key={title} className={i === step ? 'is-on' : ''}>
              <button type="button" onClick={() => setStep(i)} aria-pressed={i === step} aria-controls="v2-launch-preview">
                <span className="v2-steps__n" aria-hidden="true">0{i + 1}</span>
                <span className="bl-h4">{title}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div id="v2-launch-preview" className="v2-final__stage" role="group" aria-label="Пример кампании">
        <div className="v2-window__bar"><Smartphone size={16} aria-hidden="true" /> {step === 2 ? 'приложение билайна' : 'кабинет · кофейня «Зерно»'}</div>
        <motion.div key={step} className="v2-final__scene" initial={reduce ? false : { opacity: 0.45, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
          {step === 0 && <>
            <Segmented label="Радиус в примере запуска" value={rad} onChange={setRad} options={RADIUS_OPTIONS} />
            <div className="v2-final__map"><ReachMap points={POINTS} r={radius} radiusLabel={label} animateDots={false} /></div>
          </>}
          {step === 1 && <div className="v2-final__result">
            <span className="bl-caption">примерный охват</span>
            <strong className="bl-display-l">{n(reach(rad, when))}</strong>
            <span className="bl-body">человек в радиусе {label} от двух точек{WHEN[when][1]}</span>
          </div>}
          {step === 2 && <OfferPreview caption="так абонент увидит вашу акцию" />}
        </motion.div>
      </div>
      <div className="v2-final__action bl-stack">
        <div><CampaignAction className="bl-btn bl-btn--primary bl-btn--xl" describedBy="v2-login-hint">узнать охват</CampaignAction></div>
        <span id="v2-login-hint" className="bl-caption">{launch ? 'Начните с ИНН и телефона. Затем проверьте бизнес, добавьте точки и соберите оффер.' : <>Сначала откроется вход в кабинет. {mvp() ? 'Понадобятся рабочая почта и ИНН.' : 'Можно войти через Госуслуги или бизнес-ID.'}</>}</span>
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
        <Go to={login()}>зарегистрироваться</Go>
      </div>
      <div className="bl-accordion">
        {FAQ.map(([q, a], k) => <details key={q} open={k === 0}><summary>{q}</summary><div className="bl-accordion__body">{a}</div></details>)}
      </div>
    </section>
  )
}

export function SketchMetrics({ calm = false, pulse = false }: { calm?: boolean; pulse?: boolean } = {}) {
  const ref = useRef<HTMLElement>(null)
  const seen = useInView(ref, { once: true, amount: .65 })
  const inView = useInView(ref, { amount: .1 })
  const reduce = useLiveReducedMotion()
  const [pageVisible, setPageVisible] = useState(!document.hidden)
  const [dots] = useState(() => pulse ? Array.from({ length: 240 }, () => ({ duration: 2 + Math.random() * 1.5, delay: Math.random() })) : [])
  useEffect(() => {
    if (!pulse) return
    const update = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [pulse])
  const show = seen || reduce
  return <section ref={ref} className="bl-section bl-section--wide v2-sketch-metrics" data-theme="invert" data-pulsing={pulse && inView && pageVisible && !reduce} aria-labelledby="v3-metrics-title">
      {!pulse && <svg className="v2-sketch-metrics__crowd" viewBox="0 0 432 180" aria-hidden="true">
        <defs><linearGradient id="v3-metrics-scan"><stop stopColor="var(--color-brand-primary)" stopOpacity="0"/><stop offset=".5" stopColor="var(--color-brand-primary)" stopOpacity=".25"/><stop offset="1" stopColor="var(--color-brand-primary)" stopOpacity="0"/></linearGradient></defs>
        {Array.from({ length: 240 }, (_, i) => <circle key={i} cx={(i % 24) * 18 + 9} cy={Math.floor(i / 24) * 18 + 9} r="2" fill="currentColor" opacity={dim(i) * .5} />)}
          {!reduce && <motion.rect className="v2-sketch-metrics__scan" width="72" height="180" fill="url(#v3-metrics-scan)" initial={{ x: -72, opacity: 0 }} animate={seen ? { x: 432, opacity: [0, 1, 1, 0] } : { x: -72, opacity: 0 }} transition={{ duration: 1.6, delay: .15, ease: 'linear', opacity: { duration: 1.6, delay: .15, times: [0, .1, .85, 1] } }} />}
          {Array.from({ length: 240 }, (_, i) => lit(i, 0) && <motion.circle className="v2-sketch-metrics__match" key={i} cx={(i % 24) * 18 + 9} cy={Math.floor(i / 24) * 18 + 9} fill="var(--color-brand-primary)" initial={reduce ? false : { opacity: 0, r: 2 }} animate={show ? { opacity: 1, r: reduce ? 3.5 : [2, 5, 3.5] } : { opacity: 0, r: 2 }} transition={{ duration: reduce ? 0 : .45, delay: reduce ? 0 : ((i % 24) * 18 + 81) / 504 * 1.6 + .15, ease: 'easeOut' }} />)}
      </svg>}
      <div className="v2-sketch-metrics__intro"><h2 id="v3-metrics-title">ваши клиенты уже здесь</h2><p className="bl-body bl-secondary">Показывайте предложение абонентам билайна</p></div>
      {pulse && <CityAudienceMap timings={dots}/>}
      <dl>{([[35, ' млн', 'абонентов билайна'], [200, '', 'триггеров показа'], [15, '%', 'средняя конверсия']] as const).map(([value, suffix, label]) => <div key={label}><dt className="bl-body bl-secondary">{label}</dt><dd>{calm ? `${value}${suffix}` : <Num value={value} suffix={suffix} from={0}/>}</dd></div>)}</dl>
    </section>
}

function SketchIntro() {
  return <>
    <SketchMetrics />
    <section id="how" className="bl-section bl-section--wide">
      <h2 className="bl-display-l">как это работает</h2>
      <ol className="v2-sketch-how">
        <li><div className="v2-backdrop v2-backdrop--teal v2-sketch-art"><HowGraphic kind="business"/></div><h3 className="bl-h3">укажите ваш бизнес</h3><p className="bl-body bl-secondary">Введите ИНН и телефон, проверьте сведения и добавьте точки, куда приглашать клиентов.</p></li>
        <li><div className="v2-backdrop v2-backdrop--violet v2-sketch-art"><HowGraphic kind="offer"/></div><h3 className="bl-h3">соберите оффер</h3><p className="bl-body bl-secondary">Подготовьте предложение на основе данных бизнеса. Добавьте изображение, скидку или промокод.</p></li>
        <li><div className="v2-backdrop v2-backdrop--green v2-sketch-art"><HowGraphic kind="audience"/></div><h3 className="bl-h3">выберите клиентов</h3><p className="bl-body bl-secondary">Укажите, кому и в каких ситуациях показывать рекламу. От вашего района до всей страны.</p></li>
        <li><div className="v2-backdrop v2-backdrop--magenta v2-sketch-art"><HowGraphic kind="guests"/></div><h3 className="bl-h3">встречайте новых гостей</h3><p className="bl-body bl-secondary">Гости приходят за кофе и завтраком. Встречайте их с улыбкой и давайте повод вернуться.</p></li>
      </ol>
      <div className="v2-sketch-action"><Go to={login()}>запустить сейчас</Go></div>
    </section>
  </>
}

function SketchFinal() {
  return <section id="v2-final" className="bl-section bl-section--wide v2-sketch-final" data-theme="invert">
    <h2 className="bl-display-l">новый эффективный канал привлечения клиентов</h2>
    <CampaignAction className="bl-btn bl-btn--primary bl-btn--xl">запустить сейчас</CampaignAction>
  </section>
}

// Скрываем кнопку в шапке, когда посетитель уже видит одну из основных кнопок.
export function useHeaderCta() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const seen = new Map<Element, boolean>()
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => seen.set(entry.target, entry.isIntersecting))
      setShow(![...seen.values()].some(Boolean))
    }, { rootMargin: '-76px 0px 0px' })
    document.querySelectorAll('#v2-hero .bl-btn--primary, #v2-final .bl-btn--primary').forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])
  return show
}
const SKETCH_NAV: [string, string][] = [['how', 'как это работает'], ['where', 'где покажем'], ['cases', 'для кого']]
const NAV: [string, string][] = [['who', 'кому покажем'], ['price', 'цены'], ['v2-final', 'как запустить'], ['faq', 'вопросы']]
const go = (id: string) => document.getElementById(id)?.scrollIntoView({
  behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start',
})

export default function LandingV2({ onStart }: { onStart?: () => void } = {}) {
  const cta = useHeaderCta()
  const nav = onStart ? SKETCH_NAV : NAV
  const [rad, setRad] = useState(1)
  const [when, setWhen] = useState(0)
  return (
    <LaunchContext.Provider value={onStart}><div className="bl-page wrap v2">
      <a className="v2-skip-link" href="#v2-content" onClick={event => { event.preventDefault(); document.getElementById('v2-content')?.focus() }}>к содержимому</a>
      <header className="bl-header landing-head v2-head">
        <div className="bl-header__side"><Brand to={onStart ? '/v3' : mvp() ? '/mvp' : '/v2'} /></div>
        <nav className="bl-header__side bl-header__side--end" aria-label="Разделы лендинга">
          {nav.map(([id, t]) => <button key={id} type="button" className="bl-hide-mobile bl-btn" onClick={() => go(id)}>{t}</button>)}
          <details className="v2-mobile-nav" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.removeAttribute('open'); event.currentTarget.querySelector('summary')?.focus() } }}><summary className="bl-btn">разделы</summary><div>{nav.map(([id,t]) => <button key={id} type="button" className="bl-btn" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); go(id); const target = document.getElementById(id); target?.setAttribute('tabindex','-1'); target?.focus({preventScroll:true}) }}>{t}</button>)}</div></details>
          <AnimatePresence initial={false}>
            {cta && <motion.span key="cta" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}><CampaignAction className="bl-btn bl-btn--primary">узнать охват</CampaignAction></motion.span>}
          </AnimatePresence>
          <Link className="bl-btn bl-btn--dark" to={login()}>войти</Link>
        </nav>
      </header>
      <main id="v2-content" tabIndex={-1} className="bl-stack" style={{ ['--bl-gap' as string]: '16px' }}>
        <Hero />
        {onStart ? <>
          <SketchIntro />
          <Clients />
          <Everywhere />
          <ForEveryone />
          <Quote />
          <SketchFinal />
        </> : <>
        <AroundPoint rad={rad} setRad={setRad} when={when} setWhen={setWhen} />
        <Clients />
        <Audience />
        <Everywhere />
        <Chat />
        <Pricing />
        <Assistant />
        <ForEveryone />
        <Quote />
        <Faq />
        <Final rad={rad} setRad={setRad} when={when} />
        </>}

      </main>
      <footer className="footer bl-caption">
        <span>© 2026 партнёрская платформа билайна</span>
        <span className="bl-row" style={{ ['--bl-gap' as string]: '24px' }}><Link to="/offer">оферта</Link><Link to="/offer">обработка данных</Link></span>
      </footer>
    </div></LaunchContext.Provider>
  )
}
