import { createHash, randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { campaignAllowedStage, emptyCampaignDraft, isCampaignDraft, type CampaignDraft } from '../shared/campaign-draft.ts'
import { db } from './db.ts'

type ImageData = { name: string; type: string; base64: string }
export type IntakeData = Omit<CampaignDraft, 'offerImage' | 'logoImage'> & { offerImage: ImageData | null; logoImage: ImageData | null }

const limit = bodyLimit({
  maxSize: 11 * 1024 * 1024,
  onError: c => c.json({ message: 'Слишком большой размер заявки' }, 413),
})

const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif' }
export function imageExtension(type: string) { return extensions[type as keyof typeof extensions] }

async function packImage(file: File | null): Promise<ImageData | null> {
  if (!file) return null
  const bytes = Buffer.from(await file.arrayBuffer())
  const prefix = bytes.subarray(0, 12)
  const ext = imageExtension(file.type)
  const valid = ext === 'png' ? prefix.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
    : ext === 'jpg' ? prefix.subarray(0, 3).toString('hex') === 'ffd8ff'
    : ext === 'webp' ? prefix.toString('ascii', 0, 4) === 'RIFF' && prefix.toString('ascii', 8) === 'WEBP'
    : ext === 'avif' && prefix.toString('ascii', 4, 8) === 'ftyp' && /avi[fs]/.test(bytes.toString('ascii', 8, 64))
  if (!valid) throw new Error('Invalid image')
  return { name: file.name.slice(0, 255), type: file.type, base64: bytes.toString('base64') }
}

const sample = emptyCampaignDraft()
function pick<T extends object>(value: T, shape: T) {
  return Object.fromEntries(Object.keys(shape).map(key => [key, value[key as keyof T]])) as T
}

async function parseDraft(form: FormData, submit: boolean): Promise<IntakeData> {
  const raw = form.get('draft')
  if (typeof raw !== 'string' || raw.length > 32_768) throw new Error('Invalid draft')
  const fields: unknown = JSON.parse(raw)
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('Invalid draft')
  const value = { ...fields, offerImage: form.get('offerImage'), logoImage: form.get('logoImage') }
  if (!isCampaignDraft(value) || !value.offerAccepted || (submit && campaignAllowedStage(value) < 4)) throw new Error('Invalid draft')
  return {
    ...pick(value, sample), business: pick(value.business, sample.business), offer: pick(value.offer, sample.offer),
    stage: submit ? 4 : Math.min(3, value.stage), reached: submit ? 4 : Math.min(3, value.reached),
    offerImage: await packImage(value.offerImage), logoImage: await packImage(value.logoImage),
  }
}

const saveDraft = db.prepare(`
  insert into v4_drafts (id, revision, data, updated_at) values (?, ?, ?, ?)
  on conflict (id) do update set revision = excluded.revision, data = excluded.data, updated_at = excluded.updated_at
  where excluded.revision > v4_drafts.revision
`)
const findSubmission = db.prepare('select id from v4_submissions where draft_id = ? and digest = ?')
const insertSubmission = db.prepare('insert into v4_submissions (id, draft_id, digest, data, submitted_at, mail_next_at) values (?, ?, ?, ?, ?, ?)')
const recentSubmissions = db.prepare('select count(*) as total from v4_submissions where submitted_at > ?')

export const campaignIntake = new Hono()
for (const method of ['PUT', 'POST'] as const) {
  campaignIntake.on(method, '/draft', limit, async c => {
    const key = c.req.header('X-Draft-Key') ?? ''
    const revision = Number(c.req.header('X-Draft-Revision'))
    const submit = method === 'POST'
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key)
      || !Number.isSafeInteger(revision) || revision < 1) {
      return c.json({ message: 'Не удалось определить черновик' }, 400)
    }
    if (!c.req.header('content-type')?.startsWith('multipart/form-data;')) return c.json({ message: 'Неверный формат заявки' }, 400)

    let data: string
    try { data = JSON.stringify(await parseDraft(await c.req.formData(), submit)) }
    catch { return c.json({ message: 'Проверьте данные и изображения заявки' }, 400) }

    const now = Date.now()
    if (!submit) {
      saveDraft.run(key, revision, data, now)
      return c.json({ status: 'saved' })
    }
    const digest = createHash('sha256').update(data).digest('hex')
    db.exec('begin immediate')
    try {
      const existing = findSubmission.get(key, digest) as { id: string } | undefined
      if (existing) {
        db.exec('commit')
        return c.json({ id: existing.id, status: 'accepted' })
      }
      const { total } = recentSubmissions.get(now - 60_000) as { total: number }
      if (total >= 30) {
        db.exec('rollback')
        return c.json({ message: 'Слишком много заявок. Попробуйте через минуту' }, 429)
      }
      const id = randomUUID()
      saveDraft.run(key, revision, data, now)
      insertSubmission.run(id, key, digest, data, now, now)
      db.exec('commit')
      return c.json({ id, status: 'accepted' }, 201)
    } catch (error) {
      db.exec('rollback')
      throw error
    }
  })
}
