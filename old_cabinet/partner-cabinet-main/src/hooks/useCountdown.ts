import { useEffect, useState } from 'react'

/** Секунды, оставшиеся от `fromIso` до `totalMs` — тикает раз в секунду, пока активен. */
export function useCountdown(fromIso: string | undefined, totalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!fromIso) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [fromIso])
  if (!fromIso) return 0
  const elapsed = now - new Date(fromIso).getTime()
  return Math.max(0, Math.ceil((totalMs - elapsed) / 1000))
}
