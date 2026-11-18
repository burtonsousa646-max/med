// Нагрузочная проверка показа и клика без зависимостей: N запросов с заданной параллельностью, p50 / p95 / p99.
// node scripts/load.ts [адрес API] [запросов] [параллельно]
// Клики идут не через каждый показ, а через каждый десятый — примерно как в жизни при CTR в единицы процентов.
const base = process.argv[2] ?? 'http://127.0.0.1:8788'
const total = Number(process.argv[3] ?? 2000)
const conc = Number(process.argv[4] ?? 50)
const placement = process.env.PLACEMENT ?? 'showcase'

const serveMs: number[] = [], clickMs: number[] = []
let errors = 0, empty = 0, next = 0

async function one(i: number) {
  const t = performance.now()
  const r = await fetch(`${base}/api/public/serve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ placement, medId: `load-${i % 5000}` }) })
  if (!r.ok) { errors++; return }
  const { ads } = await r.json() as { ads: { clickUrl: string; impressionUrl: string }[] }
  serveMs.push(performance.now() - t)
  if (!ads.length) { empty++; return }
  await fetch(ads[0].impressionUrl, { method: 'POST' })
  if (i % 10 === 0) {
    const c = performance.now()
    const cr = await fetch(ads[0].clickUrl + '?format=json')
    if (cr.ok) clickMs.push(performance.now() - c); else errors++
  }
}

async function worker() {
  while (next < total) await one(next++).catch(() => errors++)
}

const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(1) : '—' }
const started = performance.now()
await Promise.all(Array.from({ length: conc }, worker))
const sec = (performance.now() - started) / 1000
console.log(`запросов показа: ${serveMs.length} за ${sec.toFixed(1)} с — ${(serveMs.length / sec).toFixed(0)} в секунду, параллельно ${conc}`)
console.log(`показ, мс: p50 ${pct(serveMs, 50)} · p95 ${pct(serveMs, 95)} · p99 ${pct(serveMs, 99)}`)
console.log(`клик, мс:  p50 ${pct(clickMs, 50)} · p95 ${pct(clickMs, 95)} · p99 ${pct(clickMs, 99)} (кликов ${clickMs.length})`)
console.log(`пустых ответов: ${empty}, ошибок: ${errors}`)
