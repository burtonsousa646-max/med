import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowUp, CircleCheck, LayoutGrid, Map as MapIcon, MapPin, Sparkles, X } from 'lucide-react'
import logoUrl from '../../../design-system/assets/beeline-logo.svg'
import { $api, act, useCampaigns, useCompany, type Campaign, type S } from '../api'
import { CATS, Creative, CrImg, creativeOf, type Cat } from '../creative'
import { Check, Chip, Modal, Qr, Segmented, SubscriberBadge, copy, toast } from '../ui'

/* Витрина «лучшее рядом»: предложения партнёров вокруг абонента, по мотивам раздела «Город» в Т-Банке.
   Демо: рядом с выдуманными партнёрами показываются запущенные кампании демо-компании из кабинета,
   а кнопки абонента по ним уходят в кабинет через POST /showcase/{id}/act. */

import { OFFERS, nb, type Offer } from './near-offers'
export { OFFERS, type Offer } from './near-offers'

// Разделы каталога, пока фильтры не выбраны. Все одного вида — ряд с прокруткой, как в «Городе» Т-Банка:
// ритм даёт только широкая карточка, которую купил партнёр
const SECTIONS: { t: string; cats: Cat[] }[] = [
  { t: 'магазины у дома', cats: ['grocery'] },
  { t: 'еда и кофе', cats: ['food'] },
  { t: 'красота и здоровье', cats: ['beauty', 'health'] },
  { t: 'авто', cats: ['auto'] },
  { t: 'дом и дети', cats: ['home', 'kids'] },
  { t: 'спорт и развлечения', cats: ['sport', 'fun'] },
]
const BANNER_AFTER = 1 // подборка билайна — после второго раздела, одна на страницу

// Как тип оффера называется для абонента. Типы те же, что в кабинете партнёра
const TYPES: Record<S['OfferType'], { t: string; tag: string }> = {
  click: { t: 'на сайте', tag: 'bl-tag--soft-blue' }, coupon: { t: 'купон', tag: 'bl-tag--soft-green' }, promo: { t: 'промокод', tag: 'bl-tag--soft-violet' },
  lead: { t: 'запись', tag: '' }, sub: { t: 'подписка', tag: 'bl-tag--soft-blue' },
}
const cta = (o: Offer) => ({ click: 'перейти на сайт', coupon: `купить за ${o.price ?? 0} ₽`, promo: 'показать промокод', lead: 'оставить заявку', sub: 'попробовать бесплатно' })[o.type]

export const RADII = [500, 1000, 3000]
// ponytail: номер и баланс демо-абонента, в бою — из профиля и биллинга
const PHONE = '+7 903 ••• 45 67', BALANCE = 640
type Filter = { cats: Cat[] | null; radius: number } // cats: null — все категории
// Персональные по сигналам билайна; причину абонент видит
const FOR_YOU: [string, string][] = [['p5-new', 'рядом открылся магазин'], ['chisto', 'ты недавно переехал'], ['nogti', 'сегодня зарплата']]

