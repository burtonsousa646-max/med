import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { CircleCheck, Sparkles } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { marketOfferPath, type MarketOffer } from '../../shared/market'
import { districtPoint, distanceText } from './market-nearby'
import './market-discovery.css'

const questions = ['Недорого пообедать', 'Найти подарок маме', 'Подготовить машину к зиме']
export function useQuestionHint(active: boolean) {
  const reduced = useReducedMotion()
  const [tick,setTick] = useState(0)
  useEffect(()=>{
    if (!active || reduced) return
    const timer=setInterval(()=>setTick(t=>t+1),70)
    return ()=>clearInterval(timer)
  },[active,reduced])
  if (!active || reduced) return questions[0]
  const length=(q:string)=>q.length*2+20
  let at=tick % questions.reduce((sum,q)=>sum+length(q),0)
  for (const q of questions) {
    if (at<length(q)) return q.slice(0,Math.min(at,q.length,length(q)-at))
    at-=length(q)
  }
  return ''
}

export function Thinking({offers}:{offers:MarketOffer[]}) {
  const [step,setStep]=useState(0)
  useEffect(()=>{
    const next=setTimeout(()=>setStep(1),550)
    const last=setTimeout(()=>setStep(2),1100)
    return ()=>{ clearTimeout(next); clearTimeout(last) }
  },[])
  const matches=offers.slice(0,3)
  return <div className="market-thinking" role="status" aria-label="Идёт подбор предложений">
    <ul className="near-think">{['Ищу предложения','Сверяю условия','Собираю подборку'].map((label,i)=>
      <li key={label} className={i<step ? 'is-done' : i===step ? 'is-now' : ''}>
        {i<step ? <CircleCheck size={18}/> : <Sparkles size={18}/>} {label}
      </li>)}</ul>
    <div className="market-thinking__places" aria-hidden="true">
      {(matches.length ? matches : [undefined,undefined,undefined]).map((offer,i)=>
        <div className="near-skel market-thinking__place" key={offer?.id ?? i}>
          {offer && <div className="market-thinking__match" style={{animationDelay:[120,330,480][i]+'ms'}}>
            {offer.image && <img src={offer.image} alt=""/>}
            <span>{offer.catalog?.brand ?? offer.name}</span>
          </div>}
        </div>)}
    </div>
  </div>
}
export function AnimatedReply({text}:{text:string}) {
  return <p className="bl-body near-ask__reply" aria-live="polite">
    <Sparkles size={18} aria-hidden="true"/><span className="market-sr-only">{text}</span>
    {text.split(' ').map((word,i)=><span aria-hidden="true" key={i} className="market-answer-word" style={{animationDelay:Math.min(i,24)*35+'ms'}}>{word} </span>)}
  </p>
}

export function DistrictMap({items,radius,onNavigate}:{items:MarketOffer[];radius:number;onNavigate:(id:string)=>void}) {
  const [hot,setHot] = useState('')
  const places=items.flatMap(offer=>{
    const point=districtPoint(offer.id)
    return point ? [{offer,...point}] : []
  })
  return <section className="bl-section near-box" aria-label="Карта предложений">
    <h2 className="bl-h3">Хамовники</h2>
    <p className="bl-caption">Демонстрационная карта. Расстояния указаны от точки в центре района.</p>
    <div className="near-box__grid">
      <div className="near-map" style={{'--r':44} as CSSProperties}>
        <svg viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <path d="M-20 330 C120 290 220 360 360 320 S560 250 640 290" fill="none" stroke="var(--color-surface-03)" strokeWidth="34"/>
          <g fill="var(--color-surface-01)"><rect x="380" y="40" width="150" height="110" rx="24"/><rect x="60" y="60" width="90" height="70" rx="16"/></g>
          <g fill="none" stroke="var(--color-background-secondary)"><path strokeWidth="12" d="M0 200H600M300 0V400M0 70L600 150M120 0L200 400M460 0L420 400"/><path strokeWidth="5" d="M0 260H600M0 120H600M60 0V400M380 0V400M540 0V400M220 0V400"/></g>
        </svg>
        <div className="near-map__ring"/><div className="near-map__me" title="Центр поиска"/>
        {places.map(({offer,distance,angle})=>{
          const a=angle*Math.PI/180, scale=44*distance/radius
          return <Link key={offer.id} to={marketOfferPath(offer.id)} state={{fromCatalog:true}} aria-label={(offer.catalog?.brand || offer.name)+', '+distanceText(distance)}
            className={'near-pin market-map-pin'+(hot===offer.id ? ' is-hot' : '')}
            onPointerEnter={()=>setHot(offer.id)} onPointerLeave={()=>setHot('')} onFocus={()=>setHot(offer.id)} onBlur={()=>setHot('')}
            onClick={()=>onNavigate(offer.id)} style={{'--dx':Math.cos(a)*scale,'--dy':Math.sin(a)*scale} as CSSProperties}>
            <span className="near-pin__big">{offer.catalog?.benefit ?? offer.catalog?.brand ?? offer.name}</span>
          </Link>
        })}
      </div>
      <div className="near-list" aria-label="Сначала ближайшие">{places.map(({offer,distance})=>
        <Link key={offer.id} className="bl-cell near-cell" to={marketOfferPath(offer.id)} state={{fromCatalog:true}}
          onClick={()=>onNavigate(offer.id)} onFocus={()=>setHot(offer.id)} onBlur={()=>setHot('')} onPointerEnter={()=>setHot(offer.id)} onPointerLeave={()=>setHot('')}>
          <span className="bl-cell__main"><span className="bl-cell__title">{offer.catalog?.brand || offer.name}</span><span className="bl-cell__sub">{offer.offer.title}</span></span>
          <span className="bl-caption">{distanceText(distance)}</span>
        </Link>)}
        {!places.length && <p className="bl-caption">В этом радиусе подходящих мест нет.</p>}
      </div>
    </div>
  </section>
}
