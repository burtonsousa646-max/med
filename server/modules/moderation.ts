// Модерация креативов: стоп-слова из справочника и проверка моделью (порт llm), спорное — в ручную очередь.
// Решение: стоп-слово или уверенный отказ модели — отклонить с причиной для партнёра; «нужен человек» — очередь; иначе — одобрить.
import { Hono } from 'hono'
import { sql, type Tx } from '../db.ts'
import { port } from '../integrations/index.ts'
import { enqueue, handle } from '../integrations/outbox.ts'
import { fail, staff, type Env } from './identity.ts'
import { creativeRejected } from './campaigns.ts'
import { notify } from './notifications.ts'

const LLM_REJECT_CONFIDENCE = 0.8

export async function startModeration(tx: Tx, creativeId: string | number, companyId: string) {
  const [t] = await tx`insert into moderation_tasks (creative_id, company_id) values (${creativeId}, ${companyId}) returning id`
  await enqueue(tx, 'moderation', 'check', { taskId: t.id }, `mod:${t.id}`)
}

export function stopHits(text: string, rules: { pattern: string; why: string; fix: string }[]) {
  return rules.flatMap(r => {
    const m = new RegExp(r.pattern, 'i').exec(text)
    return m ? [{ word: m[0], why: r.why, fix: r.fix }] : []
  })
}

handle('moderation', 'check', async ({ taskId }: { taskId: string }) => {
  const [t] = await sql`select t.id, t.status, c.id as creative_id, c.ad_text, c.image_key, cm.type
                        from moderation_tasks t join creatives c on c.id = t.creative_id join campaigns cm on cm.id = c.campaign_id
                        where t.id = ${taskId}`
  if (!t || t.status !== 'auto') return
  const hits = stopHits(t.ad_text, await sql`select pattern, why, fix from stop_words where active`)
  const llm = await port('llm').moderate({ text: t.ad_text, imageUrl: t.image_key ? port('storage').url(t.image_key) : undefined, offerType: t.type })
  const autoResult = { hits, llm }
  await sql.begin(async tx => {
    if (hits.length) return decide(tx, taskId, 'rejected', `«${hits[0].word}»: ${hits[0].why}. Например: «${hits[0].fix}»`, autoResult)
    if (llm.verdict === 'reject' && llm.confidence >= LLM_REJECT_CONFIDENCE)
      return decide(tx, taskId, 'rejected', llm.reasons.map(r => r.why).join('; ') || 'не прошло проверку', autoResult)
    if (llm.verdict !== 'ok') {
      await tx`update moderation_tasks set status = 'queued', auto_result = ${tx.json(autoResult as never)} where id = ${taskId}`
      return
    }
    await decide(tx, taskId, 'approved', null, autoResult)
  })
})

/** Решение по задаче — автоматическое или сотрудника. Одобрение отправляет креатив на маркировку. */
export async function decide(tx: Tx, taskId: string | number, verdict: 'approved' | 'rejected', reason: string | null, autoResult?: unknown, staffId?: string) {
  const [t] = await tx`update moderation_tasks set status = ${verdict}, reason = ${reason}, decided_by = ${staffId ?? null}, decided_at = now(),
                       auto_result = coalesce(${autoResult === undefined ? null : tx.json(autoResult as never)}, auto_result)
                       where id = ${taskId} and status in ('auto', 'queued') returning creative_id, company_id`
  if (!t) fail(409, 'по задаче уже есть решение')
  await tx`update creatives set status = ${verdict} where id = ${t.creative_id}`
  if (verdict === 'approved') await enqueue(tx, 'ord', 'markCreative', { creativeId: t.creative_id }, `ord:creative:${t.creative_id}`)
  else {
    const c = await creativeRejected(tx, t.creative_id)
    await notify(tx, t.company_id, 'creative_rejected', { reason: reason ?? '', campaignId: String(c?.id ?? '') }, `rej:${taskId}`)
  }
}

/* ───────── бэкофис ───────── */

export const moderationAdmin = new Hono<Env>()

moderationAdmin.get('/moderation', staff('moderator'), async c => {
  const rows = await sql`select t.id, t.created_at, t.auto_result, c.ad_text, c.image_key, c.version, cm.id as campaign_id, cm.type, co.name as company, co.inn
                         from moderation_tasks t join creatives c on c.id = t.creative_id join campaigns cm on cm.id = c.campaign_id join companies co on co.id = t.company_id
                         where t.status = 'queued' order by t.created_at limit 100`
  return c.json(rows.map(r => ({ id: Number(r.id), createdAt: r.created_at, adText: r.ad_text, imageUrl: r.image_key && port('storage').url(r.image_key), version: r.version,
    campaignId: Number(r.campaign_id), type: r.type, company: r.company, inn: r.inn, llm: r.auto_result?.llm ?? null })))
})

moderationAdmin.post('/moderation/:id', staff('moderator'), async c => {
  const b = await c.req.json<{ verdict: 'approved' | 'rejected'; reason?: string }>()
  if (!['approved', 'rejected'].includes(b.verdict)) fail(422, 'решение: approved или rejected')
  if (b.verdict === 'rejected' && !b.reason?.trim()) fail(422, 'напишите причину — её увидит партнёр')
  await sql.begin(async tx => {
    await decide(tx, c.req.param('id'), b.verdict, b.reason?.trim() ?? null, undefined, c.var.staff.staffId)
    await tx`insert into audit_log (actor_type, actor_id, action, entity, entity_id, diff)
             values ('staff', ${c.var.staff.staffId}, 'moderation.decide', 'moderation_task', ${c.req.param('id')}, ${tx.json(b)})`
  })
  return c.json({ ok: true })
})
