import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Phone, PhoneIncoming, RotateCcw, Volume2, VolumeX, X } from 'lucide-react'
import { rewards } from './rewards'
import handset from './art/handset.webp'
import './partner-call.css'

const count = rewards.length
const wrap = (value: number) => ((value % count) + count) % count
const travelTime = 3200
const blurExposureMs = 4

// Five physical props circulate on an endless line.
function placeItem(index: number, position: number) {
  const distance = wrap(index - position + count / 2) - count / 2
  const focus = Math.exp(-1.65 * distance * distance)
  const scale = 0.69 + 0.31 * focus
  return `translate3d(${distance * 100 - 50}%, ${(1 - focus) * 7}%, 0) scale(${scale})`
}

function Wire() {
  return <svg className="call-wire" viewBox="0 0 1200 110" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="call-rubber" x2="0" y2="1" gradientUnits="objectBoundingBox">
      <stop stopColor="#686058"/><stop offset=".44" stopColor="#231e19"/><stop offset="1" stopColor="#493f35"/>
    </linearGradient></defs>
    <path d="M-25 67 C54 94 100 28 147 43 S216 99 237 66 C253 38 224 27 214 52 C196 99 293 85 340 54 S423 29 467 66 C513 103 550 81 591 58 S659 46 695 69 C752 103 796 92 819 60 C848 19 818 12 809 41 C795 86 877 90 934 61 S1012 28 1064 61 S1150 95 1225 46"
      fill="none" stroke="url(#call-rubber)" strokeWidth="2.8" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
  </svg>
}

