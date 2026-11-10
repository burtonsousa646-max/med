import { useId, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Building2, Check, MapPin, Plus, X } from 'lucide-react'
import { Field } from './CampaignField'
import { formatPhone, innError, normalizeBusinessWebsite, phoneError, textError, websiteError, type Business } from '../../shared/campaign-business'

import { Creative, creativeOf } from '../creative'
import { DEMO_AD } from '../mock'

export type BusinessPhase = 'identify' | 'review'
type Props = {
  phase: BusinessPhase; business: Business; onChange: (value: Business) => void;
  hasProfile: boolean; registeredAddress: string; suggestionName?: string; lookupError: string; searching: boolean; onCancel: () => void; onManual: () => void;
  addresses: string[]; onAddresses: (value: string[]) => void; online: boolean; onOnline: (value: boolean) => void;
  offerAccepted: boolean; onOfferAccepted?: (value: boolean) => void;
}
export function BusinessSetup({phase,business,onChange,hasProfile,registeredAddress,suggestionName,lookupError,searching,onCancel,onManual,addresses,onAddresses,online,onOnline,offerAccepted,onOfferAccepted}: Props) {
  const reduce = useReducedMotion()
  const consentId = useId()
  const [consentError, setConsentError] = useState(false)
  const update = (key: keyof Business, value: string) => onChange({...business,[key]:value})
  return phase === 'identify' ? <div className="v3-business-start">
    <div className="v3-fields v3-business-inputs">
      <Field label="ИНН" name="inn" inputMode="numeric" autoComplete="off" placeholder="10 или 12 цифр" value={business.inn} onChange={e=>update('inn',e.target.value.replace(/\D/g,''))} maxLength={12} error={innError(business.inn)} hint={business.name ? "При смене ИНН текущие настройки сбросятся" : "10 цифр для компании или 12 для ИП"} required />
      <Field label="контактный телефон" name="phone" type="tel" autoComplete="tel" placeholder="+7 (900) 000-00-00" value={business.phone} onChange={e=>update('phone',e.target.value)} onBlur={e=>update('phone',formatPhone(e.target.value))} maxLength={25} error={phoneError(business.phone)} hint="Укажите номер, по которому с вами можно связаться" required />
      {onOfferAccepted && <div className="v3-offer-consent">
        <label className="bl-check">
          <input type="checkbox" name="offerAccepted" required checked={offerAccepted} aria-invalid={consentError && !offerAccepted} aria-describedby={consentError && !offerAccepted ? consentId : undefined} onChange={event => { onOfferAccepted(event.target.checked); setConsentError(false) }} onInvalid={event => { event.preventDefault(); setConsentError(true) }}/>
          <span className="bl-check__box" aria-hidden="true"/>
          <span>Принимаю условия <a href={`${import.meta.env.BASE_URL}docs/oferta_0.1.pdf`} target="_blank" rel="noopener noreferrer">оферты</a></span>
        </label>
        <p className="bl-caption">Черновик сохраняется в браузере, а после принятия оферты и на сервере. Когда вы завершите настройку, данные заявки получит команда билайна.</p>
        {consentError && !offerAccepted && <p id={consentId} className="v3-offer-consent-error" role="alert">Чтобы продолжить, примите условия оферты</p>}
      </div>}
      <div className="v3-lookup-feedback" role="status" aria-live="polite">
        {searching ? <motion.div initial={reduce ? false : {opacity:0,y:5}} animate={{opacity:1,y:0}} className="v3-lookup-loading"><span className="v3-lookup-spinner" aria-hidden="true"/><div>ищем ваш бизнес<small>Проверяем ИНН в DaData</small></div><button type="button" className="v3-text-button" onClick={onCancel}>отменить</button></motion.div>
          : suggestionName ? <div className="v3-lookup-loading"><Check size={18} aria-hidden="true"/><span>{suggestionName}</span></div>
          : lookupError ? <p className="bl-caption">{lookupError}</p> : null}
      </div>
      <button type="button" className="v3-text-button v3-manual-entry" onClick={onManual}>заполнить данные вручную <ArrowRight size={15}/></button>
    </div>
    <aside className="v3-business-explainer campaign-business-preview">
      <h4>ваша будущая реклама</h4>
      <p>Здесь появится ваше предложение для клиентов</p>
      <motion.div className="campaign-example-creative" animate={{y: searching ? -4 : 0}} transition={{duration:reduce ? 0:.3}}>
        <Creative o={{...creativeOf(DEMO_AD.brand, DEMO_AD.offer, DEMO_AD.img), tone: 'violet'}} erid="реклама" wide/>
        <div><span>{DEMO_AD.brand}</span><small>так будет выглядеть предложение</small></div>
      </motion.div>
    </aside>
  </div> : <div className="v3-business-review">
    <div className="v3-fields">
      <div className="v3-source-note"><span>{hasProfile ? <Check size={14}/> : <Building2 size={14}/>} данные бизнеса</span><small>ИНН {business.inn} · {business.phone}</small></div>
      <Field label="название для клиентов" data-analytics-field="name" value={business.name} maxLength={80} onChange={e=>update('name',e.target.value)} required error={textError(business.name,'Название')} hint="Можно указать название на вывеске"/>
      <Field label="чем занимаетесь" data-analytics-field="category" value={business.category} maxLength={100} onChange={e=>update('category',e.target.value)} required error={textError(business.category,'Сфера бизнеса',3)} placeholder="например, кофе и завтраки" hint="По этим данным подготовим текст предложения"/>
      <Field label="город" data-analytics-field="city" value={business.city} maxLength={80} autoComplete="address-level2" onChange={e=>update('city',e.target.value)} required={!online} error={!online ? textError(business.city,'Город') : ''} placeholder="Город, где работает ваш бизнес"/>
      <Field label="сайт (необязательно)" data-analytics-field="website" value={business.website} maxLength={250} inputMode="url" autoComplete="url" onChange={e=>update('website',e.target.value)} onBlur={e=>{ const url = normalizeBusinessWebsite(e.target.value); if (url) update('website',url) }} error={websiteError(business.website)} placeholder="example.ru"/>
    </div>
    <section className="v3-business-locations">
      <div className="v3-location-title"><MapPin size={22}/><div><h4>куда пригласим клиентов?</h4><p>Добавьте адреса, по которым будете принимать клиентов</p></div></div>
      <label className="v3-online-check"><input type="checkbox" checked={online} onChange={e=>onOnline(e.target.checked)}/><span>работаю только онлайн</span></label>
      {!online && <>
        {registeredAddress && !addresses.includes(registeredAddress) && <div className="v3-registered-address"><span>юридический адрес</span><p>{registeredAddress}</p><small>Здесь можно принять клиентов?</small><button type="button" className="v3-text-button" onClick={()=>onAddresses([...addresses.filter(a=>a.trim()),registeredAddress].slice(0,10))}><Plus size={15}/> добавить эту точку</button></div>}
        <div className="v3-location-list">{addresses.map((address,index)=><motion.div className="v3-location-row" key={index} initial={reduce ? false : {opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:reduce ? 0:.2}}>
          <span className="v3-location-number">{String(index+1).padStart(2,'0')}</span><Field data-analytics-field="address" label={'адрес точки ' + (index+1)} value={address} maxLength={200} onChange={e=>onAddresses(addresses.map((a,i)=>i===index?e.target.value:a))} placeholder="улица, дом" required error={textError(address,'Адрес',5) || (addresses.some((a,i)=>i!==index&&a.trim().toLowerCase()===address.trim().toLowerCase())?'Этот адрес уже добавлен':'')}/>
          {addresses.length>1&&<button type="button" className="bl-icon-btn" aria-label={'Удалить точку '+(index+1)} onClick={()=>onAddresses(addresses.filter((_,i)=>i!==index))}><X size={16}/></button>}
        </motion.div>)}</div>
        {addresses.length<10&&<button type="button" className="v3-text-button" onClick={()=>onAddresses([...addresses,''])}><Plus size={16}/> ещё точка</button>}
        <p className="v3-location-hint">Выберите адреса, по которым сможете принять клиентов</p>
      </>}
      {online&&<motion.p className="v3-online-note" initial={reduce ? false : {opacity:0}} animate={{opacity:1}}>Город или всю Россию можно выбрать на шаге «Выбор клиентов»</motion.p>}
    </section>
  </div>
}
