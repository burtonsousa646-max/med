// Маркировка: одобренный креатив регистрируется в ОРД и получает erid; без erid креатив не показывается.
// Цепочка ОРД — организация → договор (оферта) → креатив. Каждый шаг сохраняется в external_refs, повтор задачи не регистрирует дважды.
import { sql } from '../db.ts'
import { port } from '../integrations/index.ts'
import { handle } from '../integrations/outbox.ts'
import { creativeMarked } from './campaigns.ts'

async function ref(entity: string, id: string, make: () => Promise<string>) {
  const [r] = await sql`select external_id from external_refs where entity = ${entity} and entity_id = ${id} and system = 'ord'`
  if (r) return r.external_id as string
  const ext = await make()
  await sql`insert into external_refs (entity, entity_id, system, external_id) values (${entity}, ${id}, 'ord', ${ext}) on conflict do nothing`
  return ext
}

handle('ord', 'markCreative', async ({ creativeId }: { creativeId: string }) => {
  const [c] = await sql`select c.id, c.ad_text, c.image_key, c.erid, cm.placements, co.id as company_id, co.inn, co.name, co.offer_version, co.offer_accepted_at
                        from creatives c join campaigns cm on cm.id = c.campaign_id join companies co on co.id = cm.company_id where c.id = ${creativeId}`
  if (!c) return
  if (!c.erid) {
    const orgRef = await ref('company', c.company_id, async () => (await port('ord').registerOrganization({ companyId: c.company_id, inn: c.inn, name: c.name })).externalId)
    const contractRef = await ref('contract', c.company_id, async () => (await port('ord').registerContract({
      companyId: c.company_id, orgRef, number: `оферта ${c.offer_version ?? ''}`.trim(), date: new Date(c.offer_accepted_at ?? Date.now()).toISOString().slice(0, 10) })).externalId)
    const { erid } = await port('ord').registerCreative({
      creativeId: String(c.id), contractRef, text: c.ad_text, imageUrl: c.image_key ? port('storage').url(c.image_key) : undefined,
      kind: c.placements.includes('push') ? 'push' : c.image_key ? 'banner' : 'text' })
    await sql`update creatives set erid = ${erid} where id = ${c.id} and erid is null`
  }
  await sql.begin(tx => creativeMarked(tx, c.id))
})
