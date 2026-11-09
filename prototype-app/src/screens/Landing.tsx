import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, BadgeCheck, CalendarDays, ChevronLeft, ChevronRight, Copy, Home, MapPin, Plane, ShieldCheck, Smartphone, Sparkles, UserPlus, Wallet } from 'lucide-react'
import { NICHES, n, rub } from '../data'
import { Bars, HBars, Trend } from '../charts'
import { DEMO_AD, PhoneSurface, type Surface } from '../mock'
import { Brand, Chip, IdBadge, Num, PartnerLogo, Photo, Reveal } from '../ui'
import { useCatalog, type S } from '../api'

const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

const MOMENTS = [
  { icon: Home, t: 'переехал в ваш район', tag: '30 дней', cls: 'bl-tag--soft-violet' },
  { icon: Wallet, t: 'платёж прошёл', tag: 'сейчас', cls: 'bl-tag--soft-blue' },
  { icon: CalendarDays, t: 'день зарплаты', tag: 'сегодня', cls: 'bl-tag--soft-green' },
  { icon: Plane, t: 'собирается в поездку', tag: 'через 9 дней', cls: 'bl-tag--soft-violet' },
  { icon: Smartphone, t: 'купил новый смартфон', tag: '24 часа', cls: 'bl-tag--soft-green' },
]

function useTicker(len: number, ms: number, paused = false) {
  const [i, setI] = useState(0)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce || paused) return
    const t = setInterval(() => setI(x => (x + 1) % len), ms)
    return () => clearInterval(t)
  }, [len, ms, reduce, paused])
  return [i, setI] as const
}

