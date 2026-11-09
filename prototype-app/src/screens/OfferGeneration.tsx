import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'

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
    }, reduce ? 150 : [1100, 1200, 1300, 650][phase])
    return () => window.clearTimeout(timer)
  }, [active, phase, reduce, visible, onComplete])
  return { phase, visible }
}

export function OfferReveal({ quick, paused }: { quick: boolean; paused: boolean }) {
  return <div className="offer-reveal" data-quick={quick} data-paused={paused} aria-hidden="true">
    {Array.from({ length: 48 }, (_, index) => <span key={index} style={{ animationDelay: `${((index * 17) % 47) * (quick ? 12 : 42)}ms` }}/>) }
  </div>
}
