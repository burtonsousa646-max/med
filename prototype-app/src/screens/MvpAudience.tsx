import { Plus, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { addressError, areaOf, filters, geo, modeOf, targetingErrors, whenLabel, type MvpTargeting } from '../../shared/mvp-promo'
import { Check } from '../ui'
import { ChoiceChips } from './ChoiceChips'

type TargetingProps = { value:MvpTargeting; showErrors?:boolean; onChange:(patch:Partial<MvpTargeting>)=>void }

export function OfferLocations({ value: t, onChange, showErrors=false }: TargetingProps) {
  const addresses = t.addresses?.length ? t.addresses : ['']
  const firstInvalid=addresses.findIndex((_,i)=>addressError(addresses,i))
  return <section className="bl-section mvp-sheet">
      <fieldset className="mvp-group mvp-targeting" tabIndex={-1} id="promo-locations">
        <legend className="bl-h4">точки продаж</legend>
        <Check label="Работаю только онлайн" checked={!!t.online} onChange={online => onChange({ online })}/>
        {!t.online && <>
          {addresses.map((address, i) => {
            const error = showErrors && addressError(addresses, i)
            return <div className="mvp-address" key={i}>
              <label className={'bl-field' + (error ? ' is-error' : '')}><span className="bl-field__label" id={'promo-point-label-'+i}>Адрес точки {i + 1}</span>
                <input className="bl-input" id={i===firstInvalid?'promo-addresses':'promo-point-'+i} value={address} aria-invalid={!!error}
                  aria-labelledby={'promo-point-label-'+i} aria-describedby={error?'promo-point-error-'+i:undefined} maxLength={200} placeholder="Город, улица, дом"
                  onChange={e => onChange({ addresses: addresses.map((a, index) => index === i ? e.target.value : a) })}/>
                {error && <span id={'promo-point-error-'+i} className="bl-field__caption">{error}</span>}
              </label>
              {addresses.length > 1 && <button type="button" className="bl-icon-btn" aria-label={'Удалить точку ' + (i + 1)} onClick={() => onChange({ addresses: addresses.filter((_, index) => index !== i) })}><X size={18}/></button>}
            </div>
          })}
          {addresses.length < 10 && <button type="button" className="bl-btn mvp-add-point" onClick={() => {
            onChange({ addresses: [...addresses, ''] })
            requestAnimationFrame(()=>document.getElementById('promo-point-label-'+addresses.length)?.parentElement?.querySelector('input')?.focus())
          }}><Plus size={16}/>Добавить точку</button>}
        </>}
      </fieldset>
    </section>
}

export function MvpAudience({ value:t, onChange, showErrors=false }:TargetingProps) {
  const manual = modeOf(t) === 'manual'
  const cityError = showErrors && targetingErrors(t).city
  return <section className="bl-section mvp-sheet">
      <fieldset className="mvp-group mvp-targeting">
        <legend className="bl-h4" id="promo-audience-heading" tabIndex={-1}>кому показать предложение</legend>
        <div className="mvp-audience-mode">
          <ChoiceChips label="Настройка аудитории" options={['auto', 'manual'] as const} value={modeOf(t)}
            labelFor={v => v === 'auto' ? <><Sparkles size={18} aria-hidden="true"/>Автоматически</> : <><SlidersHorizontal size={18} aria-hidden="true"/>Вручную</>}
            onChange={mode => onChange({ mode })}/>
        </div>
        {manual ? <>
          <ChoiceChips label="География показа" options={t.online ? geo.choices.slice(1) : geo.choices} value={areaOf(t)} onChange={area => onChange({ area })}/>
          {areaOf(t) === geo.choices[1] && <label className={'bl-field' + (cityError ? ' is-error' : '')}><span className="bl-field__label" id="promo-city-label">Город показа</span>
            <input className="bl-input" id="promo-city" value={t.city ?? ''} autoComplete="address-level2" maxLength={80} aria-invalid={!!cityError} aria-labelledby="promo-city-label" aria-describedby={cityError?'promo-city-error':undefined} onChange={e => onChange({ city: e.target.value })}/>
            {cityError && <span id="promo-city-error" className="bl-field__caption">{cityError}</span>}</label>}
          {filters.map(({key, group}) => <ChoiceChips key={key} label={key === 'moment' ? 'Когда показать' : group.title} options={group.choices} value={t[key] ?? group.choices[0]}
            labelFor={key === 'moment' ? whenLabel : undefined}
            onChange={v => onChange({ [key]: v })}/>)}
          <label className="bl-field"><span className="bl-field__label">Что ещё учесть при показе? (необязательно)</span>
            <textarea className="bl-input" rows={2} maxLength={400} value={t.wishes ?? ''} onChange={e => onChange({ wishes: e.target.value })}/></label>
        </> : <p className="bl-caption">{t.online ? 'Покажем по всей России' : 'Покажем рядом с вашими точками'}. Время показа, пол, возраст и доход не ограничены.</p>}
      </fieldset>
    </section>
}
