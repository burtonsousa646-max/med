import { useId, useLayoutEffect, useRef, useState, type ComponentProps } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, CircleAlert } from 'lucide-react'

/** Native validity remains the source of truth; errors are inline, announced and linked. */
export function Field({ label, error = '', hint, onBlur, onInvalid, ...props }: ComponentProps<'input'> & { label: string; error?: string; hint?: string }) {
  const id = useId()
  const ref = useRef<HTMLInputElement>(null)
  const [touched, setTouched] = useState(false)
  const [nativeError, setNativeError] = useState('')
  const reduce = useReducedMotion()
  useLayoutEffect(() => {
    ref.current?.setCustomValidity(error)
    setNativeError(ref.current?.validity.valid ? '' : ref.current?.validationMessage || '')
  }, [error, props.value, props.min, props.max])
  const message = touched ? error || nativeError : ''
  const valid = !error && !nativeError && String(props.value ?? '').trim().length > 0
  return <label className="bl-field v3-validated-field" data-invalid={Boolean(message)} data-valid={valid}>
    <span className="bl-field__label">{label}{props.required && <span className="v3-required" aria-hidden="true"> *</span>}</span>
    <span className="v3-input-wrap"><input {...props} ref={ref} id={props.id || id} className="bl-input" aria-label={label} aria-invalid={Boolean(message)} aria-describedby={id + '-feedback'} onBlur={event => { setTouched(true); setNativeError(event.currentTarget.validationMessage); onBlur?.(event) }} onInvalid={event => { event.preventDefault(); setTouched(true); setNativeError(event.currentTarget.validationMessage); onInvalid?.(event) }} />
      <AnimatePresence>{(message || valid) && <motion.span className="v3-field-mark" key={message ? 'error' : 'valid'} initial={reduce ? false : {opacity:0,scale:.6}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.8}} transition={{duration:reduce ? 0:.18}} aria-hidden="true">{message ? <CircleAlert size={17}/> : <Check size={17}/>}</motion.span>}</AnimatePresence>
    </span>
    <span className="v3-field-feedback" id={id + '-feedback'} aria-live="polite"><AnimatePresence mode="wait" initial={false}><motion.span key={message || hint || 'empty'} initial={reduce ? false : {opacity:0,y:-3}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:reduce ? 0:.12}}>{message || hint || '\u00a0'}</motion.span></AnimatePresence></span>
  </label>
}
