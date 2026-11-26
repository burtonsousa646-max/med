import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { LayoutGrid, List, Map as MapIcon, MapPin, Search, X } from 'lucide-react'
import logoUrl from '../../../design-system/assets/beeline-logo.svg'
import { $api } from '../api'
import { CATS, Creative, CrImg, type Cat } from '../creative'
import { OFFERS, RADII, erid, fromCampaign, km, tillDate, type Offer } from './Near'
import './near-v2.css'

const categories = Object.entries(CATS) as [Cat, (typeof CATS)[Cat]][]
const examples = ['Кофе до 300 ₽', 'Первая стрижка']
const budgetPattern = /до\s+(\d[\d\s]*)\s*₽?/i
const stopWords = new Set(['хочу', 'ищу', 'найди', 'мне', 'где', 'рядом', 'можно', 'первая', 'первую'])
const countRules = new Intl.PluralRules('ru')
const countLabels = { one: 'предложение', few: 'предложения', many: 'предложений', other: 'предложений' } as const
const formatCount = (count: number) => `${count} ${countLabels[countRules.select(count) as keyof typeof countLabels] ?? countLabels.other}`
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function matchesQuery(offer: Offer, query: string) {
  const budget = query.match(budgetPattern)
  const terms = query.replace(budgetPattern, '').toLowerCase().match(/[\p{L}\d]+/gu) ?? []
  const text = [offer.partner, offer.title, offer.small, offer.cond].join(' ').toLowerCase()
  const key = /капучино|эспрессо|латте|американо/.test(text) ? `${text} кофе` : text
  if (!terms.filter(term => !stopWords.has(term)).every(term => key.includes(term.slice(0, 5)))) return false
  if (!budget) return true
  const minimum = offer.cond.match(/(?:от|чек от)\s+(\d[\d\s]*)\s*₽/i)
  const quoted = offer.big.match(/^(\d[\d\s]*)\s*₽$/)
  const price = minimum ? Number(minimum[1].replace(/\s/g, '')) : offer.price ?? (quoted ? Number(quoted[1].replace(/\s/g, '')) : undefined)
  return price !== undefined && price <= Number(budget[1].replace(/\s/g, ''))
}

function OfferCard({ offer, onOpen }: { offer: Offer; onOpen: () => void }) {
  return (
    <button className="near-v2-card" onClick={onOpen} aria-label={`${offer.partner}. ${offer.title}`}>
      <Creative o={offer} erid={erid(offer)} wide />
      <span className="near-v2-card__body">
        <span className="bl-caption">{offer.where ? 'Доставка или выезд' : km(offer.dist)}{offer.bee && ' · Для клиентов билайна'}</span>
        <span className="near-v2-card__title">{capitalize(offer.title)}</span>
        <span className="bl-caption">{capitalize(offer.cond)}</span>
      </span>
    </button>
  )
}

