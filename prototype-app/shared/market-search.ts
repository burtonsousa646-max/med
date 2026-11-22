import { catalogFields, marketGroups } from './market-catalog.ts'
import type { MarketOffer } from './market.ts'

const aliases:Record<string,string> = {
  флаувау:'flowwow флау вау', яндекс:'yandex', sunlight:'санлайт', usmall:'юсмолл юсмол',
  афиша:'afisha', чиббис:'chibbis', сберздоровье:'сбер здоровье', '585gold':'585 голд', столото:'stoloto',
}
function normalize(value:string) {
  return value.normalize('NFKC').toLowerCase().replaceAll('ё','е').replace(/к[еэ]шб[еэ]к/g,'кешбэк')
    .replace(/(\d)[ \u00a0](?=\d{3}(?:\D|$))/g,'$1').replace(/₽/g,' руб ').replace(/%/g,' процент ')
    .replace(/[^\p{L}\p{N}]+/gu,' ').trim()
}
export function searchColumns(card:MarketOffer) {
  const f=catalogFields(card), source=card.source
  return [f.brand+' '+(aliases[normalize(f.brand)] ?? '')+' '+card.name, f.benefit+' '+f.condition+' '+card.offer.title,
    (marketGroups[f.group] ?? '')+' '+card.category, f.description, card.addresses.join(' '),
    [source?.validity,card.offer.until,...(source?.sections ?? []).map(s=>s.title+' '+(/^описание/i.test(s.title) ? '' : s.text)+' '+s.links.map(l=>l.name).join(' '))].join(' ')].map(normalize)
}
const stop=new Set('в и на за из с со от по у для или мне где найти хочу можно'.split(' '))
function prefix(word:string) {
  if (/^руб(?:л|$)/.test(word)) return 'руб'
  if (/^подар(ок|к)/.test(word)) return 'подар'
  if (word.length<5) return word
  const root=word.replace(/(?:иями|ями|ами|ого|ему|ому|ыми|ими|ая|ую|ые|ое|ой|ов|ам|ах|ям|ях|ом|ем|ы|и|а|я|у|е|ю)$/,'')
  return root.length>=4 ? root : word
}
export function searchWords(query:string) {
  return [...new Set(normalize(query).split(' ').filter(w=>w && !stop.has(w)).map(prefix))]
}
export function matchesWords(token:string,word:string) {
  return /^\d+$/.test(word) ? token===word : token.startsWith(word)
}
export function demoRank(card:MarketOffer,words:string[]) {
  if (!words.length) return 0
  const columns=searchColumns(card).map(col=>col.split(' ')), weights=[16,9,5,3,3,1]
  let score=0
  for (const word of words) {
    const i=columns.findIndex(col=>col.some(t=>matchesWords(t,word)))
    if (i===-1) return 0
    score+=weights[i]
  }
  return score
}
export function searchReply(total:number) {
  return total ? 'Найдено предложений: '+total : 'Совпадений нет. Попробуйте другой запрос.'
}

const latin = "qwertyuiop[]asdfghjkl;'zxcvbnm,."
const russian = 'йцукенгшщзхъфывапролджэячсмитьбю'
export function keyboardWords(query:string) {
  const lower=query.toLowerCase()
  const [from,to]=/[а-яё]/.test(lower) ? [russian,latin] : [latin,russian]
  return searchWords(Array.from(lower,ch=>from.includes(ch) ? to[from.indexOf(ch)] : ch).join(''))
}

// Accept one substitution, insertion, missing letter or swapped pair.
function nearSpelling(a:string,b:string) {
  if (Math.abs(a.length-b.length)>1) return false
  if (a.length>b.length) return nearSpelling(b,a)
  let i=0
  while (i<a.length && a[i]===b[i]) i++
  if (a.length!==b.length) return a.slice(i)===b.slice(i+1)
  if (a.slice(i+1)===b.slice(i+1)) return true
  return a[i]===b[i+1] && a[i+1]===b[i] && a.slice(i+2)===b.slice(i+2)
}
export function spellingWord(word:string,vocabulary:Iterable<string>) {
  if (word.length<4 || /\d/.test(word)) return word
  for (const token of vocabulary) {
    if (token[0]!==word[0]) continue
    const root=prefix(token)
    if (nearSpelling(word,root)) return root
  }
  return word
}