export const km = (m: number) => (m < 1000 ? `${m} м` : `${+(m / 1000).toFixed(1)} км`.replace('.', ','))
const walk = (m: number) => `${Math.max(1, Math.round(m / 80))} мин пешком`
const days = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'день' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'дня' : 'дней'}`
export const tillDate = (o: Offer) => typeof o.till === 'number' ? new Date(Date.now() + o.till * 864e5).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : o.till
// срок в окне оффера: срочные выделены, у кампании из кабинета срока нет
const Till = ({ o }: { o: Offer }) => o.campaign ? null
  : typeof o.till === 'number' ? <span className="bl-tag bl-tag--accent">{o.till ? `ещё ${days(o.till)}` : 'последний день'}</span>
  : <span className="bl-caption">до {o.till}</span>
// под карточкой: расстояние и срок — только если скоро кончается
const Where = ({ o }: { o: Offer }) => <span className="bl-caption">{km(o.dist)}{typeof o.till === 'number' && <b className="near-soon"> · {o.till ? `ещё ${days(o.till)}` : 'последний день'}</b>}</span>

// ponytail: адрес и часы выдуманы по id и категории, в бою придут из точек партнёра в кабинете
const STREETS = ['ул. Плющиха', 'Комсомольский пр-т', 'ул. Льва Толстого', 'Зубовский б-р', 'ул. Усачёва', 'Фрунзенская наб.', 'ул. Россолимо', 'Смоленская ул.']
const HOURS: Record<Cat, string> = { grocery: '8:00–23:00', food: '8:00–22:00', beauty: '10:00–21:00', health: '8:00–21:00', auto: '9:00–21:00', home: '9:00–21:00', sport: '7:00–23:00', kids: '10:00–20:00', fun: '10:00–00:00' }
const addrOf = (o: Offer) => {
  const h = [...o.id].reduce((x, c) => x + c.charCodeAt(0), 0)
  return o.addr ?? `${STREETS[h % STREETS.length]}, ${(h % 40) + 1}`
}
export const erid = (o: Offer) => (o.campaign ? '2SDnjc7Xy3M' : `2VSb5${o.id.replace('-', '').slice(0, 6)}`) // у кампании — erid со шага маркировки
// плашка «для клиентов» с логотипом билайна: логотип читается скринридером как «билайн»
const Bee = ({ o }: { o: Offer }) => o.bee ? <SubscriberBadge/> : null
const Tag = ({ o }: { o: Offer }) => <span className={`bl-tag ${TYPES[o.type].tag}`}>{TYPES[o.type].t}</span>

export function fromCampaign(c: Campaign, i: number, brand: string, addr?: string): Offer {
  return {
    ...creativeOf(brand, c.deal.offer, c.img), id: `c${c.id}`, type: c.type, partner: brand, title: c.adText, cond: 'подробности расскажет партнёр', addr,
    dist: 300 + i * 40, a: 160 + i * 30, till: 'пока идёт кампания', code: c.terms.code, price: +c.terms.price || undefined, campaign: c, wide: c.wideCard,
  }
}

export default function Near() {
  const co = useCompany(), campaigns = useCampaigns()
  const addr = co.points.find(p => p.active)?.addr
  const own = campaigns.filter(c => c.status === 'live' && c.places.showcase).map((c, i) => fromCampaign(c, i, co.brand, addr))
  const all = [...own, ...OFFERS]
  const [f, setF] = useState<Filter>({ cats: null, radius: 1000 })
  const [viewed, setViewed] = useState<string[]>([]) // что абонент открывал — ИИ-поиск не советует это первым
  const [hot, setHot] = useState<string>()
  const [mapOpen, setMapOpen] = useState(false) // карта — по кнопке, в ленте её нет
  const [params, setParams] = useSearchParams()
  const open = all.find(o => o.id === params.get('offer'))
  const show = (id?: string) => { setParams(id ? { offer: id } : {}, { replace: true }); if (id && !viewed.includes(id)) setViewed([...viewed, id]) }
  const set = (x: Partial<Filter>) => setF({ ...f, ...x })
  // фильтр из подборки, раздела или баннера: сразу показываем результат, а не оставляем его ниже экрана
  const go = (x: Partial<Filter>) => { set(x); requestAnimationFrame(() => document.getElementById('near-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }
  const reset = () => setF({ cats: null, radius: 1000 })

  const filtered = !!f.cats
  const fits = (o: Offer) => !f.cats || f.cats.includes(o.cat)
  const list = all.filter(o => fits(o) && o.dist <= f.radius).sort((x, y) => x.dist - y.dist)
  const scale = (m: number) => (m / f.radius) * 44 // граница радиуса всегда на 44 % меньшей стороны карты
  const catName = f.cats && (SECTIONS.find(sec => sec.cats.join() === f.cats!.join())?.t ?? f.cats.map(c => CATS[c][0]).join(', '))

  // пусто в радиусе — подсказываем ближайшее за ним и радиус, в который оно попадёт
  const next = all.filter(o => fits(o) && o.dist > f.radius).sort((x, y) => x.dist - y.dist)[0]
  const wider = next && RADII.find(r => r >= next.dist)
  const empty = (
    <div className="near-empty">
      {next && wider
        ? <><p className="bl-body bl-secondary">в радиусе {km(f.radius)} ничего нет. Ближайшее — {next.partner}, {km(next.dist)}</p>
            <button className="bl-btn bl-btn--s" onClick={() => set({ radius: wider })}>искать в {km(wider)}</button></>
        : <><p className="bl-body bl-secondary">по этим условиям ничего не нашлось</p>
            <button className="bl-btn bl-btn--s" onClick={reset}>сбросить фильтры</button></>}
    </div>
  )

  return (
    <div className="bl-page near">
      <header className="bl-header">
        <div className="bl-header__side">
          <button className="bl-btn bl-btn--s" onClick={() => toast('Район определяем по сети билайна, можно выбрать другой')}><MapPin size={18} />Хамовники</button>
        </div>
        <img className="bl-logo" src={logoUrl} alt="билайн" width={44} height={44} />
        <div className="bl-header__side bl-header__side--end" />
      </header>

      <main className="near-main">
        <section className="near-hero" aria-labelledby="near-title">
          <div className="bl-stack" style={{ ['--bl-gap' as string]: '8px' }}>
            <h1 className="bl-h1" id="near-title">Лучшее рядом</h1>
            <p className="bl-h4">Скидки, купоны и промокоды в твоём районе</p>
          </div>
          <Ask all={all} viewed={viewed} onOpen={show} />
        </section>

        <div className="near-scroller" role="group" aria-label="Категории">
          <Chip on={!f.cats} onClick={() => set({ cats: null })}><LayoutGrid size={18} />всё</Chip>
          {(Object.entries(CATS) as [Cat, (typeof CATS)[Cat]][]).map(([k, [t, Icon]]) => (
            <Chip key={k} on={f.cats?.length === 1 && f.cats[0] === k} onClick={() => set({ cats: [k] })}><Icon size={18} />{t}</Chip>
          ))}
        </div>

        {!filtered && (
          <section className="bl-stack" style={{ ['--bl-gap' as string]: '12px' }} aria-labelledby="fy-h">
            <h2 className="bl-h3" id="fy-h">для тебя сегодня</h2>
            <div className="near-fy">
              {FOR_YOU.map(([id, why]) => {
                const o = OFFERS.find(x => x.id === id)!
                return (
                  <button key={id} className="bl-card bl-card--white near-card" onClick={() => show(id)}>
                    <Creative o={o} erid={erid(o)} wide />
                    <span className="near-card__body">
                      <span className="near-card__line"><span className="bl-tag bl-tag--soft-violet">{why}</span><span className="bl-caption">{km(o.dist)}</span><Bee o={o} /></span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* одна строка фильтров: что выбрано — видно и снимается крестиком */}
        <div id="near-results" className="near-toolbar">
          <div className="near-toolbar__state" aria-live="polite">
            {filtered
              ? <h2 className="bl-h3">нашлось <span className="bl-secondary">{list.length}</span></h2>
              : <span className="bl-caption">{list.length} мест в радиусе {km(f.radius)}</span>}
            {f.cats && f.cats.length > 1 && <Chip on onClick={() => set({ cats: null })}>{catName}<X size={16} aria-label="убрать" /></Chip>}
            {(filtered || f.radius !== 1000) && <button className="bl-btn bl-btn--s bl-btn--ghost" onClick={reset}>сбросить всё</button>}
          </div>
          <div className="near-toolbar__ctl">
            <button className="bl-btn near-mapbtn" aria-pressed={mapOpen} onClick={() => setMapOpen(!mapOpen)}><MapIcon size={18} />{mapOpen ? 'скрыть карту' : 'на карте'}</button>
            <Segmented label="Радиус" value={f.radius} options={RADII.map(r => [r, km(r)])} onChange={radius => set({ radius })} />
          </div>
        </div>

        {/* карта и ближайшие — по кнопке: в ленте они повторяли карточки разделов */}
        {mapOpen && list.length > 0 && (
          <section className="bl-section near-box" aria-label="Карта предложений">
            <div className="near-box__grid">
              <div className="near-map" style={{ '--r': 44 } as CSSProperties}>
                <svg viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                  <path d="M-20 330 C 120 290, 220 360, 360 320 S 560 250, 640 290" fill="none" stroke="var(--color-surface-03)" strokeWidth="34" />
                  <rect x="380" y="40" width="150" height="110" rx="24" fill="var(--color-surface-01)" />
                  <rect x="60" y="60" width="90" height="70" rx="16" fill="var(--color-surface-01)" />
                  <g stroke="var(--color-background-secondary)" strokeWidth="12" fill="none" strokeLinecap="round"><path d="M0 200 H600M300 0 V400M0 70 L600 150M120 0 L200 400M460 0 L420 400" /></g>
                  <g stroke="var(--color-background-secondary)" strokeWidth="5" fill="none"><path d="M0 260 H600M0 120 H600M60 0 V400M380 0 V400M540 0 V400M220 0 V400" /></g>
                </svg>
                <div className="near-map__ring" />
                {/* метка — точка цвета карточки партнёра, при наведении раскрывается в выгоду */}
                {list.map(o => {
                  const rad = (o.a * Math.PI) / 180
                  return (
                    <button key={o.id} className={`near-pin cr--${o.tone}${hot === o.id ? ' is-hot' : ''}${o.campaign ? ' is-own' : ''}`} aria-label={`${o.partner}: ${o.title}`}
                      onClick={() => show(o.id)} onPointerEnter={() => setHot(o.id)} onPointerLeave={() => setHot(undefined)}
                      style={{ '--dx': (Math.cos(rad) * scale(o.dist)).toFixed(1), '--dy': (Math.sin(rad) * scale(o.dist)).toFixed(1) } as CSSProperties}>
                      <span className="near-pin__big">{o.big}</span>
                    </button>
                  )
                })}
                <div className="near-map__me" title="ты здесь" />
                <span className="bl-pill-dark near-map__note">по геоданным билайна, без доступа к GPS</span>
              </div>
              <div className="near-list" onPointerLeave={() => setHot(undefined)}>
                {list.slice(0, 6).map(o => (
                  <button key={o.id} className="bl-cell near-cell" onClick={() => show(o.id)} onPointerEnter={() => setHot(o.id)}>
                    <Tile o={o} className="near-cell__tile" />
                    <span className="bl-cell__main"><span className="bl-cell__title">{o.title}</span><span className="bl-cell__sub">{o.partner}</span></span>
                    <span className="near-cell__end"><span className="bl-caption">{km(o.dist)}</span><Tag o={o} /></span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {!list.length && empty}
        {/* человек ищет — одна ровная сетка */}
        {filtered && list.length > 0 && <div className="bl-grid near-found" style={{ ['--bl-cols' as string]: 4 }}>{list.map(o => <Card key={o.id} o={o} onOpen={show} />)}</div>}

        {!filtered && SECTIONS.map((sec, i) => {
          // широкие карточки первыми, дальше по расстоянию; показанное в «для тебя» не повторяем
          const items = list.filter(o => sec.cats.includes(o.cat) && !FOR_YOU.some(([id]) => id === o.id)).sort((x, y) => +!!y.wide - +!!x.wide)
          return [
            items.length > 0 && (
              <section key={sec.t} className="bl-stack" style={{ ['--bl-gap' as string]: '16px' }}>
                <div className="bl-row" style={{ justifyContent: 'space-between' }}>
                  <h2 className="bl-h3">{sec.t} <span className="bl-secondary">{items.length}</span></h2>
                  <button className="bl-btn bl-btn--ghost" onClick={() => go({ cats: sec.cats })}>все →</button>
                </div>
                <div className="near-scroller near-carousel">
                  {items.map(o => <Card key={o.id} o={o} wide={o.wide} onOpen={show} />)}
                  {sec.cats.includes('food') && <Invite />}
                </div>
              </section>
            ),
            i === BANNER_AFTER && (
              <section key="banner" className="bl-card near-banner" data-theme="invert">
                <span className="bl-stack" style={{ ['--bl-gap' as string]: '8px' }}>
                  <span className="bl-caption">подборка билайна</span>
                  <span className="bl-h2">переезд без хлопот</span>
                  <span className="bl-body bl-secondary">уборка, мастер на час и новые замки — всё в паре километров от нового дома</span>
                </span>
                <button className="bl-btn bl-btn--dark bl-btn--l" onClick={() => go({ cats: ['home'], radius: 3000 })}>смотреть подборку</button>
              </section>
            ),
          ]
        })}
      </main>

      <footer className="near-foot bl-caption">
        <span>Реклама. Скидки и условия предоставляют партнёры, билайн показывает их абонентам.</span>
        <Link to="/">разместить своё предложение</Link>
      </footer>

      <Modal open={!!open} onClose={() => show()} label={open?.title ?? 'Предложение'}>
        {open && <Sheet key={open.id} o={open} />}
      </Modal>
    </div>
  )
}

/* ───────── ИИ-поиск: абонент пишет обычными словами, Claude подбирает офферы и предлагает уточнения ───────── */
type Answer = S['AskAnswer'] & { why?: Record<string, string> }
type Turn = S['AskTurn'] & { answer?: Answer }
const askOffer = (o: Offer): S['AskOffer'] => ({
  id: o.id, partner: o.partner, title: o.title, small: o.small, cat: o.cat, type: o.type, dist: o.dist, price: o.price,
  till: typeof o.till === 'number' ? `ещё ${days(o.till)}` : o.till, bee: !!o.bee,
})
// подсказки до первого вопроса — из времени суток и сигналов абонента
const starters = () => {
  const h = new Date().getHours()
  return [h < 11 ? 'кофе и завтрак по пути' : h < 16 ? 'недорого пообедать' : 'куда сходить вечером', 'всё для новой квартиры', 'порадовать себя в зарплату', 'подготовить машину к зиме']
}
const EXAMPLES = ['поужинать до 500 ₽', 'подарок маме', 'переобуть машину', 'чем занять ребёнка', 'постричься недорого', 'квест с друзьями']

/* мок ИИ для стенда: без ключа сервер отвечает поиском по словам, а прототип отвечает так, как ответил бы ИИ —
   понимает смысл (стрижка → красота), учитывает «до N ₽», «недорого», «рядом» и объясняет, почему выбрал.
   ponytail: словарь намерений вместо модели; с ключом ответ source: 'ai' идёт как есть */
const INTENTS: { re: RegExp; cats: Cat[]; say: string; more: string[]; like?: RegExp }[] = [
  { re: /стри[жч]|парикмах|барбер|маникюр|ногт|красот|причёс|бород/, cats: ['beauty'], say: 'Нашёл, где привести себя в порядок', more: ['сегодня вечером', 'подешевле', 'только с билайном'] },
  { re: /подар|порадов|мам|зарплат|праздн/, cats: ['beauty', 'fun', 'grocery'], say: 'Есть чем порадовать — от цветов до маникюра', more: ['до 1 500 ₽', 'с доставкой', 'впечатления'], like: /букет|маникюр|билет|квест/ },
  { re: /вечер|сходить|развлеч|кино|отдохн|компани|друз|квест|выходн/, cats: ['fun', 'food'], say: 'На вечер — кино, квест или ужин рядом', more: ['вдвоём', 'с компанией', 'до 1 000 ₽'], like: /билет|квест|боулинг/ },
  { re: /поесть|поужин|ужин|обед|ланч|завтрак|кофе|голод|пицц|перекус|шаурм/, cats: ['food'], say: 'Вот где вкусно поесть рядом', more: ['до 300 ₽', 'с собой', 'открыто сейчас'] },
  { re: /машин|авто|шин|переоб|мойк|зим|бензин|заправ|топлив/, cats: ['auto'], say: 'Для машины перед зимой — переобувка, мойка и заправка', more: ['без очереди', 'по будням', 'ближе'] },
  { re: /квартир|переезд|ремонт|уборк|замк|полк|мастер/, cats: ['home'], say: 'Для новой квартиры — уборка, мастер и замки', more: ['на выходных', 'подешевле', 'ближе'] },
  { re: /ребён|ребен|дет|сын|доч|малыш/, cats: ['kids'], say: 'Для детей — занятия и игрушки рядом', more: ['4–6 лет', 'бесплатно', 'в субботу'] },
  { re: /спорт|фитнес|зал|трениров|похуд/, cats: ['sport'], say: 'Можно начать бесплатно', more: ['утром', 'рядом с работой'] },
  { re: /продукт|магазин|овощ|фрукт|доставк|цвет|букет/, cats: ['grocery'], say: 'Из магазинов у дома', more: ['с доставкой', 'баллы X5'] },
  { re: /аптек|лекар|врач|зуб|здоров|очк|зрени|болит/, cats: ['health'], say: 'Здоровье — аптека, врач и оптика рядом', more: ['сегодня', 'подешевле'] },
]
const n_ = (n: number, one: string, few: string, many: string) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many}`
// почему ИИ выбрал оффер — одна короткая причина на карточке
function why(o: Offer, k: number, cheap: boolean): string {
  if (k === 0) return 'лучше всего подходит'
  if (cheap && o.price) return `за ${nb(`${o.price.toLocaleString('ru-RU')} ₽`)}`
  if (typeof o.till === 'number' && o.till <= 3) return o.till ? `ещё ${days(o.till)}` : 'последний день'
  if (o.bee) return 'только с билайном'
  if (o.dist <= 600) return `${Math.max(1, Math.round(o.dist / 80))} мин пешком`
  return TYPES[o.type].t
}
function mockAsk(q: string, all: Offer[]): Answer {
  const s = q.toLowerCase()
  const hit = INTENTS.filter(i => i.re.test(s))
  const cats = hit.flatMap(i => i.cats)
  const max = +(s.match(/до\s*(\d[\d\s]*)/)?.[1]?.replace(/\s/g, '') ?? 0)
  const cheap = /недорог|дешев|дешёв|бюджет|эконом|подешевле/.test(s) || max > 0
  // куски слов из вопроса в тексте оффера поднимают его выше: «постричься» → «стрижка», «переобуть» → «переобувка»
  const grams = s.split(/[^а-яёa-z]+/).filter(w => w.length >= 5).flatMap(w => Array.from({ length: w.length - 3 }, (_, k) => w.slice(k, k + 4)))
  const exact = (o: Offer) => {
    const hay = `${o.partner} ${o.title} ${o.small}`.toLowerCase()
    return grams.filter(g => hay.includes(g)).length + (hit.some(i => i.like?.test(hay)) ? 3 : 0)
  }
  const pick = all.filter(o => (!cats.length || cats.includes(o.cat)) && (!max || !o.price || o.price <= max))
    .sort((a, b) => exact(b) - exact(a) || (cheap ? (a.price ?? 1e9) - (b.price ?? 1e9) : 0) || a.dist - b.dist).slice(0, 6)
  const top = pick[0]
  const reply = !hit.length || !top
    ? 'Не до конца понял, что ищешь, поэтому показал самое интересное рядом. Уточни — подберу точнее.'
    : `${hit[0].say}: ${n_(pick.length, 'место', 'места', 'мест')} рядом. Первым — ${top.partner}: ${top.small}, ${km(top.dist)} от тебя.`
  const list = hit.length ? pick : [...all].sort((a, b) => a.dist - b.dist).slice(0, 4)
  return { reply, offerIds: list.map(o => o.id), questions: hit[0]?.more ?? starters().slice(0, 3), source: 'ai', why: Object.fromEntries(list.map((o, k) => [o.id, why(o, k, cheap)])) }
}