function CatalogMap({ offers, radius, onOpen }: { offers: Offer[]; radius: number; onOpen: (id: string) => void }) {
  const [selected, setSelected] = useState<string>()
  const points = new Map<string, { x: number; y: number; offers: Offer[] }>()
  for (const offer of offers) {
    if (offer.where) continue
    const angle = offer.a * Math.PI / 180
    const distance = offer.dist / radius
    const x = 50 + Math.round(Math.cos(angle) * distance * 2) * 18
    const y = 50 + Math.round(Math.sin(angle) * distance * 2) * 18
    const key = `${x}-${y}`
    let cluster = points.get(key)
    if (!cluster) {
      cluster = { x, y, offers: [] }
      points.set(key, cluster)
    }
    cluster.offers.push(offer)
  }
  const shown = (selected && points.get(selected)?.offers) || offers
  return (
    <section className="near-v2-map" aria-label="Схема района">
      <div className="near-v2-map__canvas">
        <svg viewBox="0 0 600 400" preserveAspectRatio="none" aria-hidden="true">
          <path d="M-10 322 Q120 260 350 320 T620 250" fill="none" stroke="#d1e4ed" strokeWidth="32"/>
          <path d="M-10 102 L620 150 M-10 225 L620 194 M65 -10 L118 410 M240 -10 L293 410 M493 -10 L405 410" fill="none" stroke="white" strokeWidth="13"/>
          <path d="M-10 59 L620 85 M-10 269 L620 260 M155 -10 L185 410 M370 -10 L343 410 M560 -10 L539 410" fill="none" stroke="white" strokeWidth="5"/>
        </svg>
        {Array.from(points, ([key, point]) => (
          <button key={key} className="near-v2-map__pin" style={{ left: `${point.x}%`, top: `${point.y}%` }}
            aria-label={point.offers.length === 1 ? point.offers[0].title : formatCount(point.offers.length)}
            aria-pressed={selected === key} onClick={() => setSelected(selected === key ? undefined : key)}>
            {point.offers.length}
          </button>
        ))}
        <span className="near-v2-map__label">Демо-схема Хамовников</span>
      </div>
      <div className="near-v2-map__results">
        <div className="near-v2-map__heading">
          <h2 className="bl-h4">{selected ? 'На выбранной метке' : 'Предложения в районе'}</h2>
          {selected && <button className="bl-btn bl-btn--s" onClick={() => setSelected(undefined)}>Показать все</button>}
        </div>
        <ul>
          {shown.map(offer => (
            <li key={offer.id}>
              <button onClick={() => onOpen(offer.id)}>
                <span>{capitalize(offer.title)}</span>
                <span className="bl-caption">{offer.partner} · {offer.where ? 'Доставка или выезд' : km(offer.dist)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function OfferDialog({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const result = useRef<HTMLHeadingElement>(null)
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState('')
  useLayoutEffect(() => {
    const node = dialog.current!
    const opener = document.activeElement
    node.showModal()
    return () => {
      node.close()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])
  useEffect(() => { if (revealed) result.current?.focus() }, [revealed])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(offer.code!)
      setCopied('Промокод скопирован')
    } catch {
      setCopied('Выделите и скопируйте промокод вручную')
    }
  }
  const action = { click: 'Перейти на сайт', coupon: 'Купить купон', promo: 'Показать промокод', lead: 'Оставить заявку', sub: 'Подключить подписку' }[offer.type]
  return (
    <dialog ref={dialog} className="near-v2-dialog" aria-labelledby="near-v2-offer"
      onCancel={event => { event.preventDefault(); onClose() }}
      onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="near-v2-dialog__body">
        <button autoFocus className="bl-icon-btn modal-close" onClick={onClose} aria-label="Закрыть"><X size={20}/></button>
        <div className="near-v2-dialog__image"><CrImg o={offer}/></div>
        <div>
          <p className="bl-caption">{offer.partner}{offer.bee && ' · Для клиентов билайна'}</p>
          <h2 className="bl-h3" id="near-v2-offer">{capitalize(offer.title)}</h2>
        </div>
        <p className="bl-body">{capitalize(offer.cond)}.</p>
        <p className="bl-caption">{offer.where ? capitalize(offer.where) : [offer.addr, km(offer.dist)].filter(Boolean).join(' · ')} · {offer.campaign ? 'Пока идёт кампания' : `До ${tillDate(offer)}`}</p>
        {offer.type === 'promo' && offer.code ? (
          revealed ? (
            <div className="near-v2-code">
              <h3 ref={result} tabIndex={-1} className="bl-h4">{offer.code}</h3>
              <p className="bl-caption">{offer.site || offer.campaign ? 'Вводится при заказе на сайте партнёра.' : 'Показывается при покупке на кассе.'}</p>
              <button className="bl-btn bl-btn--primary" onClick={copy}>Скопировать промокод</button>
              <span role="status" className="bl-caption">{copied}</span>
            </div>
          ) : <button className="bl-btn bl-btn--primary" onClick={() => setRevealed(true)}>{action}</button>
        ) : (
          <div className="near-v2-code">
            <p className="bl-caption">{offer.type === 'promo' ? 'Для этого предложения не задан промокод.' : `Действие «${action}» доступно в рабочей витрине.`}</p>
          </div>
        )}
        <p className="bl-caption">Демо-предложение. Реклама · erid {erid(offer)}</p>
      </div>
    </dialog>
  )
}

export default function NearV2() {
  const company = $api.useQuery('get', '/company')
  const campaigns = $api.useQuery('get', '/campaigns')
  const [params, setParams] = useSearchParams()
  const [catalogMode, setCatalogMode] = useState<'list' | 'map'>('list')
  const query = params.get('q') ?? ''
  const [entry, setEntry] = useState(query)
  useEffect(() => { setEntry(query) }, [query])

  const rawCategory = params.get('cat')
  const category = categories.find(([key]) => key === rawCategory)?.[0]
  const radius = RADII.find(r => r === Number(params.get('radius'))) ?? 1000
  const own = (company.data && campaigns.data)
    ? campaigns.data.filter(c => c.status === 'live' && c.places.showcase)
      .map((c, i) => fromCampaign(c, i, company.data.brand, company.data.points.find(point => point.active)?.addr))
    : []
  const all = [...own, ...OFFERS]
  const base = all.filter(offer => (!category || offer.cat === category) && matchesQuery(offer, query))
  const results = base.filter(offer => offer.dist <= radius).sort((a, b) => a.dist - b.dist)
  const wider = RADII.find(r => r > radius && base.some(offer => offer.dist <= r))
  const openId = params.get('offer')
  const open = all.find(offer => offer.id === openId)
  const isMissing = openId && !open && !company.isFetching && !campaigns.isFetching
  const change = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next, { replace: true, preventScrollReset: true })
  }
  const search = (event: FormEvent) => { event.preventDefault(); change({ q: entry.trim() }) }

  return (
    <div className="bl-page near-v2">
      <header className="near-v2-header">
        <img src={logoUrl} width={40} height={40} alt="билайн"/>
        <span className="near-v2-location"><MapPin size={17} aria-hidden="true"/>Хамовники <span>· демо</span></span>
        <Link to="/near">Версия 1</Link>
      </header>

      <main className="near-v2-main">
        <section className="near-v2-intro" aria-labelledby="near-v2-title">
          <div>
            <h1 className="bl-h1" id="near-v2-title">Лучшее рядом</h1>
            <p className="bl-body">Скидки, купоны и промокоды в твоём районе</p>
          </div>
          <div>
            <form onSubmit={search} className="near-v2-search" role="search">
              <Search size={20} aria-hidden="true"/>
              <input type="search" aria-label="Найти предложение" value={entry} maxLength={150} onChange={event => setEntry(event.target.value)} placeholder="Магазин или услуга"/>
              <button className="bl-btn bl-btn--primary" type="submit">Найти</button>
            </form>
            <div className="near-v2-examples" aria-label="Примеры запросов">
              {examples.map(example => <button key={example} onClick={() => { setEntry(example); change({ q: example }) }}>{example}</button>)}
            </div>
          </div>
        </section>

        <section className="near-v2-catalog" aria-label="Каталог предложений">
          <div className="near-v2-categories" role="group" aria-label="Категории">
            <button aria-pressed={!category} onClick={() => change({ cat: undefined })}><LayoutGrid size={18} aria-hidden="true"/>Все</button>
            {categories.map(([id, [label, Icon]]) => (
              <button key={id} aria-pressed={category === id} onClick={() => change({ cat: id })}><Icon size={18} aria-hidden="true"/>{capitalize(label)}</button>
            ))}
          </div>
          <div className="near-v2-tools">
            <fieldset className="near-v2-radius">
              <legend className="near-v2-sr">Радиус поиска</legend>
              {RADII.map(r => <label key={r}><input type="radio" name="near-v2-radius" checked={radius === r} onChange={() => change({ radius: String(r) })}/><span>{km(r)}</span></label>)}
            </fieldset>
            <div className="near-v2-modes" role="group" aria-label="Вид каталога">
              <button aria-label="Список" aria-pressed={catalogMode === 'list'} onClick={() => setCatalogMode('list')}><List size={19} aria-hidden="true"/><span>Список</span></button>
              <button aria-label="Карта" aria-pressed={catalogMode === 'map'} onClick={() => setCatalogMode('map')}><MapIcon size={19} aria-hidden="true"/><span>Карта</span></button>
            </div>
          </div>
          <div className="near-v2-heading">
            <div>
              <h2 className="bl-h3">{query ? 'Результаты поиска' : category ? capitalize(CATS[category][0]) : 'Предложения рядом'}</h2>
              <p className="bl-caption" aria-live="polite">{formatCount(results.length)} в радиусе {km(radius)}</p>
            </div>
            {(query || category || radius !== 1000) && <button className="bl-btn bl-btn--s" onClick={() => { setEntry(''); change({ cat: undefined, radius: undefined, q: undefined }) }}>Сбросить</button>}
          </div>
          {query && <p className="near-v2-query bl-caption">Запрос «{query}»</p>}
          {!!isMissing && <p role="status" className="bl-caption">Это предложение недоступно. Ниже есть другие варианты.</p>}
          {results.length === 0 ? (
            <div className="near-v2-empty">
              <h3 className="bl-h4">Ничего не нашлось</h3>
              <p className="bl-body bl-secondary">{wider ? `Есть предложения в радиусе ${km(wider)}.` : 'Попробуй изменить запрос или выбрать другую категорию.'}</p>
              {wider && <button className="bl-btn bl-btn--primary" onClick={() => change({ radius: String(wider) })}>Искать в {km(wider)}</button>}
            </div>
          ) : catalogMode === 'map' ? (
            <CatalogMap key={`${radius}-${category}-${query}`} offers={results} radius={radius} onOpen={id => change({ offer: id })}/>
          ) : (
            <div className="near-v2-grid">
              {results.map(offer => <OfferCard key={offer.id} offer={offer} onOpen={() => change({ offer: offer.id })}/>)}
            </div>
          )}
        </section>
      </main>

      <footer className="near-v2-footer bl-caption">
        <span>Демо-витрина. Адреса, расстояния и условия приведены для примера.</span>
        <Link to="/">Разместить предложение</Link>
      </footer>
      {open && <OfferDialog key={open.id} offer={open} onClose={() => change({ offer: undefined })}/>}
    </div>
  )
}
