import { useId, type ReactNode, type Ref } from 'react'
import { Building2, Check, ChevronDown, Globe2, MapPin, Mic, SlidersHorizontal, Users } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { Field } from './CampaignField'
import { textError } from '../../shared/campaign-business'
import './campaign-audience.css'

export type AudienceSummary = { place: string; people: string; moment: string }
type Group = { title: string; choices: string[] }

export function AudienceSetup({ groups, values, onChange, city, onCityChange, online, addresses, triggers, onTriggers, onDictate, listening, voiceMessage, disabled, summary, preview }: {
  groups: Group[]; values: number[]; onChange: (value: number[]) => void;
  city: string; onCityChange: (city: string) => void; online: boolean; addresses: string[];
  triggers: string; onTriggers: (value: string) => void; onDictate: () => void;
  listening: boolean; voiceMessage: string; disabled: boolean; summary: AudienceSummary; preview: ReactNode;
}) {
  const id = useId()
  const select = (group: number, choice: number) => onChange(values.map((value, index) => index === group ? choice : value))
  const geo = [
    { title: 'Рядом с точками', detail: online ? 'Для бизнеса с адресом' : addresses.filter(a => a.trim()).join('; '), Icon: MapPin },
    { title: 'Весь город', detail: city.trim() || 'Укажите город', Icon: Building2 },
    { title: 'Вся Россия', detail: 'Без привязки к городу', Icon: Globe2 },
  ]
  return <div className="campaign-audience-layout">
    <div className="campaign-audience-settings">
      <fieldset className="audience-geography" disabled={disabled}>
        <legend>Где искать клиентов?</legend>
        <p>Выберите, где показывать предложение</p>
        <div className="audience-geo-options">{geo.map(({ title, detail, Icon }, index) => <label key={title} className="audience-geo-option" data-selected={values[0] === index} data-disabled={online && index === 0}>
          <input type="radio" name={id + '-geo'} checked={values[0] === index} disabled={online && index === 0} onChange={() => select(0, index)}/>
          <Icon size={22} aria-hidden="true"/><span><b>{title}</b><small>{detail}</small></span><span className="audience-radio-mark" aria-hidden="true">{values[0] === index && <Check size={14}/>}</span>
        </label>)}</div>
        {values[0] === 1 && <Field label="город показа" value={city} onChange={event => onCityChange(event.target.value)} autoComplete="address-level2" maxLength={80} required error={textError(city, 'Город')} placeholder="Укажите город"/>}
      </fieldset>
      <fieldset className="audience-moment" disabled={disabled}>
        <legend>Когда предложение будет кстати?</legend>
        <p>Выберите событие или оставьте «В любой момент»</p>
        <div className="audience-options">{['В любой момент', 'После переезда', 'В день зарплаты'].map((label, index) => <label key={label} data-selected={values[4] === index}>
          <input type="radio" name={id + '-moment'} checked={values[4] === index} onChange={() => select(4, index)}/><span>{label}</span>
        </label>)}</div>
      </fieldset>
      <details className="audience-refinements">
        <summary><SlidersHorizontal size={18}/><span>Пол, возраст и доход<small>{summary.people}</small></span><ChevronDown size={18}/></summary>
        <div>{groups.slice(1, 4).map((group, index) => <fieldset className="audience-demographic" key={group.title} disabled={disabled}>
          <legend>{group.title}</legend><div className="audience-options">{group.choices.map((choice, choiceIndex) => <label key={choice} data-selected={values[index + 1] === choiceIndex}>
            <input type="radio" name={id + '-portrait-' + index} checked={values[index + 1] === choiceIndex} onChange={() => select(index + 1, choiceIndex)}/><span>{choiceIndex === 0 ? 'Любой' : choice}</span>
          </label>)}</div>
        </fieldset>)}</div>
      </details>
      <fieldset className="audience-wishes" disabled={disabled}>
        <label><span>Что ещё учесть? <small>необязательно</small></span><textarea className="bl-input" rows={2} maxLength={400} placeholder="Например, показать акцию тем, кто ищет, где позавтракать" value={triggers} onChange={event => onTriggers(event.target.value)}/></label>
        <button type="button" className="v3-text-button" onClick={onDictate} disabled={listening}><Mic size={16}/>{listening ? 'Слушаю…' : 'Сказать голосом'}</button>
        {voiceMessage && <p role="status">{voiceMessage}</p>}
      </fieldset>
    </div>
    <aside className="audience-summary" aria-label="Итог выбора клиентов">
      {preview}
      <div className="audience-summary-copy"><h4>Кому покажем оффер</h4><dl>
        <div><dt><MapPin size={16}/>Где</dt><dd>{summary.place}</dd></div>
        <div><dt><Users size={16}/>Кто</dt><dd>{summary.people}</dd></div>
        <div><dt><Check size={16}/>Когда</dt><dd>{summary.moment}</dd></div>
      </dl>{triggers.trim() && <p className="audience-summary-wishes">{triggers}</p>}<p className="audience-summary-note">Вы можете вернуться и изменить выбор</p></div>
    </aside>
  </div>
}

export function CampaignSuccess({ headingRef, preview, name, summary, offerTitle, saved }: {
  headingRef: Ref<HTMLHeadingElement>; preview: ReactNode; name: string; summary: AudienceSummary; offerTitle: string; saved: boolean;
}) {
  const reduce = useReducedMotion()
  return <section className="campaign-success v3-complete" aria-label="Настройка завершена">
    <div className="campaign-success-copy">
      <div className="campaign-success-check" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><motion.path d="M12 24.5 20 33 37 15" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: .55, ease: 'easeOut' }}/></svg></div>
      <h3 ref={headingRef} tabIndex={-1}>Отлично,<br/>всё готово!</h3>
      <p>Предложение готово, аудитория выбрана. Вы можете вернуться к настройкам</p>
      <ul className="campaign-success-list">
        <li><Check size={18}/><span>Ваш бизнес<b>{name}</b></span></li>
        <li><Check size={18}/><span>Ваш оффер<b>{offerTitle}</b></span></li>
        <li><Check size={18}/><span>Ваши клиенты<b>{summary.place} · {summary.people}</b></span></li>
      </ul>
      {saved && <p className="campaign-success-saved"><Check size={14}/>Настройки сохранены</p>}
    </div>
    <div className="campaign-success-art"><div className="campaign-success-offer">{preview}<div><span>Когда покажем</span><p>{summary.moment}</p></div></div></div>
  </section>
}