export function PartnerCall() {
  const [phase, setPhase] = useState<'incoming' | 'connecting' | 'answered'>('incoming')
  const [winner, setWinner] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [audible, setAudible] = useState(false)
  const items = useRef<(HTMLDivElement | null)[]>([])
  const blurId = useId()
  const motionBlur = useRef<SVGFEGaussianBlurElement>(null)
  const frame = useRef<number | null>(null)
  const position = useRef(0)
  const remaining = useRef<number[]>([])
  const calls = useRef(0)
  const context = useRef<AudioContext | null>(null)
  const soundEnabled = useRef(false)
  const action = useRef<HTMLButtonElement>(null)
  const expand = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const focusAfterResize = useRef(false)
  const reward = rewards[winner]
  const answered = phase === 'answered'

  function draw(next: number) {
    position.current = next
    items.current.forEach((item, index) => {
      if (item) item.style.transform = placeItem(index, next)
    })
  }

  function stop() {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
  }

  useEffect(() => () => {
    stop()
    if (context.current) void context.current.close().catch(() => {})
  }, [])

  useLayoutEffect(() => {
    if (!collapsed) draw(position.current)
    if (focusAfterResize.current) {
      (collapsed ? expand : action).current?.focus({ preventScroll: true })
      focusAfterResize.current = false
    }
  }, [collapsed])

  // Audio is opt-in. A short envelope avoids clicks even with headphones.
  function tone(hz: number, duration: number, delay = 0, gain = 0.045) {
    const audio = context.current
    if (!soundEnabled.current || !audio || audio.state !== 'running') return
    const oscillator = audio.createOscillator()
    const envelope = audio.createGain()
    const t = audio.currentTime + delay
    oscillator.frequency.value = hz
    envelope.gain.setValueAtTime(0.0001, t)
    envelope.gain.exponentialRampToValueAtTime(gain, t + 0.009)
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    oscillator.connect(envelope).connect(audio.destination)
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect() }
    oscillator.start(t)
    oscillator.stop(t + duration + 0.01)
  }

  async function toggleSound() {
    const enable = !soundEnabled.current
    soundEnabled.current = enable
    setAudible(enable)
    try {
      if (enable) {
        context.current ??= new AudioContext()
        await context.current.resume()
        tone(660, 0.11)
      } else if (context.current) await context.current.suspend()
    } catch {
      soundEnabled.current = false
      setAudible(false)
    }
  }

  function nextPartner() {
    // The first connection reproduces the concept. Subsequent calls tour every partner.
    if (!remaining.current.length) {
      remaining.current = rewards.map((_, i) => i)
      for (let i = count - 1; i > 0; i--) {
        const other = Math.floor(Math.random() * (i + 1))
        ;[remaining.current[i], remaining.current[other]] = [remaining.current[other], remaining.current[i]]
      }
      const last = count - 1
      const swap = calls.current === 0 ? remaining.current.indexOf(rewards.findIndex(r => r.id === 'cinema'))
        : remaining.current[last] === winner ? 0 : last
      ;[remaining.current[last], remaining.current[swap]] = [remaining.current[swap], remaining.current[last]]
    }
    calls.current++
    return remaining.current.pop()!
  }

  function answer(shortMotion: boolean) {
    if (frame.current !== null || phase === 'connecting') return
    const target = nextPartner()
    const start = position.current
    const steps = count + wrap(target - start)
    const finish = () => {
      frame.current = null
      motionBlur.current?.setStdDeviation(0, 0)
      draw(target)
      setWinner(target)
      setPhase('answered')
      tone(660, 0.15)
      tone(880, 0.28, 0.10)
    }
    if (shortMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish()
      return
    }
    setPhase('connecting')
    const began = performance.now()
    const itemWidth = items.current[0]?.offsetWidth ?? 0
    let lastTime = began
    let lastBlur = 0
    let lastTick = Math.round(start)
    function advance(now: number) {
      const t = Math.max(0, Math.min(1, (now - began) / travelTime))
      // A short acceleration meets a long, smooth coast at the same velocity.
      const ramp = 0.14
      const power = 3
      const peak = 1 / (ramp / 2 + (1 - ramp) / power)
      const progress = t < ramp ? peak * t * t / (2 * ramp)
        : 1 - peak * (1 - ramp) / power * ((1 - t) / (1 - ramp)) ** power
      const next = start + steps * progress
      // A short virtual shutter stretches the image only along its path of travel.
      const pixelsPerMs = Math.abs(next - position.current) * itemWidth / Math.max(1, now - lastTime)
      const spread = Math.min(10, pixelsPerMs * blurExposureMs)
      const blur = Math.round(spread * 4) / 4
      if (blur !== lastBlur) motionBlur.current?.setStdDeviation(blur, 0)
      lastBlur = blur
      lastTime = now
      draw(next)
      if (Math.round(next) !== lastTick) {
        lastTick = Math.round(next)
        tone(420, 0.05, 0, 0.025)
      }
      if (t < 1) frame.current = requestAnimationFrame(advance)
      else finish()
    }
    frame.current = requestAnimationFrame(advance)
  }

  function fold() {
    stop()
    draw(0)
    setPhase('incoming')
    focusAfterResize.current = true
    setCollapsed(true)
  }

  if (collapsed) return <button className="call-compact" type="button" ref={expand} onClick={() => {
    focusAfterResize.current = true
    setCollapsed(false)
  }}><img src={handset} alt="" width="54" height="44"/><span>Алло, это вам!</span><span className="call-compact__open">Открыть</span></button>

  return <section className="partner-call" data-phase={phase} aria-label="Алло, это вам!">
    <header className="call-top">
      <span className="call-status"><i aria-hidden="true"/>{answered ? 'На связи — ' + reward.partner : phase === 'connecting' ? 'Соединяем…' : 'Входящий звонок'}</span>
      <div className="call-tools">
        <button type="button" onClick={toggleSound} aria-label="Звук звонка" aria-pressed={audible} title={audible ? 'Выключить звук' : 'Включить звук'}>{audible ? <Volume2/> : <VolumeX/>}</button>
        <button type="button" onClick={fold} aria-label="Свернуть игру" title="Свернуть игру"><X/></button>
      </div>
    </header>
    <div className="call-body">
      <div className="call-intro" aria-hidden={answered}><h2>Алло, это вам!</h2></div>
      <div className="call-stage" aria-hidden="true">
        <div className="call-spotlight"/><Wire/>
        <svg width="0" height="0" aria-hidden="true" style={{position:'absolute'}}>
          <defs><filter id={blurId} x="-8%" width="116%" colorInterpolationFilters="sRGB">
            <feGaussianBlur ref={motionBlur} stdDeviation="0 0"/>
          </filter></defs>
        </svg>
        <div className="call-reel" style={{filter: phase === 'connecting' ? `url(#${blurId})` : undefined}}>
          {rewards.map((item,index) => <div key={item.id} ref={node => { items.current[index] = node }}
            className="call-item" data-chosen={answered && index === winner} style={{ transform: placeItem(index, 0), '--ticket-color': item.color, '--ticket-turn': item.angle+'deg' } as CSSProperties}>
            <div className="call-prop"><img draggable={false} src={item.image} alt=""/>
              <span className="call-ticket">{answered && index === winner ? item.ticket : item.label}</span>
            </div>
          </div>)}
        </div>
        <span className="call-index"/>
      </div>
      <div className="call-controls">
        {answered && <div className="call-result" key={reward.id}><h2>{reward.title}</h2><p>{reward.condition}</p></div>}
        <div className="call-actions">
          <button className="call-pickup" type="button" ref={action} aria-disabled={phase === 'connecting'}
            onClick={e => { if (answered) dialog.current?.showModal(); else answer(e.detail === 0) }}>
            {answered ? 'Открыть предложение' : <><Phone size={19} fill="currentColor"/>{phase === 'connecting' ? 'Соединяем…' : 'Снять трубку'}</>}
          </button>
          {answered && <button className="call-again" type="button" aria-label="Ещё звонок" title="Ещё звонок"
            onClick={e => { action.current?.focus({ preventScroll: true }); answer(e.detail === 0) }}><RotateCcw size={19}/></button>}
        </div>
      </div>
    </div>
    <span className="call-sr" role="status">{phase === 'connecting' ? 'Соединяем с партнёром' : answered ? reward.partner + '. ' + reward.title + '. ' + reward.condition : ''}</span>
    <dialog ref={dialog} className="call-details" aria-labelledby="call-detail-title" onClick={e => {
      if (e.target === e.currentTarget) dialog.current?.close()
    }}>
      <article>
        <div className="call-details__hero" style={{ '--ticket-color': reward.color } as CSSProperties}>
          <img src={reward.image} alt=""/><span className="call-details__ticket">{reward.ticket}</span>
        </div>
        <button className="call-details__close" type="button" aria-label="Закрыть предложение" autoFocus onClick={() => dialog.current?.close()}><X size={20}/></button>
        <div className="call-details__content">
          <span className="call-details__partner"><PhoneIncoming size={16}/>{reward.partner}</span>
          <h2 id="call-detail-title">{reward.title}</h2>
          <p>{reward.terms}</p>
          <small>Демонстрационное предложение</small>
          <button type="button" className="call-pickup" onClick={() => dialog.current?.close()}>Вернуться к звонку</button>
        </div>
      </article>
    </dialog>
  </section>
}
