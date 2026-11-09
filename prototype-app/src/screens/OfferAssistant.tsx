import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Check, Mic, Sparkles, Square, Undo2 } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { reviseOffer, type OfferDraft } from './offer-assistant-demo'

type Recognition = {
  lang: string; interimResults: boolean; processLocally?: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null; onend: (() => void) | null
  start(): void; abort(): void; stop(): void
}
const examples = ['Сделай фон фиолетовым', 'Второй кофе в подарок', 'Увеличь чашку']

export function OfferAssistant({ offer, active, onChange, onWorking }: {
  offer: OfferDraft; active: boolean; onChange: (offer: OfferDraft) => void; onWorking: (working: boolean) => void
}) {
  const reduce = useReducedMotion()
  const [prompt, setPrompt] = useState('')
  const [working, setWorking] = useState(false)
  const [listening, setListening] = useState(false)
  const [message, setMessage] = useState('')
  const [previous, setPrevious] = useState<OfferDraft | null>(null)
  const applied = useRef<OfferDraft | null>(null)
  const timer = useRef<number | null>(null)
  const speech = useRef<Recognition | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (applied.current && offer !== applied.current) { applied.current = null; setPrevious(null) }
  }, [offer])
  useEffect(() => {
    if (!active) { if (timer.current) clearTimeout(timer.current); timer.current = null; speech.current?.abort(); setWorking(false); onWorking(false) }
    return () => { if (timer.current) clearTimeout(timer.current); speech.current?.abort() }
  }, [active, onWorking])

  function apply(value = prompt) {
    if (timer.current || !value.trim()) return
    speech.current?.abort()
    const result = reviseOffer(value, offer)
    if (!result) { setMessage('Попробуйте изменить цвет фона, размер чашки, скидку или промокод. Остальное можно поправить вручную.'); return }
    input.current?.focus({ preventScroll: true })
    setPrompt(value); setMessage('Примеряем вашу идею…'); setWorking(true); onWorking(true)
    timer.current = window.setTimeout(() => {
      setPrevious(offer); applied.current = result.offer; onChange(result.offer)
      timer.current = window.setTimeout(() => {
        timer.current = null; setWorking(false); onWorking(false)
        setMessage(result.message); setPrompt(''); input.current?.focus({ preventScroll: true })
      }, reduce ? 50 : 900)
    }, reduce ? 50 : 450)
  }

  function dictate() {
    if (speech.current) { speech.current.stop(); return }
    const browser = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
    const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition
    if (!Constructor) { setMessage('В этом браузере нет диктовки. Напишите пожелание или выберите пример ниже.'); input.current?.focus(); return }
    const recognition = new Constructor()
    recognition.lang = 'ru-RU'; recognition.interimResults = true
    recognition.onresult = ({ results }) => setPrompt(Array.from(results).map(result => result[0]?.transcript || '').join(' ').slice(0, 400))
    recognition.onerror = () => setMessage('Не удалось услышать вас. Проверьте доступ к микрофону или напишите пожелание.')
    recognition.onend = () => { speech.current = null; setListening(false) }
    try { speech.current = recognition; recognition.start(); setListening(true); setMessage('Слушаю. Затем проверьте текст и нажмите стрелку.') }
    catch { speech.current = null; setListening(false); setMessage('Диктовка недоступна. Можно написать пожелание.') }
  }
  return <section className="offer-assistant" aria-label="Изменить оффер с ИИ" data-working={working} data-listening={listening}>
    <div className="offer-assistant-heading"><span><Sparkles size={18}/></span><div><h4>скажите, что изменить</h4><p>Ваша идея — новый вариант на экране.</p></div></div>
    <div className="offer-assistant-input">
      <textarea ref={input} aria-label="Что изменить в оффере" placeholder="Например, сделай скидку 25% и фон фиолетовым" value={prompt} maxLength={400} rows={3} readOnly={working} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); apply() } }}/>
      <div className="offer-assistant-tools"><button type="button" className="offer-mic" title="Диктовка использует распознавание речи браузера" aria-label={listening ? 'Остановить диктовку' : 'Надиктовать правку'} aria-pressed={listening} disabled={working} onClick={dictate}>{listening ? <Square size={15}/> : <Mic size={17}/>}<span>{listening ? 'слушаю' : 'сказать голосом'}</span>{listening && <i className="offer-wave" aria-hidden="true">{[0,1,2,3,4].map(i => <i key={i} style={{animationDelay:`${i * 90}ms`}}/>)}</i>}</button><button type="button" className="offer-send" aria-label="Применить правку" disabled={working || listening || !prompt.trim()} onClick={() => apply()}><ArrowUp size={20}/></button></div>
    </div>
    <div className="offer-assistant-examples" aria-label="Примеры правок">{examples.map(example => <button key={example} type="button" disabled={working || listening} onClick={() => apply(example)}>{example}<span aria-hidden="true">↗</span></button>)}</div>
    <div className="offer-assistant-feedback" role="status">{message && <><span>{working ? <Sparkles size={15}/> : previous ? <Check size={15}/> : null}{message}</span>{previous && !working && <button type="button" onClick={() => { onChange(previous); setPrevious(null); setMessage('Вернули предыдущий вариант') }}><Undo2 size={14}/>отменить</button>}</>}</div>
  </section>
}
