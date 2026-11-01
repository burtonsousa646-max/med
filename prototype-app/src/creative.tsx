import { useState } from 'react'
import { Baby, Car, Coffee, Dumbbell, HeartPulse, House, Scissors, ShoppingBasket, Ticket, type LucideIcon } from 'lucide-react'

/* Креатив карточки в витрине «лучшее рядом», как у партнёрских акций на beeline.ru:
   цветной квадрат, знак партнёра, условие крупно, предмет из public/img/near и плашка erid.
   Текст собирается кодом, картинка — только предмет без надписей: партнёр меняет условие, креатив обновляется сам. */

export type Cat = 'grocery' | 'food' | 'beauty' | 'health' | 'auto' | 'home' | 'sport' | 'kids' | 'fun'
export type Tone = 'red' | 'green' | 'blue' | 'violet' | 'magenta' | 'teal' | 'dark' | 'light'
export type CreativeData = { mark: string; big: string; small: string; tone: Tone; img: string; cat: Cat }

export const CATS: Record<Cat, [string, LucideIcon]> = {
  grocery: ['магазины у дома', ShoppingBasket], food: ['еда и кофе', Coffee], beauty: ['красота', Scissors], health: ['здоровье', HeartPulse],
  auto: ['авто', Car], home: ['дом', House], sport: ['спорт', Dumbbell], kids: ['дети', Baby], fun: ['развлечения', Ticket],
}

// Креатив кампании из кабинета: картинка, выбранная при сборке (Campaign.img), задаёт фон и предмет
const TONES: Tone[] = ['dark', 'light', 'violet']
export function creativeOf(brand: string, offer: string, img: number): CreativeData {
  const m = /^(−?\d[\d\s]*\s?(?:%|₽)?)\s+(.+)$/.exec(offer)
  // ponytail: категория демо-компании зашита, в бою придёт из ОКВЭД компании
  return { mark: brand.replace(/^.*«(.+)»$/, '$1'), big: m ? m[1] : offer, small: m ? m[2] : '', tone: TONES[img] ?? 'dark', img: `own-${img}`, cat: 'food' }
}

// предмет из public/img/near, пока файла нет — иконка категории.
// AVIF 480 px (~25 КБ) вместо PNG 640 px (~270 КБ); PNG — для браузеров без AVIF
export function CrImg({ o }: { o: CreativeData }) {
  const [failed, setFailed] = useState(false)
  const Icon = CATS[o.cat][1]
  const base = `${import.meta.env.BASE_URL}img/near/${o.img}`
  return failed
    ? <Icon className="cr__icon" aria-hidden="true" />
    : <picture><source srcSet={`${base}.avif`} type="image/avif" /><img className="cr__img" src={`${base}.png`} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /></picture>
}

export function Creative({ o, erid, wide }: { o: CreativeData; erid: string; wide?: boolean }) {
  return (
    <div className={`cr cr--${o.tone}${wide ? ' cr--wide' : ''}`}>
      <CrImg o={o} />
      <span className="cr__text">
        <span className="cr__mark">{o.mark}</span>
        {/* условие без цифры, например «второй кофе в подарок», переносится строками */}
        <span className={`cr__big${!/^[−\d]/.test(o.big) ? ' cr__big--text' : o.big.length > 6 ? ' cr__big--long' : ''}`}>{o.big}</span>
        {o.small && <span className="cr__small">{o.small}</span>}
      </span>
      <span className="cr__erid">{erid}</span>
    </div>
  )
}
