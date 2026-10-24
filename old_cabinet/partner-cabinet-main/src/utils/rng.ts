/** Детерминированный PRNG (mulberry32) — для воспроизводимых демо-данных между сбросами. */
export function mulberry32(seed: number) {
  let a = seed
  return function random() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type RandomFn = () => number

export function pick<T>(rnd: RandomFn, items: readonly T[]): T {
  return items[Math.floor(rnd() * items.length)]
}

export function intBetween(rnd: RandomFn, min: number, max: number): number {
  return Math.floor(rnd() * (max - min + 1)) + min
}

export function daysAgoIso(rnd: RandomFn, maxDays: number, fromIso: string): string {
  const from = new Date(fromIso).getTime()
  const offsetMs = intBetween(rnd, 0, maxDays) * 24 * 60 * 60 * 1000
  const jitterMs = intBetween(rnd, 0, 23 * 60 * 60 * 1000)
  return new Date(from - offsetMs - jitterMs).toISOString()
}
