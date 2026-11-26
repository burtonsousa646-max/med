import type { MarketOffer } from '../../shared/market'
import { emptyOffer } from '../../shared/campaign-offer'
import { marketGroups } from '../../shared/market-catalog'
import { OFFERS } from './near-offers'

const demoId = (id: string) => 'near-' + id
const examples = new Map(OFFERS.map(offer => [demoId(offer.id), offer]))
export const districtOffers: MarketOffer[] = OFFERS.map(o => ({
  id: demoId(o.id), name: o.partner, category: marketGroups[o.cat], group: o.cat,
  // Example total for the explicitly labelled neighbourhood demo.
  ...(o.id === 'p5-new' && {selectionCount: 23_033}),
  catalog: { brand: o.partner, benefit: o.big, condition: o.small },
  description: 'Пример предложения в Хамовниках. ' + o.cond + '.',
  offer: { ...emptyOffer, title: o.title, promo: o.code ?? '' },
  online: false, addresses: o.addr ? [o.addr] : [], website: '', logo: '', erid: '',
  image: '/img/near/' + o.img + '.avif',
}))

export function districtPoint(id: string) {
  const o = examples.get(id)
  return o && !o.where ? {distance: o.dist, angle: o.a} : undefined
}

export const distanceText = (m: number) => m < 1000 ? m + ' м' : (m / 1000).toLocaleString('ru-RU') + ' км'

export function inRadius(cards: MarketOffer[], radius: number) {
  if (!radius) return cards
  return cards.filter(o => (districtPoint(o.id)?.distance ?? Infinity) <= radius)
    .sort((a,b) => districtPoint(a.id)!.distance - districtPoint(b.id)!.distance)
}

const intents: [RegExp, string[]][] = [
  [/пообед|поужин|недорого поесть|перекус|позавтрак|выпить кофе/, ['food']],
  [/подарок|подарить|порадовать/, ['shopping','beauty','fun']],
  [/переобу|помыть машин|подготовить машин/, ['auto']],
  [/пострич|стрижк|маникюр/, ['beauty']],
  [/занять реб[её]нка/, ['kids']],
  [/новой квартир|переезд/, ['home']],
]
const budgetPattern = /до\s*(\d+(?:[ \u00a0]\d{3})*)(?!\d)(?!\s*(?:км|метр|м\b))\s*(?:₽|руб(?:лей|ля|ль)?\.?)?/iu
export function questionBudget(text: string) {
  const match = budgetPattern.exec(text)
  return { topic: text.replace(budgetPattern,' ').trim(), maximum: match ? Number(match[1].replace(/\s/g,'')) : undefined }
}
export function refineQuestion(previous: string, text: string) {
  const {topic,maximum} = questionBudget(text)
  return previous && maximum !== undefined && !topic ? (questionBudget(previous).topic + ' до ' + maximum + ' ₽').trim() : text
}
function priceOf(id: string) {
  const o = examples.get(id)
  if (o?.price !== undefined) return o.price
  if (o && /^\d[\d\s]*\s₽$/.test(o.big) && o.id!=='p5-job') return Number(o.big.replace(/\D/g,''))
  return undefined
}
export function withinBudget(card: MarketOffer, maximum: number | undefined) {
  return maximum === undefined || (priceOf(card.id) ?? Infinity) <= maximum
}
export function intentMatches(topic: string, cards: MarketOffer[]) {
  const intent = intents.find(([pattern])=>pattern.test(topic.toLowerCase()))
  return intent ? cards.filter(card=>intent[1].includes(card.group)) : []
}
