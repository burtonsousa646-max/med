// Реестр портов. Какой адаптер стоит за портом, решает переменная INT_<ПОРТ> (stub — по умолчанию).
// Каждый асинхронный вызов замеряется и пишется в integration_log без секретов и ПДн.
import { sql } from '../db.ts'
import type { PortName, Ports } from './ports.ts'
import { stubs } from './stubs.ts'

// Адаптеры билайна добавляются сюда по мере подключения: beeline: { ord: beelineOrd, ... }
const adapters: Record<string, Partial<Ports>> = { stub: stubs }

// Порты на горячем пути показа: в журнал только ошибки, иначе журнал вырастет быстрее событий
const HOT = new Set<PortName>(['dmp', 'consents', 'cleanRoom', 'adtech', 'observability'])

const envName = (port: string) => 'INT_' + port.replace(/[A-Z]/g, c => '_' + c).toUpperCase() // staffSso → INT_STAFF_SSO

function pick<K extends PortName>(port: K): Ports[K] {
  const kind = process.env[envName(port)] ?? 'stub'
  const impl = adapters[kind]?.[port]
  if (!impl) throw new Error(`порт ${port}: адаптер «${kind}» не подключён (${envName(port)})`)
  return impl as Ports[K]
}

const SECRET = /secret|token|password|apikey|^code$|^phone$|^email$|^to$|^body$/i
export function redact(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redact)
  if (v instanceof Uint8Array) return `<${v.byteLength} байт>`
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET.test(k) ? '***' : redact(x)]))
  return v
}

export function logCall(system: string, direction: 'in' | 'out', action: string, ok: boolean, ms: number | null, request: unknown, response: unknown) {
  // не ждём записи журнала: вызов не должен падать из-за журнала
  sql`insert into integration_log (system, direction, action, ok, ms, request, response)
      values (${system}, ${direction}, ${action}, ${ok}, ${ms}, ${sql.json(redact(request ?? null) as never)}, ${sql.json(redact(response ?? null) as never)})`
    .catch(e => console.error('integration_log', e))
}

function wrap<K extends PortName>(port: K, impl: Ports[K]): Ports[K] {
  const out: Record<string, unknown> = {}
  for (const [name, fn] of Object.entries(impl as object)) {
    out[name] = (...args: unknown[]) => {
      const t = performance.now()
      const res = (fn as (...a: unknown[]) => unknown).apply(impl, args)
      if (!(res instanceof Promise)) return res // authUrl, url, metric — без журнала
      const ms = () => Math.round(performance.now() - t)
      return res.then(
        r => { if (!HOT.has(port)) logCall(port, 'out', name, true, ms(), args[0], r); return r },
        e => { logCall(port, 'out', name, false, ms(), args[0], { error: String(e?.message ?? e) }); throw e },
      )
    }
  }
  return out as unknown as Ports[K]
}

const cache = new Map<PortName, unknown>()
/** Порт по имени: port('ord').registerCreative(...). Адаптер выбирается при первом обращении. */
export function port<K extends PortName>(name: K): Ports[K] {
  if (!cache.has(name)) cache.set(name, wrap(name, pick(name)))
  return cache.get(name) as Ports[K]
}

/** Какие адаптеры сейчас стоят за портами — для бэкофиса и /health. */
export const portStatus = () =>
  (Object.keys(stubs) as PortName[]).map(p => ({ port: p, adapter: process.env[envName(p)] ?? 'stub' }))

/** Проверить при старте, что для всех заданных INT_* есть адаптеры. */
export const checkPorts = () => (Object.keys(stubs) as PortName[]).forEach(pick)