// Знаки по мотивам оригиналов. Официальные SVG положите в public/logos/{avito,alfabank,tbank}.svg — подхватятся сами.
const PARTNERS = [{ id: 'avito', t: 'Авито' }, { id: 'alfabank', t: 'Альфа-Банк' }, { id: 'tbank', t: 'Т-Банк' }] as const
function Hero() {
  const [i] = useTicker(MOMENTS.length, 2600)
  const m = MOMENTS[i]
  const [guest, setGuest] = useState(0)
  useEffect(() => { const t = setInterval(() => setGuest(g => g + 1), 4200); return () => clearInterval(t) }, [])
  return (
    <section className="hero">
      <div className="bl-stack hero__text" style={{ ['--bl-gap' as string]: '24px' }}>
        <motion.h1 className="bl-display-xl" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          реклама в&nbsp;момент, когда клиенту это нужно
        </motion.h1>
        <motion.p className="bl-lead" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
          Переехал, купил новый телефон, собирается в поездку, получил зарплату. Покажем ваш оффер именно тогда. Платите только за результат.
        </motion.p>
        <motion.div className="bl-row" style={{ ['--bl-gap' as string]: '20px', marginTop: 8 }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
          <Link className="bl-btn bl-btn--primary bl-btn--xl" to="/login">узнать охват</Link>
          <Link className="bl-btn bl-btn--ghost" to="/inn">без входа: ввести ИНН или сайт <ArrowRight size={18} /></Link>
        </motion.div>
        <div className="bl-row hero__ids">
          <span className="bl-caption">а ещё разместим у партнёров:</span>
          {PARTNERS.map(p => <span key={p.id} className="id-pill partner-pill"><PartnerLogo id={p.id} />{p.t}</span>)}
        </div>
      </div>

      <div className="hero__visual">
        <Photo name="hero.jpg" label="Владелица кофейни за стойкой смотрит в телефон" ratio="4 / 5" className="hero__photo" />
        <motion.div className="float-card float-card--reach" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4, duration: 0.6 }}>
          <span className="bl-caption">рядом с вашей точкой</span>
          <span className="bl-h2"><Num value={12400} from={0} /></span>
          <span className="bl-micro">подходящих людей в радиусе 1 км</span>
        </motion.div>
        <div className="float-card float-card--moment" aria-live="off">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={i} className="moment" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }} transition={{ duration: 0.35 }}>
              <span className="moment__icon"><m.icon size={18} /></span>
              <span className="moment__t">{m.t}</span>
              <span className={`bl-tag ${m.cls}`}>{m.tag}</span>
            </motion.div>
          </AnimatePresence>
        </div>
        <AnimatePresence>
          {guest > 0 && (
            <motion.div key={guest} className="float-card float-card--guest" initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
              <span className="guest-dot"><UserPlus size={16} /></span>
              <span><b className="bl-medium">+1 гость</b><span className="bl-micro" style={{ display: 'block' }}>пришёл по купону · {guest + 2} сегодня</span></span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}

function Facts() {
  const facts = [
    { v: 45, s: ' млн', t: 'абонентов билайна: приложение, ТВ, пуши' },
    { v: 19, s: '', t: 'сигналов: события жизни, место, деньги, момент на экране' },
    { v: 2, s: ' мин', t: 'на модерацию: ИИ проверяет текст до оплаты' },
    { v: 0, s: ' ₽', t: 'за показы: платите за клики, заявки или продажи' },
  ]
  return (
    <section className="bl-grid facts" style={{ ['--bl-cols' as string]: 4 }}>
      {facts.map((f, i) => (
        <Reveal key={f.t} delay={i * 0.08} className="bl-card bl-card--white fact">
          <span className="bl-display-l"><Num value={f.v} suffix={f.s} from={0} /></span>
          <span className="bl-body bl-secondary">{f.t}</span>
        </Reveal>
      ))}
    </section>
  )
}

function How() {
  const steps = [
    { t: 'войдите по бизнес-ID', d: 'Госуслуги, СберБизнес или Альфа. Компанию, точки и реквизиты узнаем сами.', ui: <div className="bl-row" style={{ gap: 6 }}>{(['gos', 'sber', 'alfa'] as const).map(id => <IdBadge key={id} id={id} />)}<BadgeCheck size={22} className="bl-success" /></div> },
    { t: 'выберите цель', d: 'Автопилот соберёт объявление с вашего сайта и Карт и подберёт места показа.', ui: <div className="bl-row" style={{ gap: 6 }}><span className="bl-chip is-active">соседи в точку</span><span className="bl-chip">конкуренты</span></div> },
    { t: 'платите за результат, смотрите визиты', d: 'Клики видно через час. Визиты в точку — через день-два.', ui: <Bars label="Пример: визиты по дням" height={64} fmt={v => `${v} визитов`} data={[4, 7, 6, 9, 12, 11, 15].map((v, i) => ({ label: `${i + 1} день`, value: v }))} /> },
  ]
  return (
    <section className="bl-section bl-section--wide" id="how">
      <div className="section-head"><h2 className="bl-display-l">запуск за 10 минут</h2><p className="bl-body bl-secondary" style={{ maxWidth: 380 }}>Без договора и ЭДО на старте. Оферта галочкой, оплата по СБП.</p></div>
      <div className="bl-grid" style={{ ['--bl-cols' as string]: 3 }}>
        {steps.map((s, i) => (
          <Reveal key={s.t} delay={i * 0.12} className="bl-card how-step">
            <span className="how-step__n">{i + 1}</span>
            <h3 className="bl-h3">{s.t}</h3>
            <p className="bl-body bl-secondary">{s.d}</p>
            <div className="how-step__ui">{s.ui}</div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function Moments() {
  const cards = [
    { photo: 'moment-move.jpg', label: 'Пара заносит коробки в новую квартиру', tag: 'событие', cls: 'bl-tag--soft-violet', t: 'жизненные моменты', d: 'переезд, новый смартфон, поездка, полис истекает' },
    { photo: 'moment-pay.jpg', label: 'Человек оплачивает покупку телефоном', tag: 'контекст', cls: 'bl-tag--soft-blue', t: 'момент на экране', d: 'платёж прошёл, трафик кончается, день зарплаты' },
    { photo: 'moment-street.jpg', label: 'Утренняя улица у дома, люди идут на работу', tag: 'место', cls: 'bl-tag--soft-green', t: 'место и маршруты', d: 'живут, работают или каждый день проходят мимо' },
    { photo: 'moment-regulars.jpg', label: 'Постоянный гость здоровается с бариста', tag: 'ваша база', cls: '', t: 'ваши клиенты', d: 'вернуть ушедших и найти похожих на лучших' },
  ]
  return (
    <section className="bl-section bl-section--wide" id="who">
      <div className="section-head"><h2 className="bl-display-l">кого найдём</h2><p className="bl-body bl-secondary" style={{ maxWidth: 380 }}>Данные абонентов не передаём. Вы выбираете момент, мы показываем оффер.</p></div>
      <div className="bl-grid" style={{ ['--bl-cols' as string]: 4 }}>
        {cards.map((c, i) => (
          <Reveal key={c.t} delay={i * 0.08} as="article" className="moment-card">
            <Photo name={c.photo} label={c.label} ratio="4 / 5"><span className={`bl-tag ${c.cls} moment-card__tag`}>{c.tag}</span></Photo>
            <h3 className="bl-h3">{c.t}</h3>
            <p className="bl-body bl-secondary">{c.d}</p>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

// Как оффер каждого типа выглядит у клиента. Тексты и условия — в OFFER_TYPES.
const OFFER_UI: Record<S['OfferType'], ReactNode> = {
  click: (
    <div className="pm-banner">
      <div className="ad-img ad-img--0">фото зала с Яндекс Карт</div>
      <div className="pm-banner__text"><b>{DEMO_AD.brand}</b><span>{DEMO_AD.text}</span></div>
      <span className="pm-btn">перейти</span>
      <span className="pm-label">реклама</span>
    </div>
  ),
  coupon: (
    <div className="pm-card offer-coupon">
      <span className="offer-coupon__off">−50%</span>
      <span className="offer-coupon__body"><b>капучино и круассан</b><span className="pm-muted">кофейня у дома · 300 м</span><span><b>350 ₽</b> <s className="pm-muted">700 ₽</s></span></span>
    </div>
  ),
  lead: (
    <div className="pm-card">
      <b>кредитная карта</b><span className="pm-muted">120 дней без процентов</span>
      <span className="offer-input">+7 900 000-00-00</span>
      <span className="pm-btn">оставить заявку</span>
    </div>
  ),
  promo: (
    <div className="pm-card">
      <span className="pm-muted">промокод на первый заказ</span>
      <span className="offer-code">BEE15 <Copy size={14} /></span>
      <b>−15% в магазине у дома</b>
    </div>
  ),
  sub: (
    <div className="pm-card">
      <span className="bl-row" style={{ justifyContent: 'space-between' }}><b>онлайн-кинотеатр</b><span className="offer-toggle" /></span>
      <b>30 дней бесплатно</b>
      <span className="pm-muted">потом 299 ₽ в месяц со счёта телефона</span>
    </div>
  ),
}

function Offers() {
  const { offerTypes } = useCatalog()
  const track = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ start: true, end: false })
  const onScroll = () => {
    const el = track.current
    if (el) setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 })
  }
  useEffect(onScroll, [])
  const step = (dir: number) => {
    const el = track.current, card = el?.querySelector<HTMLElement>('.offer-card:not(.is-main)')
    el?.scrollBy({ left: dir * ((card?.offsetWidth ?? 320) + 16), behavior: 'smooth' })
  }
  return (
    <section className="bl-section bl-section--wide" id="offers">
      <div className="section-head">
        <h2 className="bl-display-l">какие бывают офферы</h2>
        <div className="bl-row offers-head" style={{ ['--bl-gap' as string]: '24px' }}>
          <p className="bl-body bl-secondary" style={{ maxWidth: 380 }}>Основной — реклама с оплатой за переход. Для купонов, заявок и подписок есть свои схемы.</p>
          <span className="bl-row bl-hide-mobile" style={{ gap: 8 }}>
            <button className="bl-icon-btn" aria-label="Предыдущие офферы" disabled={edge.start} onClick={() => step(-1)}><ChevronLeft /></button>
            <button className="bl-icon-btn" aria-label="Следующие офферы" disabled={edge.end} onClick={() => step(1)}><ChevronRight /></button>
          </span>
        </div>
      </div>
      <div className="offers-track" ref={track} onScroll={onScroll} tabIndex={0} role="region" aria-label="Типы офферов, прокрутка вбок">
        {offerTypes.map(({ id, ...o }) => (
          <article key={id} className={`bl-card offer-card${id === 'click' ? ' bl-card--yellow is-main' : ''}`}>
            <div className="offer-card__screen" aria-hidden="true">{OFFER_UI[id]}</div>
            {id === 'click' && <span className="bl-tag bl-tag--dark offer-card__tag">основной</span>}
            <h3 className="bl-h3">{o.t}</h3>
            <p className="bl-body bl-secondary">{o.d}</p>
            <dl className="offer-card__terms">
              <div><dt>клиент получает</dt><dd>{o.gets}</dd></div>
              <div><dt>вы платите</dt><dd>{o.pay}</dd></div>
            </dl>
            <p className="bl-caption">подходит: {o.fit}</p>
            <Link className={`bl-btn bl-btn--l bl-btn--block ${id === 'click' ? 'bl-btn--dark' : 'bl-btn--primary'}`} to={`/login?type=${id}`}>{o.cta}</Link>
          </article>
        ))}
      </div>
    </section>
  )
}

const SURFACES: { id: Surface; t: string; d: string }[] = [
  { id: 'showcase', t: 'Лучшее рядом', d: 'витрина скидок от мест вокруг: люди приходят за выгодой, самый высокий отклик' },
  { id: 'paid', t: '«Платёж прошёл»', d: 'один показ в момент полного внимания' },
  { id: 'rest', t: 'Экран остатков', d: 'гость получает гигабайты за визит к вам' },
  { id: 'main', t: 'Главная приложения', d: 'широкий охват каждый день' },
]
function Where() {
  const { places } = useCatalog()
  const [hover, setHover] = useState(false)
  const [i, setI] = useTicker(SURFACES.length, 3600, hover)
  const cur = SURFACES[i]
  const ctr = places.filter(p => p.ctr !== null).map(p => ({ id: p.id, label: p.t, value: p.ctr! }))
  return (
    <section className="bl-section bl-section--wide" id="where" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="section-head"><h2 className="bl-display-l">где увидят</h2><p className="bl-body bl-secondary" style={{ maxWidth: 380 }}>Семь мест в приложении билайна, на ТВ и в пушах. Автопилот выберет лучшие под вашу цель.</p></div>
      <div className="where">
        <div className="bl-stack" style={{ ['--bl-gap' as string]: '8px' }} role="tablist" aria-label="Места показа">
          {SURFACES.map((s, k) => (
            <button key={s.id} role="tab" aria-selected={k === i} className={`where__item${k === i ? ' is-on' : ''}`} onClick={() => setI(k)}>
              <span className="bl-h4">{s.t}</span>
              <span className="bl-caption">{s.d}</span>
              {k === i && !hover && <motion.span className="where__progress" layoutId="prog" />}
            </button>
          ))}
          <div className="bl-row" style={{ marginTop: 8 }}>{['пуш по согласию', 'магазин', 'меню ТВ с QR'].map(t => <span key={t} className="bl-chip">{t}</span>)}</div>
        </div>
        <div className="where__phone">
          <AnimatePresence mode="wait">
            <motion.div key={cur.id} initial={{ opacity: 0, y: 24, rotate: -1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.4 }}>
              <PhoneSurface kind={cur.id} />
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="bl-stack" style={{ ['--bl-gap' as string]: '12px' }}>
          <h3 className="bl-h4">средний CTR по местам показа</h3>
          <HBars label="Средний CTR по местам показа, процентов" data={ctr} hi={cur.id} fmt={v => `${v.toLocaleString('ru-RU')} %`} onPick={id => { const k = SURFACES.findIndex(s => s.id === id); if (k >= 0) setI(k) }} />
          <p className="bl-micro">Меню ТВ оплачивается за показы, поэтому его в графике нет. Пуши получают только те, кто согласился на рекламу.</p>
        </div>
      </div>
    </section>
  )
}

function Calc() {
  const [budget, setBudget] = useState(10000)
  const [niche, setNiche] = useState(NICHES[0])
  const clicks = budget / niche.cpc, visits = clicks * niche.conv
  const curve = [0, 0.18, 0.42, 0.7, 1]
  const data = curve.map((k, i) => ({ label: i === 0 ? 'старт' : `${i} неделя`, value: Math.round(visits * k) }))
  return (
    <section className="bl-section bl-section--wide" id="calc">
      <div className="calc">
        <div className="bl-stack" style={{ ['--bl-gap' as string]: '28px' }}>
          <h2 className="bl-display-l">посчитайте, сколько придёт</h2>
          <div className="bl-field"><span className="bl-field__label">ваша сфера</span><div className="bl-row">{NICHES.map(x => <Chip key={x.id} on={x.id === niche.id} onClick={() => setNiche(x)}>{x.t}</Chip>)}</div></div>
          <label className="bl-field">
            <span className="bl-field__label">бюджет в месяц: <b className="bl-medium">{rub(budget)}</b></span>
            <input className="bl-range" type="range" min={3000} max={100000} step={1000} value={budget} onChange={e => setBudget(+e.target.value)} aria-label="Бюджет в месяц" />
          </label>
          <div className="bl-row" style={{ ['--bl-gap' as string]: '48px' }}>
            <div className="bl-stat"><span className="bl-stat__value"><Num value={clicks} /></span><span className="bl-stat__label">кликов</span></div>
            <div className="bl-stat"><span className="bl-stat__value"><Num value={niche.cpc} suffix=" ₽" /></span><span className="bl-stat__label">средний клик</span></div>
            <div className="bl-stat"><span className="bl-stat__value"><Num value={visits ? budget / visits : 0} suffix=" ₽" /></span><span className="bl-stat__label">один {niche.unit === 'гостей' ? 'гость' : 'клиент'}</span></div>
          </div>
        </div>
        <div className="bl-card calc__result" data-theme="invert">
          <span className="bl-caption">придут к вам за месяц</span>
          <span className="bl-number-xl"><Num value={visits} /> {niche.unit}</span>
          <Trend invert label="Накопленные визиты по неделям" data={data} fmt={v => `${n(v)} ${niche.unit}`} height={170} />
          <span className="bl-caption">Расчёт по средним ставкам в сфере. Точный охват по вашим точкам покажем после входа.</span>
          <div><Link className="bl-btn bl-btn--dark bl-btn--l" to="/login">узнать точный охват</Link></div>
        </div>
      </div>
    </section>
  )
}

function Cases() {
  const cases = [
    { photo: 'case-coffee.jpg', label: 'Кофейня с гостями у стойки', k: 'кофейня, 2 точки', v: 280, unit: 'гостей за 10 000 ₽', d: 'Показывали тем, кто живёт и работает в километре. Каждый третий вернулся.', data: [12, 30, 44, 61, 70, 82, 96] },
    { photo: 'case-auto.jpg', label: 'Автосервис, смена шин', k: 'автосервис', v: 72, unit: 'записи в первые холода', d: 'Водители рядом с сервисом в неделю, когда ночью пошёл минус.', data: [2, 3, 5, 14, 22, 15, 11] },
    { photo: 'case-dev.jpg', label: 'Офис продаж жилого комплекса', k: 'застройщик', v: 178, unit: 'визитов в офис продаж', d: 'Те, кто переезжает или получил одобрение ипотеки в соседнем банке.', data: [8, 15, 21, 26, 30, 36, 42] },
  ]
  return (
    <section id="cases" className="bl-stack" style={{ ['--bl-gap' as string]: '24px' }}>
      <h2 className="bl-display-l cases-title">уже работает</h2>
      <div className="bl-grid" style={{ ['--bl-cols' as string]: 3 }}>
        {cases.map((c, i) => (
          <Reveal key={c.k} delay={i * 0.1} as="article" className="bl-card bl-card--white case">
            <Photo name={c.photo} label={c.label} ratio="16 / 10" />
            <span className="bl-caption">{c.k}</span>
            <h3 className="bl-h2"><Num value={c.v} /> <span className="bl-h3">{c.unit}</span></h3>
            <Trend axis={false} height={64} label={`Динамика: ${c.unit}`} fmt={v => `${v} за неделю`} data={c.data.map((v, k) => ({ label: `${k + 1} неделя`, value: v }))} />
            <p className="bl-body bl-secondary">{c.d}</p>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function Plans() {
  return (
    <section className="bl-section bl-section--wide" id="price">
      <div className="section-head"><h2 className="bl-display-l">начните с малого</h2><p className="bl-body bl-secondary" style={{ maxWidth: 380 }}>Показ бесплатный. Платите за клики, заявки или комиссию с продаж — зависит от типа оффера. Остановить можно в любой момент.</p></div>
      <div className="bl-grid" style={{ ['--bl-cols' as string]: 3 }}>
        <article className="bl-shell">
          <div className="bl-shell__head"><div><div className="bl-shell__title">автопилот</div><div className="bl-shell__sub">для кофеен, салонов, сервисов</div></div></div>
          <div className="bl-shell__body"><h3 className="bl-h3">выберите цель, остальное сделаем сами</h3><p className="bl-caption">объявление с сайта и Карт, места показа подберём</p><div style={{ flex: 1 }} /><div className="bl-price">от 3 000 ₽</div><Link className="bl-btn bl-btn--dark bl-btn--block" to="/login">запустить</Link></div>
        </article>
        <article className="bl-shell bl-shell--accent">
          <div className="bl-shell__head"><div><div className="bl-shell__title">вручную</div><div className="bl-shell__sub">для маркетологов и агентств</div></div><span className="bl-tag">хит</span></div>
          <div className="bl-shell__body"><h3 className="bl-h3">19 сигналов, свои аудитории и места</h3><p className="bl-caption">«горячий спрос 24 ч», условия «и» и «кроме», отчёт по каждому сигналу</p><div style={{ flex: 1 }} /><div className="bl-price">от 30 000 ₽</div><Link className="bl-btn bl-btn--dark bl-btn--block" to="/login">настроить</Link></div>
        </article>
        <article className="bl-shell">
          <div className="bl-shell__head"><div><div className="bl-shell__title">медиаплан</div><div className="bl-shell__sub">для крупного бизнеса</div></div></div>
          <div className="bl-shell__body"><h3 className="bl-h3">план для согласования и спецпроекты</h3><p className="bl-caption">Excel и PDF, игры, свой раздел, менеджер</p><div style={{ flex: 1 }} /><div className="bl-price">по запросу</div><Link className="bl-btn bl-btn--block" to="/login">обсудить</Link></div>
        </article>
      </div>
    </section>
  )
}

function Faq() {
  const q = [
    ['нужен ли договор и ЭДО?', 'Нет. Оферту принимаете галочкой при оплате. ЭДО подключите позже, для закрывающих документов.'],
    ['как оплатить?', 'СБП для бизнеса или бизнес-картой за секунды. Средний и крупный бизнес может платить по счёту.'],
    ['зачем входить через Госуслуги или банк?', 'Так мы сразу узнаём вашу компанию и точки, показываем точный охват и заполняем реквизиты сами.'],
    ['какие данные я увижу?', 'Клики, визиты в точку, повторные визиты и цену гостя. Данные абонентов не передаём.'],
    ['что, если не сработает?', 'Без результата не платите: нет кликов, заявок или продаж — нет списаний. Кампанию можно остановить в один клик, остаток баланса вернём.'],
  ]
  return (
    <section className="bl-section" id="faq">
      <h2 className="bl-display-l" style={{ textAlign: 'center', marginBottom: 'var(--space-4xl)' }}>можно спросить</h2>
      <div className="bl-accordion">{q.map(([t, a], i) => <details key={t} open={i === 0}><summary>{t}</summary><div className="bl-accordion__body">{a}</div></details>)}</div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="final" data-theme="invert">
      <div className="bl-stack final__text" style={{ ['--bl-gap' as string]: '24px' }}>
        <h2 className="bl-display-l">первые клики уже сегодня</h2>
        <p className="bl-lead">Покажем охват по вашим точкам до оплаты. Первая кампания — с бонусом 3 000 ₽ на баланс.</p>
        <div className="bl-row" style={{ ['--bl-gap' as string]: '16px' }}>
          <Link className="bl-btn bl-btn--dark bl-btn--l" to="/login">узнать охват <ArrowRight size={18} /></Link>
          <span className="bl-row bl-caption" style={{ gap: 6 }}><ShieldCheck size={16} /> данные абонентов не передаём</span>
        </div>
      </div>
      <Photo name="cta.jpg" label="Владелец пекарни с телефоном у витрины" ratio="4 / 3" className="final__photo" />
    </section>
  )
}

export default function Landing() {
  return (
    <>
      <div className="bl-topbar"><Sparkles size={14} /> первая кампания с бонусом 3 000 ₽ на баланс</div>
      <div className="bl-page wrap">
        <header className="bl-header landing-head">
          <div className="bl-header__side"><Brand /></div>
          <nav className="bl-header__side bl-header__side--end" aria-label="Разделы лендинга">
            <button className="bl-hide-mobile bl-btn" onClick={() => go('how')}>как это работает</button>
            <button className="bl-hide-mobile bl-btn" onClick={() => go('where')}>где покажем</button>
            <button className="bl-hide-mobile bl-btn" onClick={() => go('calc')}>расчёт</button>
            <Link className="bl-btn bl-btn--dark" to="/login">войти</Link>
          </nav>
        </header>
        <main className="bl-stack" style={{ ['--bl-gap' as string]: '24px' }}>
          <Hero />
          <Facts />
          <How />
          <Moments />
          <Offers />
          <Where />
          <Calc />
          <Cases />
          <Plans />
          <Faq />
          <FinalCta />
        </main>
        <footer className="footer bl-caption">
          <span>© 2026 партнёрская платформа билайна</span>
          <span className="bl-row" style={{ ['--bl-gap' as string]: '24px' }}><Link to="/offer">оферта</Link><Link to="/offer">обработка данных</Link><span className="bl-row" style={{ gap: 4 }}><MapPin size={14} /> Москва</span></span>
        </footer>
      </div>
    </>
  )
}