// подсказка в поле сама печатает примеры вопросов
function useTypewriter(on: boolean) {
  const reduce = useReducedMotion()
  const [t, setT] = useState(0)
  useEffect(() => { if (!on || reduce) return; const x = setInterval(() => setT(v => v + 1), 70); return () => clearInterval(x) }, [on, reduce])
  if (reduce) return EXAMPLES[0]
  const span = (e: string) => e.length * 2 + 20 // печатается, стоит ~1,4 с и стирается
  let left = t % EXAMPLES.reduce((sum, e) => sum + span(e), 0)
  for (const e of EXAMPLES) {
    if (left < span(e)) return e.slice(0, left < e.length ? left : left < e.length + 20 ? e.length : span(e) - left)
    left -= span(e)
  }
  return ''
}

const THINK_MS = 1900 // мок отвечает мгновенно — даём увидеть, как ИИ «думает»
function Ask({ all, viewed, onOpen }: { all: Offer[]; viewed: string[]; onOpen: (id: string) => void }) {
  const [text, setText] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(0)
  const askM = $api.useMutation('post', '/showcase/ask')
  const typed = useTypewriter(!text && !turns.length)
  const steps = [`смотрю ${all.length} мест рядом`, 'сравниваю цены и сроки', 'проверяю, что открыто сейчас']
  useEffect(() => { if (!busy) return; setStep(0); const x = setInterval(() => setStep(v => v + 1), THINK_MS / steps.length); return () => clearInterval(x) }, [busy])
  const send = (q: string) => {
    const said = q.trim()
    if (!said || busy) return
    const next: Turn[] = [...turns, { role: 'user', text: said }]
    setTurns(next)
    setText('')
    setBusy(true)
    const asked = askM.mutateAsync({
      // нечётное число ходов: диалог для модели всегда начинается с реплики абонента
      body: { turns: next.slice(-11).map(({ role, text }) => ({ role, text })), offers: all.map(askOffer), context: { district: 'Хамовники', signals: FOR_YOU.map(([, why]) => why), viewed } },
    }).then(a => (a.source === 'ai' ? a : mockAsk(said, all)), () => mockAsk(said, all))
    Promise.all([asked, new Promise(r => setTimeout(r, THINK_MS))]).then(([answer]) => {
      setTurns([...next, { role: 'assistant', text: answer.reply, answer }])
      setBusy(false)
    })
  }
  const submit = (e: FormEvent) => { e.preventDefault(); send(text) }
  const asked = [...turns].reverse().find(t => t.role === 'user')?.text
  const last = turns.at(-1)?.answer
  const found = last?.offerIds.map(id => all.find(o => o.id === id)).filter((o): o is Offer => !!o) ?? []

  return (
    <section className="near-ask" aria-label="Поиск с ИИ">
      <span className="near-ai__label"><Sparkles size={14} aria-hidden="true" />ИИ-помощник · спроси обычными словами</span>
      <form className={`near-ask__bar near-ai${busy ? ' is-busy' : ''}`} onSubmit={submit}>
        <Sparkles size={20} aria-hidden="true" className="near-ai__icon" />
        <input value={text} onChange={e => setText(e.target.value)} maxLength={500} placeholder={turns.length ? 'уточни или спроси другое' : `спроси: «${typed}»`} aria-label="Спроси, что ищешь" />
        <button className="bl-btn bl-btn--primary near-ask__send" disabled={!text.trim() || busy} aria-label="Спросить"><ArrowUp size={20} /></button>
      </form>

      {turns.length > 0 && (
        <div className={`bl-section near-ask__panel${busy ? ' is-busy' : ''}`} aria-live="polite">
          <div className="near-ask__head">
            <p className="near-ask__me">{asked}</p>
            <button className="bl-btn bl-btn--s bl-btn--ghost" onClick={() => setTurns([])}><X size={16} />новый вопрос</button>
          </div>
          {busy ? (
            <>
              <ul className="near-think">
                {steps.map((t, k) => (
                  <motion.li key={t} className={k < step ? 'is-done' : k === step ? 'is-now' : ''} initial={{ opacity: 0, x: -8 }} animate={{ opacity: k <= step ? 1 : 0.35, x: 0 }} transition={{ delay: k * 0.08 }}>
                    {k < step ? <CircleCheck size={18} /> : <Sparkles size={18} />}{t}
                  </motion.li>
                ))}
              </ul>
              <div className="near-scroller near-carousel" aria-hidden="true">{[0, 1, 2].map(k => <span key={k} className="near-skel" />)}</div>
            </>
          ) : last && (
            <>
              <p className="bl-body near-ask__reply"><Sparkles size={18} aria-hidden="true" />
                {last.reply.split(' ').map((w, k) => <motion.span key={`${turns.length}-${k}`} initial={{ opacity: 0, filter: 'blur(4px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ delay: k * 0.035, duration: 0.25 }}>{w} </motion.span>)}
              </p>
              {found.length > 0 && (
                <div className="near-scroller near-carousel">
                  <AnimatePresence>
                    {found.map((o, k) => (
                      <motion.div key={`${turns.length}-${o.id}`} className="near-ask__hit" initial={{ opacity: 0, y: 24, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.25 + k * 0.09, type: 'spring', stiffness: 260, damping: 22 }}>
                        <Card o={o} onOpen={onOpen} why={last.why?.[o.id]} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
              <div className="near-ask__foot">{last.questions.map(q => <Chip key={q} onClick={() => send(q)}>{q}</Chip>)}</div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

/* ───────── карточки каталога ───────── */
function Card({ o, wide, onOpen, why }: { o: Offer; wide?: boolean; onOpen: (id: string) => void; why?: string }) {
  return (
    <button className={`bl-card bl-card--white near-card${wide ? ' near-card--wide' : ''}`} onClick={() => onOpen(o.id)}>
      <Creative o={o} erid={erid(o)} wide={wide} />
      <span className="near-card__body">
        {why && <span className="near-why"><Sparkles size={12} aria-hidden="true" />{why}</span>}
        <span className="near-card__line"><Where o={o} /><Bee o={o} /></span>
      </span>
    </button>
  )
}

// маленький креатив — только предмет на цвете партнёра: текст креатива в таком размере не прочитать
function Tile({ o, className }: { o: Offer; className: string }) {
  return <span className={`cr cr--${o.tone} near-tile ${className}`} aria-hidden="true"><CrImg o={o} /></span>
}

// приглашение для бизнеса в ряду карточек: витрину смотрят и владельцы кафе по соседству
function Invite() {
  return (
    <Link to="/" className="bl-card near-card near-invite">
      <span className="bl-h4">здесь может быть ваше кафе</span>
      <span className="bl-body bl-secondary">предложение увидят абоненты билайна, которые живут и работают рядом</span>
      <span className="bl-btn bl-btn--s">разместить предложение</span>
    </Link>
  )
}

/* ───────── окно оффера: своё действие для каждого типа ───────── */
function Sheet({ o }: { o: Offer }) {
  // ответ POST /showcase/{id}/act; у выдуманных партнёров пустой объект
  const [res, setRes] = useState<{ clickId?: string; url?: string; conversion?: S['Conversion'] | null } | null>(null)
  const [consent, setConsent] = useState(false) // согласие на передачу номера абонент ставит сам
  const [paying, setPaying] = useState(false) // купон: второй шаг с суммой и балансом перед списанием
  const [phone, setPhone] = useState<string | null>(null) // null — номер абонента, строка — введённый вручную
  const [tried, setTried] = useState(false)
  const actM = $api.useMutation('post', '/showcase/{id}/act', act)
  // кнопка абонента: по кампании из кабинета — настоящий вызов, по выдуманным партнёрам — сразу результат
  const run = () => (o.campaign
    ? actM.mutateAsync({ params: { path: { id: o.campaign.id } } }).then(setRes, () => {})
    : Promise.resolve(setRes({})))
  const done = res !== null
  const primary = (label: string, onClick: () => unknown = run) => <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={actM.isPending} onClick={onClick}>{label}</button>
  const toSite = () => toast(o.campaign ? 'Здесь откроется сайт партнёра, переход с click_id засчитан' : 'Здесь откроется сайт партнёра')
  const price = o.price ?? 0, left = BALANCE - price, saved = o.was ? o.was - price : 0
  const phoneOk = phone === null || phone.replace(/\D/g, '').length === 11
  const sendLead = () => { setTried(true); if (!phoneOk) return; if (!consent) return toast('Отметь согласие — без него номер не передадим'); run() }

  return (
    <>
      <div className="near-sheet__head">
        <Tile o={o} className="near-sheet__cr" />
        <span className="bl-stack" style={{ ['--bl-gap' as string]: '8px' }}>
          <span className="bl-row" style={{ gap: 8 }}><Bee o={o} /><Tag o={o} /><Till o={o} /></span>
          <span className="bl-caption">{o.partner}</span>
          <h2 className="bl-h3">{o.title}</h2>
        </span>
      </div>
      <p className="bl-body bl-secondary">{o.cond}. Действует {o.campaign ? 'пока идёт кампания' : `до ${tillDate(o)}`}.</p>
      <div className="near-place">
        <MapPin size={20} aria-hidden="true" />
        <span className="bl-stack" style={{ ['--bl-gap' as string]: '2px', minWidth: 0 }}>
          <span className="bl-body">{o.where ?? addrOf(o)}</span>
          <span className="bl-caption">{o.where ? '' : `${km(o.dist)} · ${walk(o.dist)} · `}работают {HOURS[o.cat]}</span>
        </span>
        {!o.where && <a className="bl-btn bl-btn--s" href={`https://yandex.ru/maps/?rtext=~${encodeURIComponent(`Москва, ${addrOf(o)}`)}&rtt=pd`} target="_blank" rel="noreferrer">маршрут</a>}
      </div>

      {o.type === 'promo' && (done
        ? <>
            <div className="near-code">{o.code}</div>
            <p className="bl-caption" style={{ textAlign: 'center' }}>{o.site || o.campaign ? 'введи код при оформлении на сайте партнёра' : 'покажи код на кассе или назови его'}</p>
            <div className="near-sheet__btns">
              <button className="bl-btn bl-btn--block" onClick={() => copy(o.code ?? '', 'Промокод')}>скопировать</button>
              {(o.site || o.campaign) && <button className="bl-btn bl-btn--dark bl-btn--block" onClick={toSite}>на сайт партнёра</button>}
            </div>
          </>
        : primary('показать промокод'))}
      {o.type === 'coupon' && (done
        ? <>
            <div className="bl-notice bl-notice--success">оплачено {price} ₽ со счёта{saved ? `, экономия ${saved} ₽` : ''}. Купон сохранили в «моих выгодах» в приложении билайна</div>
            <Qr label="QR-код купона для кассы, заглушка" />
            <p className="bl-body" style={{ textAlign: 'center' }}>покажи QR на кассе</p>
          </>
        : paying
          ? <>
              {left >= 0
                ? <div className="bl-notice bl-notice--info">спишем {price} ₽ со счёта {PHONE}. На счёте {BALANCE} ₽, останется {left} ₽</div>
                : <div className="bl-notice bl-notice--error">на счёте {BALANCE} ₽ — не хватает {-left} ₽. Пополни счёт и возвращайся за купоном</div>}
              <div className="near-sheet__btns">
                <button className="bl-btn bl-btn--l bl-btn--block" onClick={() => setPaying(false)}>назад</button>
                {left >= 0 ? primary(`оплатить ${price} ₽`) : primary('пополнить счёт', () => toast('Здесь откроется пополнение счёта'))}
              </div>
            </>
          : <>
              <div className="near-price">
                <span className="bl-h2">{price} ₽</span>
                {o.was && <><s className="bl-body bl-secondary">{o.was} ₽</s><span className="bl-tag bl-tag--soft-green">экономия {saved} ₽</span></>}
              </div>
              <p className="bl-caption">не воспользуешься до {tillDate(o)} — вернём деньги на счёт</p>
              {primary(`купить за ${price} ₽`, () => setPaying(true))}
            </>)}
      {o.type === 'click' && (done ? primary('открыть ещё раз', () => Promise.resolve(toSite())) : primary(cta(o), () => run().then(toSite)))}
      {o.type === 'lead' && (done
        ? <div className="bl-notice bl-notice--success">заявка у партнёра — {o.cond}</div>
        : <>
            {phone === null
              ? <div className="near-phone">
                  <span className="bl-stack" style={{ ['--bl-gap' as string]: '2px' }}><span className="bl-caption">номер для связи</span><span className="bl-body">{PHONE}</span></span>
                  <button className="bl-btn bl-btn--s bl-btn--ghost" onClick={() => setPhone('')}>другой номер</button>
                </div>
              : <label className={`bl-field${tried && !phoneOk ? ' is-error' : ''}`}>
                  <span className="bl-field__label">номер для связи</span>
                  <input className="bl-input" type="tel" autoComplete="tel" autoFocus value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 900 000-00-00" />
                  {tried && !phoneOk && <span className="bl-field__caption">нужно 11 цифр, например +7 903 123-45-67</span>}
                </label>}
            <Check checked={consent} onChange={setConsent} label={<span className="bl-caption">передать номер только партнёру {o.partner} для этой заявки</span>} />
            {primary(cta(o), sendLead)}
          </>)}
      {o.type === 'sub' && (done
        ? <div className="bl-notice bl-notice--success">подключено. Первое списание — после бесплатного периода, напомним за день.</div>
        : <><div className="bl-notice bl-notice--info">{o.cond}.</div>{primary(cta(o))}</>)}

      {o.campaign && done && res?.clickId && (
        <div className="bl-card bl-surface-primary near-sheet__demo">
          <span className="bl-caption">что увидит партнёр</span>
          <span className="bl-caption">{res.conversion
            ? <>в кабинете появилась {res.conversion.kind === 'lead' ? 'заявка из формы билайна' : 'оплата со счёта телефона'}{res.conversion.status === 'pending' ? ', её можно оспорить' : ', засчитана сразу'}</>
            : <>переход по ссылке с меткой, результат пришлёт сервер партнёра</>}</span>
          <code className="near-sheet__url">{res.url}</code>
          <Link className="bl-btn bl-btn--s" to={res.conversion ? '/cab/connections' : `/cab/stats/${o.campaign.id}`}>{res.conversion ? 'открыть в кабинете' : 'статистика кампании'}</Link>
        </div>
      )}
      <p className="bl-micro">Реклама. {o.partner}, erid: {erid(o)}. Условия предоставляет партнёр.</p>
    </>
  )
}
