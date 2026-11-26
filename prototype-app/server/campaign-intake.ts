import { createHash, randomUUID } from 'node:crypto'
import { matchesRasterType } from '../shared/offer-assets.ts'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { hasApplicationContact, campaignAllowedStage, emptyCampaignDraft, isCampaignDraft, normalizeCampaignEmail, type CampaignDraft } from '../shared/campaign-draft.ts'
import { db } from './db.ts'
import { consumeCampaignCode, draftKeyPattern } from './campaign-email.ts'
import { parsePartnerDetails, type RegistryDetails } from '../shared/partner-details.ts'
import { readPartnerRegistry } from './partner-registry.ts'

type ImageData = { name: string; type: string; base64: string }
export type IntakeData = Omit<CampaignDraft, 'offerImage' | 'logoImage'> & { offerImage: ImageData | null; logoImage: ImageData | null; registryDetails?: RegistryDetails | null; mvp?: import('../shared/mvp-promo.ts').Promo; mvpProfile?: import('../shared/mvp-promo.ts').Profile }

const limit = bodyLimit({
  maxSize: 11 * 1024 * 1024,
  onError: c => c.json({ message: 'Слишком большой размер заявки' }, 413),
})

const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif' }
export function imageExtension(type: string) { return extensions[type as keyof typeof extensions] }

export async function packImage(file: File | null): Promise<ImageData | null> {
  if (!file) return null
  const bytes = Buffer.from(await file.arrayBuffer())
  if (!matchesRasterType(file.type,bytes)) throw new Error('Invalid image')
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
  if (!isCampaignDraft(value) || !value.offerAccepted || (submit && (campaignAllowedStage(value) < 4 || !hasApplicationContact(value)))) throw new Error('Invalid draft')
  const stage = submit ? 5 : Math.min(value.stage, campaignAllowedStage(value), hasApplicationContact(value) ? 4 : 3)
  return {
    ...pick(value, sample), email: submit && value.email ? normalizeCampaignEmail(value.email) : undefined, business: pick(value.business, sample.business),
    contactName: value.contactName?.trim(), setupMode: value.setupMode, audienceCity: value.audienceCity,
    partnerDetails: submit ? parsePartnerDetails(value.partnerDetails, value.business.inn) : undefined,
    offer: { ...pick(value.offer, sample.offer), ...(value.offer.background && { background: value.offer.background }), ...(value.offer.layout && { layout: value.offer.layout }) },
    stage, reached: submit ? 5 : Math.min(4, value.reached),
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
    if (!draftKeyPattern.test(key)
      || !Number.isSafeInteger(revision) || revision < 1) {
      return c.json({ message: 'Не удалось определить черновик' }, 400)
    }
    if (!c.req.header('content-type')?.startsWith('multipart/form-data;')) return c.json({ message: 'Неверный формат заявки' }, 400)

    let draft: IntakeData
    let code: FormDataEntryValue | null
    try {
      const form = await c.req.formData()
      draft = await parseDraft(form, submit)
      code = form.get('emailCode')
    }
    catch { return c.json({ message: 'Проверьте данные и изображения заявки' }, 400) }

    const data = JSON.stringify(draft)
    const now = Date.now()
    if (!submit) {
      saveDraft.run(key, revision, data, now)
      return c.json({ status: 'saved' })
    }
    if (!draft.email || typeof code !== 'string' || !/^\d{6}$/.test(code)) return c.json({ message: 'Введите код из письма' }, 422)
    const digest = createHash('sha256').update(data).digest('hex')
    db.exec('begin immediate')
    try {
      const existing = findSubmission.get(key, digest) as { id: string } | undefined
      const { total } = recentSubmissions.get(now - 60_000) as { total: number }
      if (!existing && total >= 30) {
        db.exec('rollback')
        return c.json({ message: 'Слишком много заявок. Попробуйте через минуту' }, 429)
      }
      const codeError = consumeCampaignCode(key, draft.email, code, digest, now)
      if (codeError) {
        db.exec('commit')
        return c.json({ message: codeError }, 422)
      }
      if (existing) {
        db.exec('commit')
        return c.json({ id: existing.id, status: 'accepted' })
      }
      const id = randomUUID()
      saveDraft.run(key, revision, JSON.stringify({ ...draft, partnerDetails: undefined }), now)
      const registryDetails = readPartnerRegistry(draft.business.inn, now)
      insertSubmission.run(id, key, digest, JSON.stringify({ ...draft, registryDetails }), now, now)
      db.prepare("insert into campaign_workflow values (?,'review')").run(id)
      db.exec('commit')
      return c.json({ id, status: 'accepted' }, 201)
    } catch (error) {
      db.exec('rollback')
      throw error
    }
  })
}
