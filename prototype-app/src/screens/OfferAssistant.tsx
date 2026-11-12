import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Check, Mic, Sparkles, Square, Undo2 } from 'lucide-react'
import { reviseOffer, type OfferDraft } from './offer-assistant-demo'
import { analytics, type EventParams, type Goal } from '../analytics'
import { requestOfferAi } from '../api'
import { offerAiNotes, type OfferAiInput } from '../../shared/offer-ai'

type Recognition = {
  lang: string; interimResults: boolean; processLocally?: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null; onend: (() => void) | null
  start(): void; abort(): void; stop(): void
}

export function OfferAssistant({ context, initialClarification, active, onChange, onWorking, onRemoveBackground, onRemoveImage, track = false }: {
  context: Pick<OfferAiInput, 'name' | 'category' | 'offer' | 'hasImage' | 'hasLogo'>; initialClarification: OfferAiInput['clarification']; active: boolean; onChange: (offer: OfferDraft) => void; onWorking: (working: boolean) => void; onRemoveBackground: () => string; onRemoveImage: () => string; track?: boolean
}) {
  const event = (goal: Goal, params: EventParams = {}) => { if (track) analytics.event(goal, params) }
  const { offer } = context
  const [prompt, setPrompt] = useState('')
  const [working, setWorking] = useState(false)
  const [listening, setListening] = useState(false)
  const [message, setMessage] = useState('')
  const [previous, setPrevious] = useState<OfferDraft | null>(null)
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([])
  const applied = useRef<OfferDraft | null>(null)
  const pending = useRef<AbortController | null>(null)
  const clarification = useRef<OfferAiInput['clarification']>(undefined)
  const speech = useRef<Recognition | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const promptMethod = useRef<'text' | 'voice'>('text')
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'instant' }) }, [messages])
  useEffect(() => {
    if (applied.current && offer !== applied.current) { applied.current = null; setPrevious(null) }
  }, [offer])
  useEffect(() => { clarification.current = undefined }, [initialClarification])
  useEffect(() => {
    if (!active) { setWorking(false); onWorking(false); setMessage('') }
    return () => { pending.current?.abort(); pending.current = null; speech.current?.abort() }
  }, [active, onWorking])

  async function apply(value = prompt, method: 'text' | 'voice' | 'example' = promptMethod.current) {
    const request = value.trim()
    if (!active || pending.current || !request) return
    const controller = new AbortController()
    pending.current = controller
    event('v4_assistant_request', { method })
    speech.current?.abort()
    setMessages(current => [...current.slice(-10), { role: 'user', text: request }])
    setPrompt(value); setMessage('Проверяю правку…'); setWorking(true); onWorking(true)
    try {
      const result = await requestOfferAi({
        ...context, mode: 'manual', request,
        clarification: clarification.current ?? initialClarification,
      }, controller.signal)
      if (controller.signal.aborted) return
      let next: OfferDraft | undefined
      let removeBackground = false
      let removeImage = false
      let reply: string
      if (result.source === 'disabled') {
        removeBackground = /(?:убери|удали|вырежи)\s+(?:(?:белый|серый|цветной)\s+)?фон/i.test(request)
        removeImage = /^(?:убери|удали)\s+(?:фото|картинку|изображение)[.!]?$/i.test(request)
        const revised = removeBackground || removeImage ? null : reviseOffer(request, offer)
        next = revised?.offer
        reply = revised?.message ?? 'Опишите цвет, размер изображения, скидку или промокод. Другие поля можно изменить вручную'
        if (!revised && /(?:^|\s)до\s*\d{1,2}\s*%/i.test(request)) reply = 'Для скидки «до» важно сохранить ограничение. Добавьте его в текст предложения и выберите в условиях «Предложение из текста карточки»'
      } else {
        const { answer } = result
        removeBackground = answer.status === 'draft' && answer.visual.action === 'remove_background'
        removeImage = answer.status === 'draft' && answer.visual.action === 'text_only'
        if (answer.status === 'draft' && Object.keys(answer.patch).length) next = { ...offer, ...answer.patch }
        const notes = offerAiNotes(answer)
        clarification.current = answer.question ? { request, question: answer.question, options: answer.options.map(option => option.headline) } : undefined
        reply = [...(next ? ['Правка в предпросмотре.'] : []), ...notes].join('\n') || 'Черновик оставлен без изменений'
      }
      if (next) {
        setPrevious(offer); applied.current = next; onChange(next)
        event('v4_assistant_result', { method, result: 'success', tone: next.tone, has_discount: Boolean(next.discount), has_promo: Boolean(next.promo) })
      } else {
        event('v4_assistant_result', { method, result: 'empty' })
      }
      if (removeBackground) reply = onRemoveBackground()
      if (removeImage) reply = onRemoveImage()
      setMessages(current => [...current, { role: 'assistant', text: reply }])
      setPrompt('')
    } catch {
      if (controller.signal.aborted) return
      event('v4_assistant_result', { method, result: 'error' })
      setMessages(current => [...current, { role: 'assistant', text: 'Помощник не ответил. Повторите запрос или отредактируйте оффер вручную' }])
    } finally {
      if (pending.current === controller) {
        pending.current = null; setWorking(false); onWorking(false); setMessage('')
        requestAnimationFrame(() => input.current?.focus({ preventScroll: true }))
      }
    }
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
      <div className="offer-assistant-tools"><button type="button" className="campaign-voice-button" title="Диктовка использует распознавание речи браузера" aria-label={listening ? 'Остановить диктовку' : 'Надиктовать правку'} aria-pressed={listening} disabled={working} onClick={dictate}>{listening ? <Square size={15}/> : <Mic size={17}/>}<span>{listening ? 'слушаю' : 'сказать голосом'}</span>{listening && <i className="offer-wave" aria-hidden="true">{[0,1,2,3,4].map(i => <i key={i} style={{animationDelay:`${i * 90}ms`}}/>)}</i>}</button><button type="button" className="offer-send" aria-label="Применить правку" disabled={working || listening || !prompt.trim()} onClick={() => apply()}><ArrowUp size={20}/></button></div>
    </div>
    <div className="offer-assistant-examples" aria-label="Примеры правок">{examples.map(example => <button key={example.label} type="button" disabled={working || listening} onClick={() => apply(example.request, 'example')}>{example.label}</button>)}</div>
    <div className="offer-assistant-feedback" role="status">{message && <span>{working ? <Sparkles size={15}/> : <Check size={15}/>} {message}</span>}{previous && !working && <button type="button" onClick={() => { event('v4_assistant_undo'); onChange(previous); setPrevious(null); setMessage('Вернули предыдущий вариант') }}><Undo2 size={14}/>отменить правку</button>}</div>
  </section>
}
