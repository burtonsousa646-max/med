// Заглушки всех портов. Отвечают детерминированно (одинаковый вход — одинаковый ответ), чтобы тесты были стабильны.
// Особые значения для проверки ошибок описаны в docs/integrations.md: ИНН на 0000 — ликвидирован, MED-ID на optout — без согласия.
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Ports } from './ports.ts'

const hash = (s: string) => createHash('sha256').update(s).digest()
const num = (s: string, mod: number) => hash(s).readUInt32BE(0) % mod
const id = (prefix: string, s: string) => `${prefix}_${hash(s).toString('hex').slice(0, 12)}`
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
const unb64 = <T>(s: string) => JSON.parse(Buffer.from(s, 'base64url').toString()) as T

/** Что заглушки «отправили наружу» — для тестов и экрана журнала в разработке. */
export const stubState = { messages: [] as { to: string; template: string; params: Record<string, string> }[] }

const STORAGE_DIR = process.env.STORAGE_DIR ?? new URL('../../var/storage/', import.meta.url).pathname

export const stubs: Ports = {
  idp: {
    // Страница заглушки (/api/stub/idp) показывает форму «войти как» и возвращает code с данными внутри
    authUrl: ({ provider, state, redirectUri }) => `/api/stub/idp?${new URLSearchParams({ provider, state, redirect_uri: redirectUri })}`,
    async exchange({ provider, code }) {
      const p = unb64<{ inn: string; name: string; email?: string; phone?: string }>(code)
      return {
        subject: id(provider, p.inn + p.name), name: p.name, email: p.email, phone: p.phone,
        company: { inn: p.inn, name: `ООО «Компания ${p.inn.slice(-4)}»`, role: 'генеральный директор' },
      }
    },
  },
  staffSso: {
    authUrl: ({ state, redirectUri }) => `/api/stub/sso?${new URLSearchParams({ state, redirect_uri: redirectUri })}`,
    async exchange({ code }) {
      const p = unb64<{ email: string; name: string; roles: string[] }>(code)
      return { subject: id('sso', p.email), ...p }
    },
  },
  companyRegistry: {
    async findByInn(inn) {
      if (!/^\d{10}(\d{2})?$/.test(inn)) return null
      const status = inn.endsWith('0000') ? 'liquidated' : 'active'
      return {
        inn, kpp: inn.length === 10 ? inn.slice(0, 4) + '01001' : undefined, ogrn: '1' + inn.padEnd(12, '7'),
        name: `ООО «Компания ${inn.slice(-4)}»`, address: 'г. Москва, ул. Тверская, д. 1', director: 'Иванов Иван Иванович',
        status, risk: status === 'active' ? 'low' : 'high',
      }
    },
  },
  b2bCrm: {
    findClient: async inn => num(inn, 3) === 0 ? { clientId: id('crm', inn), manager: { name: 'Мария Котова', email: 'manager@example.ru' } } : null,
    createLead: async p => ({ leadId: id('lead', p.inn + p.topic + Date.now()) }),
  },
  geo: {
    async geocode(addr) {
      if (!addr.trim()) return null
      // точка в пределах Москвы, стабильная для адреса
      return { lat: 55.70 + num(addr, 1000) / 5000, lon: 37.50 + num(addr + 'x', 1000) / 4000, normalized: `г. Москва, ${addr.trim()}` }
    },
    reach: async ({ radiusM }) => ({ people: Math.round(Math.PI * (radiusM / 1000) ** 2 * 9000) }), // ~9 тыс. абонентов на км²
  },
  payments: {
    create: async p => ({ externalId: id('pay', p.paymentId), confirmUrl: `/api/stub/pay/${p.paymentId}` }),
    refund: async p => ({ externalId: id('refund', p.paymentId + p.amountKop) }),
  },
  bankStatement: { incoming: async () => [] }, // поступления добавляет бэкофис или тест через вебхук bankStatement/incoming
  subscriberBilling: {
    charge: async p => ({ externalId: id('bill', p.idempotencyKey), status: p.medId.startsWith('broke') ? 'declined' : 'ok' }),
    grantBonus: async p => ({ externalId: id('bonus', p.idempotencyKey) }),
  },
  accounting: {
    syncCounterparty: async p => ({ externalId: id('cp', p.inn) }),
    postRevenue: async p => ({ externalId: id('rev', p.companyId + p.period) }),
    requestPayout: async p => ({ externalId: id('po', p.payoutId) }),
  },
  edo: {
    invite: async p => ({ externalId: id('edo', p.inn), status: 'sent' }),
    send: async p => ({ externalId: id('doc', p.documentId) }),
  },
  signature: {
    request: async p => ({ requestId: id('sign', p.idempotencyKey) }),
    verify: async ({ code }) => code === '0000', // ponytail: фиксированный код заглушки; настоящая подпись — у провайдера ПЭП
  },
  ord: {
    registerOrganization: async p => ({ externalId: id('org', p.inn) }),
    registerContract: async p => ({ externalId: id('ctr', p.orgRef + p.number) }),
    // erid — 10–12 символов base58, как у реальных ОРД
    registerCreative: async p => ({ erid: base58(hash('erid' + p.creativeId)).slice(0, 11) }),
    reportStats: async p => ({ externalId: id('rep', p.period + p.rows.length) }),
  },
  dmp: {
    match: async ({ medId, triggerIds }) =>
      Object.fromEntries(triggerIds.filter(t => num(medId + t, 4) === 0).map(t => [t, 0.6 + num(t + medId, 40) / 100])),
    estimate: async ({ triggerIds }) => ({ people: triggerIds.reduce((n, t) => n + 500 + num(t, 3000), 0) }),
  },
  cleanRoom: { signals: async () => [] },
  consents: { check: async ({ medId }) => !medId.startsWith('optout') },
  cvm: { deliver: async p => ({ externalId: id('cvm', p.idempotencyKey) }) },
  adtech: { fraudScore: async ({ userAgent }) => (userAgent && /bot|curl|python/i.test(userAgent) ? { score: 0.95, reason: 'bot user agent' } : { score: 0.02 }) },
  partnerCrm: {
    connectUrl: ({ system, state, redirectUri }) => `/api/stub/crm?${new URLSearchParams({ system, state, redirect_uri: redirectUri })}`,
    pushLead: async p => ({ externalId: id(p.system, p.lead.phone + p.lead.campaign) }),
  },
  messaging: {
    async send(p) {
      stubState.messages.push({ to: p.to, template: p.template, params: p.params })
      if (process.env.NODE_ENV !== 'production' && !process.env.NODE_TEST_CONTEXT) console.log(`[messaging] ${p.channel} → ${p.to}: ${p.template}`, p.params)
      return { externalId: id('msg', p.idempotencyKey) }
    },
  },
  llm: { moderate: async () => ({ verdict: 'ok', confidence: 0.5, reasons: [] }) }, // правила модерации работают и без модели
  storage: {
    async put({ key, body, contentType }) {
      const path = join(STORAGE_DIR, key)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, body)
      await writeFile(path + '.type', contentType)
      return { key }
    },
    async get(key) {
      const path = join(STORAGE_DIR, key)
      try {
        return { body: await readFile(path), contentType: await readFile(path + '.type', 'utf8') }
      } catch {
        return null
      }
    },
    url: key => `/api/files/${key}`,
  },
  bi: { export: async p => ({ externalId: id('bi', p.dataset + p.period) }) },
  support: { createTicket: async () => ({ externalId: `SD-${randomUUID().slice(0, 8)}` }) },
  observability: { metric: () => {} },
}

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function base58(buf: Buffer) {
  let n = BigInt('0x' + buf.toString('hex')), s = ''
  while (n > 0n) { s = ALPHABET[Number(n % 58n)] + s; n /= 58n }
  return s
}

/** Код для страницы-заглушки входа: данные «входящего» прямо в коде. */
export const stubCode = (v: Record<string, unknown>) => b64(v)
