import { useState } from 'react'
import { Check, Smartphone, Globe } from 'lucide-react'
import { ChoiceChips } from './ChoiceChips'
import { CampaignCreative } from './CampaignCreative'
import type { OfferDraft } from '../../shared/campaign-offer'

const surfaces = [
  { id: 'main', title: 'Главная', heading: 'Мой билайн', note: 'Предложение на главной приложения, рядом с балансом.' },
  { id: 'showcase', title: 'Подарки и акции', heading: 'Подарки и акции', note: 'Карточка среди предложений магазинов и кафе.' },
  { id: 'paid', title: 'После оплаты', heading: 'Оплата прошла', note: 'Предложение после пополнения баланса.' },
  { id: 'rest', title: 'Витрины партнёров', heading: 'Предложения партнёров', note: 'Широкий блок на сайте партнёра.' },
] as const

export function OfferSurfaces({ compact, inlinePlaces, ...props }: { compact?: boolean; inlinePlaces?: boolean; legalNameBelow?: boolean; name: string; offer: OfferDraft; image: string; illustration: string; logo: string }) {
  const [selected, setSelected] = useState<typeof surfaces[number]['id']>('main')
  const surface = surfaces.find(item => item.id === selected)!
  if (compact) return <aside className="campaign-draft-preview">
    <h4>Как увидит клиент</h4><p aria-live="polite">{surface.heading}</p>
    {props.offer.layout === 'artwork' && !props.image ? <div className="offer-surface-empty">Загрузите готовый макет</div>
      : <div className="offer-surface-stage" data-surface={selected}><div className="offer-device"><CampaignCreative {...props} disabled={false}/></div></div>}
    {inlinePlaces ? <ChoiceChips label="Место показа" options={surfaces.map(item => item.id)} value={selected} onChange={setSelected}
      labelFor={value => surfaces.find(item => item.id === value)!.title}/>
      : <label className="bl-field">Место показа<select className="bl-input" value={selected} onChange={e => setSelected(e.target.value as typeof selected)}>{surfaces.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
  </aside>
  return <section className="offer-surfaces" aria-label="Предпросмотр поверхностей">
    <div className="offer-surfaces-heading"><h4>Предпросмотр</h4><span>Так увидит клиент</span></div>
    <div className="offer-surface-tabs" role="group" aria-label="Поверхность показа">{surfaces.map(item => <button type="button" key={item.id} aria-pressed={item.id === selected} onClick={() => setSelected(item.id)}>{item.title}</button>)}</div>
    <div className="offer-surface-stage" data-surface={selected}>
      <div className="offer-device">
        <div className="offer-device-bar">{selected === 'rest' ? <Globe size={16}/> : <Smartphone size={16}/>}<span>{selected === 'rest' ? 'Сайт партнёра' : 'билайн'}</span><span aria-hidden="true">•••</span></div>
        <div className="offer-device-content">
          <strong>{surface.heading}</strong>
          {selected === 'main' && <div className="offer-surface-placeholder" aria-hidden="true"><span>Баланс и услуги</span><i/><i/></div>}
          {selected === 'paid' && <p className="offer-surface-success"><Check size={20}/>Баланс пополнен</p>}
          {props.offer.layout === 'artwork' && !props.image ? <div className="offer-surface-empty">Здесь появится ваш макет</div>
            : <CampaignCreative {...props} disabled={false}/>}
          <span className="offer-device-link">Подробнее о предложении</span>
        </div>
      </div>
    </div>
    <p aria-live="polite">{surface.note} Пример размещения: окончательный вид зависит от площадки.</p>
  </section>
}
