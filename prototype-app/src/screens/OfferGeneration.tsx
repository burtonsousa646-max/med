import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useReducedMotion } from 'motion/react'
import './offer-generation.css'

// Demo timing only. The same canvas will use generation events when the API is connected.
export function useOfferGeneration(active: boolean, onComplete: () => void) {
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState(0)
  const [visible, setVisible] = useState(!document.hidden)
  useEffect(() => {
    const update = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  useEffect(() => {
    if (!active) { setPhase(0); return }
    if (!visible) return
    const timer = window.setTimeout(() => {
      if (reduce || phase === 3) onComplete()
      else setPhase(value => value + 1)
    }, reduce ? 150 : [8000, 9000, 9000, 4000][phase])
    return () => window.clearTimeout(timer)
  }, [active, phase, reduce, visible, onComplete])
  return { phase, visible }
}

export function OfferReveal({ quick, paused }: { quick: boolean; paused: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const clock = useRef(0)
  const previous = useRef<number | null>(null)
  const [progress, setProgress] = useState(0)
  const reduce = useReducedMotion()
  useEffect(() => {
    clock.current = 0
    previous.current = null
    setProgress(0)
  }, [quick])
  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context || paused || reduce) return
    const ink = getComputedStyle(element).color
    const duration = quick ? 1200 : 30000
    let width = 0, height = 0, frame = 0, lastDraw = 0
    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = element!.clientWidth
      height = element!.clientHeight
      element!.width = Math.round(width * ratio)
      element!.height = Math.round(height * ratio)
      context!.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    function draw(now: number) {
      if (previous.current !== null) clock.current += Math.max(0, now - previous.current)
      previous.current = now
      if (now - lastDraw >= 1000 / 30) {
        lastDraw = now
        const time = clock.current / 1000
        const fraction = Math.min(clock.current / duration, 1)
        setProgress(Math.min(99, Math.round(fraction * 100)))
        context!.clearRect(0, 0, width, height)
        context!.fillStyle = ink
        const spacing = 12
        const columns = Math.floor(width / spacing)
        const rows = Math.floor(height / spacing)
        const left = (width - (columns - 1) * spacing) / 2
        const top = (height - (rows - 1) * spacing) / 2
        const first = { x: .5 + Math.sin(time * 1.2) * .27, y: .5 + Math.cos(time * 1.05) * .24 }
        const second = { x: .5 + Math.cos(time * .92 + 2) * .3, y: .5 + Math.sin(time * 1.3 + 1) * .28 }
        for (let x = 0; x < columns; x++) {
          for (let y = 0; y < rows; y++) {
            const px = x / Math.max(columns - 1, 1), py = y / Math.max(rows - 1, 1)
            const distance = Math.min(Math.hypot(px - first.x, py - first.y), Math.hypot(px - second.x, py - second.y))
            const strength = Math.max(0, 1 - distance / (.22 + fraction * .2)) ** 2
            context!.globalAlpha = .14 + strength * .72
            context!.beginPath()
            context!.arc(left + x * spacing, top + y * spacing, .7 + strength * (1.8 + fraction), 0, Math.PI * 2)
            context!.fill()
          }
        }
      }
      frame = requestAnimationFrame(draw)
    }
    resize()
    previous.current = null
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    frame = requestAnimationFrame(draw)
    return () => { observer.disconnect(); cancelAnimationFrame(frame); previous.current = null }
  }, [quick, paused, reduce])
  return <div className="offer-reveal offer-generation" style={{ '--generation-duration': quick ? '1200ms' : '30000ms' } as CSSProperties} data-quick={quick} data-paused={paused} aria-hidden="true">
    <canvas ref={canvas}/>
    <span className="offer-generation-percent">{progress}%</span>
  </div>
}
