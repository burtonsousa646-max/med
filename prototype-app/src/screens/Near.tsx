import { useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router'
import { MapPin, Search, X } from 'lucide-react'
import logoUrl from '../../../design-system/assets/beeline-logo.svg'
import { $api, act, useCampaigns, useCompany, type Campaign, type S } from '../api'
import { CATS, Creative, CrImg, creativeOf, type Cat, type CreativeData } from '../creative'
import { Check, Chip, Modal, Qr, Segmented, copy, toast } from '../ui'

/* Витрина «лучшее рядом»: предложения партнёров вокруг абонента, по мотивам раздела «Город» в Т-Банке.
   Демо: рядом с выдуманными партнёрами показываются запущенные кампании демо-компании из кабинета,
   а кнопки абонента по ним уходят в кабинет через POST /showcase/{id}/act. */

type Offer = CreativeData & {
  id: string; type: S['OfferType']; partner: string; title: string; cond: string
  dist: number; a: number; code?: string; price?: number; campaign?: Campaign
  till: string | number // число — сколько дней осталось от сегодня, чтобы срочные акции в прототипе не устаревали
  wide?: boolean // партнёр купил широкую карточку: первое место в разделе
  addr?: string; where?: string // where — вместо адреса, когда идти никуда не нужно: доставка, мастер на дом
  was?: number // цена без купона: абонент видит экономию
  site?: boolean // промокод вводят на сайте, а не называют на кассе
}

// Партнёры выдуманы, кроме X5: «Пятёрочка» и «Перекрёсток» настоящие, условия их акций придуманы для примера.
// dist — метры от абонента, a — угол точки на карте, img — предмет для креатива в public/img/near
const OFFERS: Offer[] = [
  { id: 'p5-new', cat: 'grocery', type: 'promo', partner: '«Пятёрочка» на Плющихе', mark: 'Пятёрочка', big: '300', small: 'баллов X5 Клуба за первую покупку', title: '300 баллов за первую покупку в новом магазине', cond: 'магазин открылся на этой неделе, покупка от 500 ₽', dist: 240, a: 40, tone: 'red', img: 'p5-new', till: '30 ноября', addr: 'ул. Плющиха, 22', code: 'NOVAYA300', wide: true },
  { id: 'p5-delivery', cat: 'grocery', type: 'click', partner: '«Пятёрочка» Доставка', mark: 'Пятёрочка', big: '0 ₽', small: 'доставка первого заказа', title: 'бесплатная доставка из магазина у дома за 30 минут', cond: 'заказ от 1 000 ₽ в приложении «Пятёрочки»', dist: 250, a: 58, tone: 'green', img: 'p5-delivery', till: '31 декабря', where: 'привезут из магазина на Плющихе' },
  { id: 'p5-job', cat: 'grocery', type: 'lead', partner: '«Пятёрочка» ищет сотрудников', mark: 'Пятёрочка', big: '72 000 ₽', small: 'продавец-кассир рядом с домом', title: 'работа в семи минутах от дома: продавец-кассир', cond: 'график 2/2, оформление по ТК, перезвонят сегодня', dist: 600, a: 300, tone: 'dark', img: 'p5-job', till: '15 декабря' },
  { id: 'perek', cat: 'grocery', type: 'promo', partner: '«Перекрёсток»', mark: 'Перекрёсток', big: '−10%', small: 'на овощи и фрукты', title: '−10% на овощи и фрукты по промокоду', cond: 'в магазине и в доставке, чек от 700 ₽', dist: 1300, a: 200, tone: 'green', img: 'perek', till: '30 ноября', code: 'FRESH10', site: true },
  { id: 'kolos', cat: 'food', type: 'coupon', partner: 'пекарня «Колос»', mark: 'Колос', big: '199 ₽', small: 'круассан и капучино вместо 320 ₽', title: 'завтрак: круассан и капучино за 199 ₽', cond: 'купон оплачивается со счёта телефона', dist: 350, a: 210, tone: 'light', img: 'kolos', till: 2, price: 199, was: 320 },
  { id: 'apteka', cat: 'health', type: 'click', partner: 'аптека «Плюс»', mark: 'Аптека Плюс', big: '−10%', small: 'на заказ с самовывозом', title: '−10% на заказ на сайте с самовывозом из аптеки', cond: 'скидка применится сама', dist: 260, a: 320, tone: 'teal', img: 'apteka', till: '31 декабря' },
  { id: 'britva', cat: 'beauty', type: 'click', partner: 'барбершоп «Бритва»', mark: 'Бритва', big: '−30%', small: 'на первую стрижку', title: 'первая стрижка со скидкой 30%', cond: 'запись на сайте барбершопа', dist: 420, a: 120, tone: 'dark', img: 'britva', till: '30 ноября' },
  { id: 'buket', cat: 'grocery', type: 'promo', partner: 'цветы «Букет»', mark: 'Букет', big: '−15%', small: 'на букеты с доставкой', title: '−15% на букеты с доставкой за час', cond: 'заказ от 2 500 ₽', dist: 510, a: 250, tone: 'magenta', img: 'buket', till: 1, code: 'BEE15', site: true },
  { id: 'puls', cat: 'sport', type: 'sub', partner: 'фитнес «Пульс»', mark: 'Пульс', big: '7 дней', small: 'безлимит в зале бесплатно', title: 'неделя фитнеса бесплатно, дальше 2 900 ₽ в месяц', cond: 'оплата со счёта билайна, отключить можно в любой момент', dist: 650, a: 340, tone: 'violet', img: 'puls', till: '31 декабря', price: 2900 },
  { id: 'nogti', cat: 'beauty', type: 'coupon', partner: 'студия «Ноготок»', mark: 'Ноготок', big: '1 490 ₽', small: 'маникюр с покрытием вместо 2 200 ₽', title: 'маникюр с покрытием за 1 490 ₽', cond: 'купон оплачивается со счёта телефона', dist: 900, a: 70, tone: 'magenta', img: 'nogti', till: '30 ноября', price: 1490, was: 2200 },
  { id: 'sova', cat: 'kids', type: 'lead', partner: 'детский центр «Сова»', mark: 'Сова', big: '0 ₽', small: 'пробное занятие для детей 4–10 лет', title: 'пробное занятие в детском центре бесплатно', cond: 'перезвонят и подберут группу', dist: 750, a: 280, tone: 'blue', img: 'sova', till: '31 декабря' },
  { id: 'pena', cat: 'auto', type: 'promo', partner: 'автомойка «Пена»', mark: 'Пена', big: '−25%', small: 'на комплексную мойку в будни', title: 'комплексная мойка −25% по будням', cond: 'назови код администратору', dist: 850, a: 20, tone: 'blue', img: 'pena', till: '30 ноября', code: 'PENA25' },
  { id: 'clinic', cat: 'health', type: 'lead', partner: 'клиника «Здоровье рядом»', mark: 'Здоровье рядом', big: '990 ₽', small: 'приём терапевта', title: 'приём терапевта за 990 ₽', cond: 'перезвонят за 15 минут', dist: 1400, a: 230, tone: 'teal', img: 'clinic', till: '31 декабря' },
  { id: 'chisto', cat: 'home', type: 'promo', partner: 'клининг «Чисто»', mark: 'Чисто', big: '−40%', small: 'на первую уборку квартиры', title: 'первая уборка после переезда −40%', cond: 'выезжают в твой район', dist: 900, a: 130, tone: 'violet', img: 'chisto', till: '31 декабря', where: 'мастер приедет к тебе', code: 'NEWHOME40' },
  { id: 'koleso', cat: 'auto', type: 'lead', partner: 'шиномонтаж «Колесо 24»', mark: 'Колесо 24', big: '2 000 ₽', small: 'переобувка к зиме без очереди', title: 'переобувка к зиме от 2 000 ₽ по записи', cond: 'перезвонят и подберут время', dist: 1800, a: 335, tone: 'dark', img: 'koleso', till: '15 декабря' },
  { id: 'oktyabr', cat: 'fun', type: 'coupon', partner: 'кинотеатр «Октябрь»', mark: 'Октябрь', big: '2 = 1', small: 'билеты на дневные сеансы', title: 'два билета по цене одного в будни до 17:00', cond: 'купон оплачивается со счёта телефона', dist: 2100, a: 100, tone: 'red', img: 'oktyabr', till: '30 ноября', price: 450, was: 900 },
  { id: 'lavash', cat: 'food', type: 'promo', partner: 'шаурмичная «Лаваш»', mark: 'Лаваш', big: '−20%', small: 'на шаурму после 21:00', title: '−20% на шаурму по вечерам', cond: 'назови код на кассе', dist: 450, a: 262, tone: 'red', img: 'lavash', till: 4, code: 'NIGHT20' },
  { id: 'schi', cat: 'food', type: 'coupon', partner: 'столовая «Щи да каша»', mark: 'Щи да каша', big: '290 ₽', small: 'бизнес-ланч из трёх блюд', title: 'бизнес-ланч за 290 ₽ вместо 420 ₽', cond: 'купон оплачивается со счёта телефона, с 12 до 16', dist: 550, a: 32, tone: 'green', img: 'schi', till: '31 декабря', price: 290, was: 420 },
  { id: 'testo', cat: 'food', type: 'click', partner: 'пиццерия «Тесто»', mark: 'Тесто', big: '1 + 1', small: 'вторая пицца в подарок', title: 'вторая пицца в подарок к заказу от 1 500 ₽', cond: 'на сайте пиццерии, доставка 40 минут', dist: 700, a: 150, tone: 'magenta', img: 'testo', till: '30 ноября', where: 'привезут за 40 минут' },
  { id: 'optika', cat: 'health', type: 'promo', partner: 'оптика «Линза»', mark: 'Линза', big: '−50%', small: 'на вторые очки', title: 'вторые очки за полцены и проверка зрения бесплатно', cond: 'промокод назови консультанту', dist: 800, a: 192, tone: 'blue', img: 'optika', till: '31 декабря', code: 'LINZA50', wide: true },
  { id: 'stomat', cat: 'health', type: 'lead', partner: 'стоматология «Улыбка»', mark: 'Улыбка', big: '2 490 ₽', small: 'профессиональная чистка зубов', title: 'профессиональная чистка зубов за 2 490 ₽', cond: 'перезвонят и запишут на удобное время', dist: 1500, a: 60, tone: 'teal', img: 'stomat', till: '31 декабря' },
  { id: 'azs', cat: 'auto', type: 'promo', partner: 'АЗС «Заправка 24»', mark: 'Заправка 24', big: '−3 ₽', small: 'на литр топлива', title: '−3 ₽ на каждый литр топлива', cond: 'покажи код кассиру, до 50 литров', dist: 700, a: 248, tone: 'green', img: 'azs', till: '31 декабря', code: 'FUEL3' },
  { id: 'motor', cat: 'auto', type: 'lead', partner: 'автосервис «Мотор»', mark: 'Мотор', big: '0 ₽', small: 'диагностика ходовой', title: 'бесплатная диагностика ходовой перед зимой', cond: 'перезвонят и запишут', dist: 950, a: 292, tone: 'dark', img: 'motor', till: '15 декабря' },
  { id: 'remont', cat: 'home', type: 'lead', partner: 'сервис «Мастер на час»', mark: 'Мастер на час', big: '−30%', small: 'на первый выезд мастера', title: 'повесить полки, собрать шкаф: первый выезд −30%', cond: 'перезвонят за 10 минут', dist: 500, a: 352, tone: 'blue', img: 'remont', till: '31 декабря', where: 'мастер приедет к тебе' },
  { id: 'zamki', cat: 'home', type: 'promo', partner: 'служба «Ключник»', mark: 'Ключник', big: '−20%', small: 'на замену замков после переезда', title: 'замена замков в новой квартире −20%', cond: 'приедут в день заявки', dist: 820, a: 112, tone: 'dark', img: 'zamki', till: '31 декабря', where: 'мастер приедет к тебе', code: 'NEWKEY20' },
  { id: 'toys', cat: 'kids', type: 'click', partner: 'магазин «Кубик»', mark: 'Кубик', big: '−15%', small: 'на конструкторы', title: '−15% на конструкторы в магазине у дома', cond: 'заказ на сайте, самовывоз через час', dist: 650, a: 202, tone: 'violet', img: 'toys', till: '20 декабря' },
  { id: 'quest', cat: 'fun', type: 'promo', partner: 'квесты «Ключ»', mark: 'Ключ', big: '−20%', small: 'на квест для компании до 6 человек', title: 'квест для компании со скидкой 20%', cond: 'бронь на сайте по промокоду', dist: 600, a: 82, tone: 'violet', img: 'quest', till: '31 декабря', code: 'KEY20', site: true, wide: true },
  { id: 'bowling', cat: 'fun', type: 'coupon', partner: 'боулинг «Страйк»', mark: 'Страйк', big: '990 ₽', small: 'час игры вместо 1 800 ₽', title: 'час боулинга за 990 ₽ по будням', cond: 'купон оплачивается со счёта телефона', dist: 950, a: 232, tone: 'red', img: 'bowling', till: '31 декабря', price: 990, was: 1800 },
]

// «1 800 ₽» не разрывается переносом строки
const nb = (t: string) => t.replace(/(\d) (?=\d|₽)/g, '$1\u00a0')
for (const o of OFFERS) Object.assign(o, { title: nb(o.title), small: nb(o.small), cond: nb(o.cond) })

// Разделы каталога, пока фильтры не выбраны. Вид блока закреплён за разделом, чтобы страница не превращалась в лоскуты:
// hero — широкая карточка и две квадратные, carousel — ряд с прокруткой, list — купоны без крупной картинки,
// pair — широкая карточка и два купона сбоку
type Layout = 'hero' | 'carousel' | 'list' | 'pair'
const SECTIONS: { t: string; cats: Cat[]; layout: Layout }[] = [
  { t: 'магазины у дома', cats: ['grocery'], layout: 'hero' },
  { t: 'еда и кофе', cats: ['food'], layout: 'carousel' },
  { t: 'красота и здоровье', cats: ['beauty', 'health'], layout: 'hero' },
  { t: 'авто', cats: ['auto'], layout: 'list' },
  { t: 'дом и дети', cats: ['home', 'kids'], layout: 'carousel' },
  { t: 'спорт и развлечения', cats: ['sport', 'fun'], layout: 'pair' },
]
const BANNER_AFTER = 1 // подборка билайна — после второго раздела, одна на страницу

// Как тип оффера называется для абонента. Типы те же, что в кабинете партнёра
const TYPES: Record<S['OfferType'], { t: string; tag: string }> = {
  click: { t: 'на сайте', tag: 'bl-tag--soft-blue' }, coupon: { t: 'купон', tag: 'bl-tag--soft-green' }, promo: { t: 'промокод', tag: 'bl-tag--soft-violet' },
  lead: { t: 'запись', tag: '' }, sub: { t: 'подписка', tag: 'bl-tag--soft-blue' },
}
const cta = (o: Offer) => ({ click: 'перейти на сайт', coupon: `купить за ${o.price ?? 0} ₽`, promo: 'показать промокод', lead: 'оставить заявку', sub: 'попробовать бесплатно' })[o.type]

const RADII = [500, 1000, 3000]
// ponytail: номер и баланс демо-абонента, в бою — из профиля и биллинга
const PHONE = '+7 903 ••• 45 67', BALANCE = 640
type Filter = { cats: Cat[] | null; type: S['OfferType'] | 'all'; radius: number } // cats: null — все категории
// подборка: картинка берётся у одного из её офферов
const STORIES: { t: string; img: string; s: string; set: Partial<Filter> }[] = [
  { t: 'магазины у дома', img: 'perek', s: '06', set: { cats: ['grocery'], type: 'all' } },
  { t: 'кофе по пути', img: 'kolos', s: '08', set: { cats: ['food'], type: 'all' } },
  { t: 'в пяти минутах пешком', img: 'p5-delivery', s: '01', set: { cats: null, type: 'all', radius: 500 } },
  { t: 'машину к зиме', img: 'koleso', s: '03', set: { cats: ['auto'], type: 'all', radius: 3000 } },
  { t: 'выходные с детьми', img: 'sova', s: '05', set: { cats: ['kids'], type: 'all', radius: 3000 } },
  { t: 'только промокоды', img: 'buket', s: '02', set: { cats: null, type: 'promo' } },
]
// Персональные по сигналам билайна; причину абонент видит
const FOR_YOU: [string, string][] = [['p5-new', 'рядом открылся магазин'], ['chisto', 'ты недавно переехал'], ['nogti', 'сегодня зарплата']]

const km = (m: number) => (m < 1000 ? `${m} м` : `${+(m / 1000).toFixed(1)} км`.replace('.', ','))
const walk = (m: number) => `${Math.max(1, Math.round(m / 80))} мин пешком`
const days = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'день' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'дня' : 'дней'}`
const tillDate = (o: Offer) => typeof o.till === 'number' ? new Date(Date.now() + o.till * 864e5).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : o.till
// подпись на карточке: срочные выделены, у кампании из кабинета срока нет
const Till = ({ o }: { o: Offer }) => o.campaign ? null
  : typeof o.till === 'number' ? <span className="bl-tag bl-tag--accent">{o.till ? `ещё ${days(o.till)}` : 'последний день'}</span>
  : <span className="bl-caption">до {o.till}</span>

// ponytail: адрес и часы выдуманы по id и категории, в бою придут из точек партнёра в кабинете
const STREETS = ['ул. Плющиха', 'Комсомольский пр-т', 'ул. Льва Толстого', 'Зубовский б-р', 'ул. Усачёва', 'Фрунзенская наб.', 'ул. Россолимо', 'Смоленская ул.']
const HOURS: Record<Cat, string> = { grocery: '8:00–23:00', food: '8:00–22:00', beauty: '10:00–21:00', health: '8:00–21:00', auto: '9:00–21:00', home: '9:00–21:00', sport: '7:00–23:00', kids: '10:00–20:00', fun: '10:00–00:00' }
const addrOf = (o: Offer) => {
  const h = [...o.id].reduce((x, c) => x + c.charCodeAt(0), 0)
  return o.addr ?? `${STREETS[h % STREETS.length]}, ${(h % 40) + 1}`
}
const erid = (o: Offer) => (o.campaign ? '2SDnjc7Xy3M' : `2VSb5${o.id.replace('-', '').slice(0, 6)}`) // у кампании — erid со шага маркировки
const Tag = ({ o }: { o: Offer }) => <span className={`bl-tag ${TYPES[o.type].tag}`}>{TYPES[o.type].t}</span>

function fromCampaign(c: Campaign, i: number, brand: string, addr?: string): Offer {
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
  const [f, setF] = useState<Filter>({ cats: null, type: 'all', radius: 1000 })
  const [q, setQ] = useState('')
  const [hot, setHot] = useState<string>()
  const [mapOpen, setMapOpen] = useState(false) // на телефоне карта свёрнута, сначала список
  const [params, setParams] = useSearchParams()
  const open = all.find(o => o.id === params.get('offer'))
  const show = (id?: string) => setParams(id ? { offer: id } : {}, { replace: true })
  const set = (x: Partial<Filter>) => setF({ ...f, ...x })
  // фильтр из подборки, раздела или баннера: сразу показываем результат, а не оставляем его ниже экрана
  const go = (x: Partial<Filter>) => { set(x); requestAnimationFrame(() => document.getElementById('near-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }
  const reset = () => { setF({ cats: null, type: 'all', radius: 1000 }); setQ('') }

  const needle = q.trim().toLowerCase()
  const filtered = !!f.cats || f.type !== 'all' || !!needle
  // ищем по партнёру и тексту предложения: по названию категории «кофе» находил шаурму
  const fits = (o: Offer) => (!f.cats || f.cats.includes(o.cat)) && (f.type === 'all' || o.type === f.type)
    && (!needle || `${o.partner} ${o.title} ${o.small}`.toLowerCase().includes(needle))
  const list = all.filter(o => fits(o) && o.dist <= f.radius).sort((x, y) => x.dist - y.dist)
  const scale = (m: number) => (m / f.radius) * 44 // граница радиуса всегда на 44 % меньшей стороны карты
  // подборка горит, пока фильтр совпадает с ней
  const storyOn = (x: Partial<Filter>) => (Object.keys(x) as (keyof Filter)[]).every(k => JSON.stringify(f[k]) === JSON.stringify(x[k]))
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
  const [hero, ...side] = FOR_YOU.map(([id, why]) => ({ o: OFFERS.find(x => x.id === id)!, why }))

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
        <section className="near-intro">
          <div className="bl-stack" style={{ ['--bl-gap' as string]: '4px' }}>
            <h1 className="bl-h1">лучшее рядом</h1>
            <p className="bl-body bl-secondary">скидки, купоны и промокоды от мест вокруг тебя — для абонентов билайна</p>
            <span className="demo-note">{own.length
              ? <>ваших предложений здесь: {own.length} · <Link to="/cab/campaigns">кабинет партнёра</Link></>
              : <>ваших запущенных кампаний здесь пока нет · <Link to="/cab/campaigns">запустить в кабинете</Link></>}</span>
          </div>
          <label className="bl-search near-search"><Search /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="кофе, продукты, маникюр" aria-label="Поиск по предложениям" /></label>
        </section>

        {/* выгода — первое, что видно: одно крупное предложение и два поменьше */}
        {!filtered && (
          <section className="bl-stack" style={{ ['--bl-gap' as string]: '12px' }} aria-labelledby="fy-h">
            <h2 className="bl-h3" id="fy-h">для тебя сегодня</h2>
            <div className="near-pair near-pair--fy">
              <button className="bl-card bl-card--white near-card near-card--wide" onClick={() => show(hero.o.id)}>
                <Creative o={hero.o} erid={erid(hero.o)} wide />
                <span className="near-card__body">
                  <span className="bl-row" style={{ gap: 8 }}><span className="bl-tag bl-tag--soft-violet">{hero.why}</span><span className="bl-caption">{hero.o.partner} · {km(hero.o.dist)}</span></span>
                </span>
              </button>
              <div className="near-pair__side">
                {side.map(({ o, why }) => (
                  <button key={o.id} className="bl-card bl-card--white near-foryou" onClick={() => show(o.id)}>
                    <Tile o={o} className="near-foryou__cr" />
                    <span className="bl-stack near-foryou__body" style={{ ['--bl-gap' as string]: '6px' }}>
                      <span className="bl-tag bl-tag--soft-violet" style={{ alignSelf: 'flex-start' }}>{why}</span>
                      <span className="bl-h4">{o.title}</span>
                      <span className="bl-caption">{o.partner} · {km(o.dist)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* одна навигация вместо подборок и чипов: подборки с картинками, выбранная подсвечена */}
        <div className="near-scroller" role="group" aria-label="Подборки">
          {STORIES.map(({ t, img, s, set: x }) => {
            const on = storyOn(x)
            return (
              <button key={t} className={`near-story${on ? ' is-on' : ''}`} aria-pressed={on} style={{ background: `var(--color-surface-${s})` }} onClick={() => (on ? reset() : go(x))}>
                <CrImg o={OFFERS.find(o => o.id === img)!} /><span className="near-story__t">{t}</span>
              </button>
            )
          })}
        </div>

        {/* одна строка фильтров: что выбрано — видно и снимается крестиком */}
        <div id="near-results" className="near-toolbar">
          <div className="near-toolbar__state" aria-live="polite">
            <h2 className="bl-h3">{filtered ? <>нашлось <span className="bl-secondary">{list.length}</span></> : 'ближе всего'}</h2>
            {catName && <Chip on onClick={() => set({ cats: null })}>{catName}<X size={16} aria-label="убрать" /></Chip>}
            {needle && <Chip on onClick={() => setQ('')}>«{q.trim()}»<X size={16} aria-label="убрать" /></Chip>}
            {f.type !== 'all' && <Chip on onClick={() => set({ type: 'all' })}>{TYPES[f.type].t}<X size={16} aria-label="убрать" /></Chip>}
            {(filtered || f.radius !== 1000) && <button className="bl-btn bl-btn--s bl-btn--ghost" onClick={reset}>сбросить всё</button>}
          </div>
          <div className="near-toolbar__ctl">
            <select className="bl-select near-type" value={f.type} onChange={e => set({ type: e.target.value as Filter['type'] })} aria-label="Тип предложения">
              <option value="all">все типы</option>
              {(Object.entries(TYPES) as [S['OfferType'], { t: string }][]).map(([k, t]) => <option key={k} value={k}>{t.t}</option>)}
            </select>
            <Segmented label="Радиус" value={f.radius} options={RADII.map(r => [r, km(r)])} onChange={radius => set({ radius })} />
          </div>
        </div>

        {/* человек ищет — одна ровная сетка; не ищет — карта и ближайшие */}
        {filtered
          ? (list.length
              ? <div className="bl-grid near-found" style={{ ['--bl-cols' as string]: 4 }}>{list.map(o => <Card key={o.id} o={o} onOpen={show} />)}</div>
              : empty)
          : (
          <section className={`bl-section near-box${mapOpen ? ' is-map' : ''}`} aria-label="Ближе всего">
            <div className="bl-row near-box__head">
              <span className="bl-caption">{list.length} мест в радиусе {km(f.radius)}</span>
              <button className="bl-btn bl-btn--s bl-show-mobile" aria-pressed={mapOpen} onClick={() => setMapOpen(!mapOpen)}>{mapOpen ? 'списком' : 'на карте'}</button>
            </div>
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
                {!list.length && empty}
              </div>
            </div>
          </section>
        )}

        {!filtered && SECTIONS.map((sec, i) => {
          // широкие карточки первыми, дальше по расстоянию; показанное в «для тебя» не повторяем
          const items = list.filter(o => sec.cats.includes(o.cat) && !FOR_YOU.some(([id]) => id === o.id)).sort((x, y) => +!!y.wide - +!!x.wide)
          const layout = (sec.layout === 'hero' || sec.layout === 'pair') && items.length < 3 ? 'carousel' : sec.layout
          return [
            items.length > 0 && (
              <section key={sec.t} className="bl-stack" style={{ ['--bl-gap' as string]: '16px' }}>
                <div className="bl-row" style={{ justifyContent: 'space-between' }}>
                  <h2 className="bl-h3">{sec.t} <span className="bl-secondary">{items.length}</span></h2>
                  <button className="bl-btn bl-btn--ghost" onClick={() => go({ cats: sec.cats })}>все →</button>
                </div>
                {layout === 'hero' && (
                  <div className="near-hero">{items.slice(0, 3).map((o, j) => <Card key={o.id} o={o} wide={j === 0} onOpen={show} />)}</div>
                )}
                {layout === 'carousel' && (
                  <div className="near-scroller near-carousel">
                    {items.map(o => <Card key={o.id} o={o} wide={o.wide} onOpen={show} />)}
                    {sec.cats.includes('food') && <Invite />}
                  </div>
                )}
                {layout === 'pair' && (
                  <div className="near-pair">
                    <Card o={items[0]} wide onOpen={show} />
                    <div className="near-pair__side">{items.slice(1, 3).map(o => <Row key={o.id} o={o} onOpen={show} />)}</div>
                  </div>
                )}
                {layout === 'list' && (
                  <div className="near-rows">{items.slice(0, 6).map(o => <Row key={o.id} o={o} onOpen={show} />)}</div>
                )}
              </section>
            ),
            i === BANNER_AFTER && (
              <section key="banner" className="bl-card near-banner" data-theme="invert">
                <span className="bl-stack" style={{ ['--bl-gap' as string]: '8px' }}>
                  <span className="bl-caption">подборка билайна</span>
                  <span className="bl-h2">переезд без хлопот</span>
                  <span className="bl-body bl-secondary">уборка, мастер на час и новые замки — всё в паре километров от нового дома</span>
                </span>
                <button className="bl-btn bl-btn--dark bl-btn--l" onClick={() => go({ cats: ['home'], type: 'all', radius: 3000 })}>смотреть подборку</button>
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

/* ───────── карточки каталога ───────── */
function Card({ o, wide, onOpen }: { o: Offer; wide?: boolean; onOpen: (id: string) => void }) {
  return (
    <button className={`bl-card bl-card--white near-card${wide ? ' near-card--wide' : ''}`} onClick={() => onOpen(o.id)}>
      <Creative o={o} erid={erid(o)} wide={wide} />
      <span className="near-card__body">
        <span className="bl-body">{o.partner}</span>
        <span className="bl-row" style={{ gap: 8 }}><Tag o={o} /><span className="bl-caption">{km(o.dist)}</span><Till o={o} /></span>
        {o.campaign && <span className="demo-note">ваша кампания из кабинета</span>}
      </span>
    </button>
  )
}

function Row({ o, onOpen }: { o: Offer; onOpen: (id: string) => void }) {
  return (
    <button className="bl-card bl-card--white near-row" onClick={() => onOpen(o.id)}>
      <Tile o={o} className="near-row__tile" />
      <span className="near-row__body">
        <span className="near-row__big">{o.big}</span>
        <span className="bl-body">{o.small}</span>
        <span className="bl-row" style={{ gap: 8 }}><Tag o={o} /><span className="bl-caption">{o.mark} · {km(o.dist)}</span></span>
        <span><Till o={o} /></span>
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
          <span className="bl-row" style={{ gap: 8 }}><Tag o={o} /><Till o={o} /></span>
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
            <div className="near-code" aria-label={`промокод ${o.code}`}>{o.code}</div>
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
          <span className="demo-note">что увидит партнёр</span>
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
