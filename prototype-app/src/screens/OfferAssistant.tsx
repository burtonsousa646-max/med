import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Check, Mic, Sparkles, Square, Undo2 } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { reviseOffer, type OfferDraft } from './offer-assistant-demo'
import { analytics, type EventParams, type Goal } from '../analytics'

type Recognition = {
  lang: string; interimResults: boolean; processLocally?: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null; onend: (() => void) | null
  start(): void; abort(): void; stop(): void
}

export function OfferAssistant({ offer, active, onChange, onWorking, track = false }: {
  offer: OfferDraft; active: boolean; onChange: (offer: OfferDraft) => void; onWorking: (working: boolean) => void; track?: boolean
}) {
  const event = (goal: Goal, params: EventParams = {}) => { if (track) analytics.event(goal, params) }
  const reduce = useReducedMotion()
  const [prompt, setPrompt] = useState('')
  const [working, setWorking] = useState(false)
  const [listening, setListening] = useState(false)
  const [message, setMessage] = useState('')
  const [previous, setPrevious] = useState<OfferDraft | null>(null)
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([])
  const applied = useRef<OfferDraft | null>(null)
  const timer = useRef<number | null>(null)
  const speech = useRef<Recognition | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const promptMethod = useRef<'text' | 'voice'>('text')
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'instant' }) }, [messages])
  useEffect(() => {
    if (applied.current && offer !== applied.current) { applied.current = null; setPrevious(null) }
  }, [offer])
  useEffect(() => {
    if (!active) { if (timer.current) clearTimeout(timer.current); timer.current = null; speech.current?.abort(); setWorking(false); onWorking(false) }
    return () => { if (timer.current) clearTimeout(timer.current); speech.current?.abort() }
  }, [active, onWorking])

  function apply(value = prompt, method: 'text' | 'voice' | 'example' = promptMethod.current) {
    if (!active || timer.current || !value.trim()) return
    event('v4_assistant_request', { method })
    speech.current?.abort()
    setMessages(current => [...current.slice(-10), { role: 'user', text: value.trim() }])
    const result = reviseOffer(value, offer)
    if (!result) {
      event('v4_assistant_result', { method, result: 'error', reason: 'unsupported' })
      const reply = 'Напишите, какой цвет, размер изображения, скидку или промокод хотите. Для других правок нажмите «Редактировать»'
      setMessages(current => [...current, { role: 'assistant', text: reply }]); setMessage(''); setPrompt(''); return
    }
    input.current?.focus({ preventScroll: true })
    setPrompt(value); setMessage('Меняю предложение…'); setWorking(true); onWorking(true)
    timer.current = window.setTimeout(() => {
      setPrevious(offer); applied.current = result.offer; onChange(result.offer)
      event('v4_assistant_result', { method, result: 'success', tone: result.offer.tone, has_discount: Boolean(result.offer.discount), has_promo: Boolean(result.offer.promo) })
      timer.current = window.setTimeout(() => {
        timer.current = null; setWorking(false); onWorking(false)
        setMessages(current => [...current, { role: 'assistant', text: result.message }])
        setMessage(''); setPrompt(''); input.current?.focus({ preventScroll: true })
      }, reduce ? 50 : 900)
    }, reduce ? 50 : 450)
  }

  function dictate() {
    if (speech.current) { speech.current.stop(); return }
    event('v4_voice_start', { step: 'offer' })
    const browser = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
    const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition
    if (!Constructor) { event('v4_voice_result', { step: 'offer', result: 'error', reason: 'unsupported' }); setMessage('В этом браузере голосовой ввод недоступен. Напишите пожелание'); input.current?.focus(); return }
    const recognition = new Constructor()
    let heard = false, failed = false
    recognition.lang = 'ru-RU'; recognition.interimResults = true
    recognition.onresult = ({ results }) => { const text = Array.from(results).map(result => result[0]?.transcript || '').join(' ').slice(0, 400); heard = Boolean(text.trim()); promptMethod.current = 'voice'; setPrompt(text) }
    recognition.onerror = () => { failed = true; event('v4_voice_result', { step: 'offer', result: 'error', reason: 'recognition' }); setMessage('Не удалось записать голос. Проверьте доступ к микрофону или напишите пожелание') }
    recognition.onend = () => { if (!failed) event('v4_voice_result', { step: 'offer', result: heard ? 'success' : 'empty' }); speech.current = null; setListening(false) }
    try { speech.current = recognition; recognition.start(); setListening(true); setMessage('Слушаю вас. Проверьте текст перед отправкой') }
    catch { failed = true; event('v4_voice_result', { step: 'offer', result: 'error', reason: 'recognition' }); speech.current = null; setListening(false); setMessage('Голосовой ввод недоступен. Напишите пожелание') }
  }
  const examples = [
    { label: 'Другой цвет', request: offer.tone === 'blue' ? 'Сделай фон фиолетовым' : 'Сделай фон синим' },
    { label: 'Скидка 25%', request: 'Сделай скидку 25%' },
  ]
  return <section className="offer-assistant" aria-label="Изменить оффер с ИИ" data-working={working} data-listening={listening}>
    <div className="offer-assistant-heading"><span><Sparkles size={18}/></span><div><h4>Что изменить?</h4><p>Напишите или скажите голосом</p></div></div>
    {messages.length > 0 && <div ref={log} className="offer-chat-log" role="log" aria-label="Переписка с дизайнером" aria-live="polite">
      {messages.map((message, index) => <p key={index} className="offer-chat-message" data-role={message.role}><span className="offer-chat-author">{message.role === 'user' ? 'вы' : 'дизайнер'}</span>{message.text}</p>)}
    </div>}
    <div className="offer-assistant-input">
      <textarea ref={input} className="ym-disable-keys" aria-label="Что изменить в оффере" placeholder="Например: скидка 25%, фон синий, изображение крупнее" value={prompt} maxLength={400} rows={2} readOnly={working || !active} onChange={e => { promptMethod.current = 'text'; setPrompt(e.target.value) }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); apply() } }}/>
      <div className="offer-assistant-tools"><button type="button" className="offer-mic" title="Диктовка использует распознавание речи браузера" aria-label={listening ? 'Остановить диктовку' : 'Надиктовать правку'} aria-pressed={listening} disabled={working} onClick={dictate}>{listening ? <Square size={15}/> : <Mic size={17}/>}<span>{listening ? 'слушаю' : 'сказать голосом'}</span>{listening && <i className="offer-wave" aria-hidden="true">{[0,1,2,3,4].map(i => <i key={i} style={{animationDelay:`${i * 90}ms`}}/>)}</i>}</button><button type="button" className="offer-send" aria-label="Применить правку" disabled={working || listening || !prompt.trim()} onClick={() => apply()}><ArrowUp size={20}/></button></div>
    </div>
    <div className="offer-assistant-examples" aria-label="Примеры правок">{examples.map(example => <button key={example.label} type="button" disabled={working || listening} onClick={() => apply(example.request, 'example')}>{example.label}</button>)}</div>
    <div className="offer-assistant-feedback" role="status">{message && <span>{working ? <Sparkles size={15}/> : <Check size={15}/>} {message}</span>}{previous && !working && <button type="button" onClick={() => { event('v4_assistant_undo'); onChange(previous); setPrevious(null); setMessage('Вернули предыдущий вариант') }}><Undo2 size={14}/>отменить правку</button>}</div>
  </section>
}
