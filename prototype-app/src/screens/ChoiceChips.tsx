import { useId, type ReactNode } from 'react'
import './choice-chips.css'

export function ChoiceChips<T extends string>({ label, options, value, onChange, labelFor }: {
  label: string; options: readonly T[]; value: T; onChange: (value: T) => void; labelFor?: (value: T) => ReactNode
}) {
  const name = useId()
  return <fieldset className="choice-chips">
    <legend className="bl-field__label">{label}</legend>
    <div className="bl-row">{options.map(option => <label key={option} className={'bl-chip' + (option === value ? ' is-active' : '')}>
      <input type="radio" name={name} value={option} checked={option === value} onChange={() => onChange(option)}/>
      {labelFor ? labelFor(option) : option}
    </label>)}</div>
  </fieldset>
}
