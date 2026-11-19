import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { normalizeCampaignEmail } from '../shared/campaign-draft.ts'
import { db } from './db.ts'

export const draftKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const minute = 60_000
const maxAttempts = 5
const pepper = randomBytes(32)
const hash = (key: string, email: string, code: string) => createHmac('sha256', pepper).update(JSON.stringify([key, email, code])).digest()
const eligibleDraft = db.prepare("select 1 from v4_drafts where id = ? and json_extract(data, '$.stage') >= 4")
const purge = db.prepare('delete from v4_email_codes where sent_at <= ?')
const reserve = db.prepare(`
  insert into v4_email_codes (draft_id, email, code_hash, sent_at)
  select ?, ?, ?, ?
  where not exists (select 1 from v4_email_codes where (draft_id = ? or email = ? collate nocase) and sent_at > ? and draft_id not glob 'mvp-test:*')
    and (select count(*) from v4_email_codes where (draft_id = ? or email = ? collate nocase) and draft_id not glob 'mvp-test:*') < 5
    and (select count(*) from v4_email_codes where sent_at > ? and draft_id not glob 'mvp-test:*') < 30
`)
// Fixture inboxes deliver independently to each browser's challenge; bound their traffic separately.
const reserveFixture = db.prepare(`
  insert into v4_email_codes (draft_id, email, code_hash, sent_at)
  select ?, ?, ?, ? where (select count(*) from v4_email_codes where draft_id glob 'mvp-test:*' and sent_at > ?) < 30
`)
const latest = db.prepare('select id, email, code_hash, sent_at, attempts, accepted_digest from v4_email_codes where draft_id = ? order by id desc limit 1')
const setAttempts = db.prepare('update v4_email_codes set attempts = ?, accepted_digest = ? where id = ?')

export function consumeCampaignCode(key: string, email: string, code: string, digest: string, now: number) {
  const row = latest.get(key) as { id: number; email: string; code_hash: string; sent_at: number; attempts: number; accepted_digest: string | null } | undefined
  if (!row || row.email !== email || now >= row.sent_at + 10 * minute) return 'Запросите новый код для этого адреса'
  if (row.attempts >= maxAttempts || (row.accepted_digest && row.accepted_digest !== digest)) return 'Запросите новый код подтверждения'
  const valid = timingSafeEqual(Buffer.from(row.code_hash, 'hex'), hash(key, email, code))
  setAttempts.run(valid ? row.attempts : row.attempts + 1, valid ? digest : row.accepted_digest, row.id)
  return valid ? '' : 'Код не подошёл. Проверьте письмо или запросите новый код'
}

export function createCampaignEmail(send: (email: string, code: string) => Promise<void>) {
  const limit = bodyLimit({ maxSize: 1024, onError: c => c.json({ message: 'Слишком большой запрос' }, 413) })
  return new Hono().post('/draft/email', limit, async c => {
    c.header('Cache-Control', 'no-store')
    const key = c.req.header('X-Draft-Key') ?? ''
    if (!draftKeyPattern.test(key) || !eligibleDraft.get(key)) return c.json({ message: 'Сначала заполните настройки кампании' }, 400)
    const value = await c.req.json().catch(() => null)
    const email = typeof value?.email === 'string' ? normalizeCampaignEmail(value.email) : ''
    if (!email) return c.json({ message: 'Укажите корректный email' }, 400)
    const error = await issueEmailCode(key, email, send)
    return error ? c.json({ message: error.message }, error.status) : c.json({ status: 'sent' as const })
  })
}

export async function issueEmailCode(key: string, email: string, send: (email: string, code: string) => Promise<void>) {
  const now = Date.now()
  const code = String(randomInt(1_000_000)).padStart(6, '0')
  purge.run(now - 60 * minute)
  const digest = hash(key, email, code).toString('hex')
  const reserved = key.startsWith('mvp-test:')
    ? reserveFixture.run(key,email,digest,now,now-minute)
    : reserve.run(key,email,digest,now,key,email,now-minute,key,email,now-minute)
  if (!reserved.changes) return { message: 'Код запрашивали недавно или исчерпан лимит. Попробуйте позже', status: 429 as const }

  try {
    await send(email, code)
  } catch {
    setAttempts.run(maxAttempts, null, reserved.lastInsertRowid)
    return { message: 'Не удалось отправить письмо. Попробуйте ещё раз через минуту', status: 503 as const }
  }
  return null
}
