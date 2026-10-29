// Партнёры: компания, проверка юрлица, точки продаж, участники и приглашения, согласия, оферта.
import { Hono } from 'hono'
import { sql, type Tx } from '../db.ts'
import { port } from '../integrations/index.ts'
import { enqueue, handle } from '../integrations/outbox.ts'
import { fail, partner, session, sha256, token, type Env } from './identity.ts'

const APP_URL = () => process.env.APP_URL ?? 'http://127.0.0.1:5174'
export const setting = async <T>(key: string) => (await sql`select value from settings where key = ${key}`)[0]?.value as T

/* ───────── проверка юрлица ───────── */

// Реестр: нет в ЕГРЮЛ или ликвидировано — отказ; высокий риск — ждёт менеджера; иначе — проверено.
// Заодно ищем компанию среди корпоративных клиентов билайна и заводим контрагента в учётной системе.
handle('partners', 'verify', async ({ companyId }: { companyId: string }) => {
  const [co] = await sql`select inn, kyc_status from companies where id = ${companyId}`
  if (!co || co.kyc_status !== 'pending') return
  const r = await port('companyRegistry').findByInn(co.inn)
  const [status, reason] = !r ? ['rejected', 'компания не найдена в ЕГРЮЛ']
    : r.status !== 'active' ? ['rejected', 'компания ликвидирована или ликвидируется']
    : r.risk === 'high' ? ['pending', 'нужна проверка менеджером']
    : ['verified', null]
  const client = await port('b2bCrm').findClient(co.inn)
  await sql.begin(async tx => {
    await tx`update companies set kyc_status = ${status},
             kyc_data = ${tx.json({ ...(r ?? {}), reason, review: status === 'pending', b2bManager: client?.manager ?? null } as never)},
             kpp = coalesce(kpp, ${r?.kpp ?? null}), ogrn = coalesce(ogrn, ${r?.ogrn ?? null}), name = coalesce(nullif(${r?.name ?? ''}, ''), name)
             where id = ${companyId}`
    if (client) await tx`insert into external_refs (entity, entity_id, system, external_id) values ('company', ${companyId}, 'b2bCrm', ${client.clientId}) on conflict do nothing`
    if (status === 'verified') await enqueue(tx, 'accounting', 'syncCounterparty', { companyId }, `acc:cp:${companyId}`)
  })
})

handle('accounting', 'syncCounterparty', async ({ companyId }: { companyId: string }) => {
  const [co] = await sql`select inn, kpp, name, bank from companies where id = ${companyId}`
  const { externalId } = await port('accounting').syncCounterparty({ companyId, inn: co.inn, kpp: co.kpp ?? undefined, name: co.name, bank: co.bank ?? undefined })
  await sql`insert into external_refs (entity, entity_id, system, external_id) values ('company', ${companyId}, 'accounting', ${externalId})
            on conflict (entity, entity_id, system) do update set external_id = excluded.external_id`
})

/* ───────── чтение ───────── */

export async function companyView(companyId: string) {
  const [co] = await sql`select * from companies where id = ${companyId}`
  const points = await sql`select id, addr, normalized, lat, lon, active from points where company_id = ${companyId} order by id`
  const members = await sql`select u.id, u.name, u.email, m.role, m.title, m.signer from memberships m join users u on u.id = m.user_id
                            where m.company_id = ${companyId} order by m.created_at`
  const invitations = await sql`select id, target, role, expires_at as "expiresAt" from invitations
                                where company_id = ${companyId} and accepted_at is null and expires_at > now() order by created_at`
  const consents = await sql`select kind, version, granted_at as "grantedAt" from partner_consents
                             where company_id = ${companyId} and revoked_at is null order by granted_at`
  return {
    id: co.id, inn: co.inn, kpp: co.kpp, ogrn: co.ogrn, name: co.name, brand: co.brand, segment: co.segment,
    kycStatus: co.kyc_status, kycReason: co.kyc_data?.reason ?? null, address: co.kyc_data?.address ?? null,
    bank: co.bank, site: co.site, phone: co.phone, notify: co.notify, edoOperator: co.edo_operator, autoTopup: co.auto_topup,
    offerVersion: co.offer_version, offerAcceptedAt: co.offer_accepted_at, currentOfferVersion: await setting<string>('offer_version'),
    points: points.map(p => ({ id: Number(p.id), addr: p.addr, normalized: p.normalized, lat: p.lat, lon: p.lon, active: p.active })),
    members, invitations, consents,
  }
}

/* ───────── кабинет ───────── */

export const company = new Hono<Env>()

company.get('/', async c => c.json(await companyView(c.var.partner.companyId)))

company.patch('/', partner('owner'), async c => {
  const b = await c.req.json<Record<string, unknown>>()
  const id = c.var.partner.companyId
  if (b.segment !== undefined && !['small', 'medium', 'large'].includes(String(b.segment))) fail(422, 'неизвестный сегмент')
  if (b.bank !== undefined) {
    const bank = b.bank as { bik?: string; account?: string; bank?: string }
    if (!/^\d{9}$/.test(bank.bik ?? '') || !/^\d{20}$/.test((bank.account ?? '').replace(/\s/g, ''))) fail(422, 'БИК — 9 цифр, счёт — 20 цифр')
    b.bank = { bik: bank.bik, account: bank.account!.replace(/\s/g, ''), bank: bank.bank ?? '' }
  }
  const cols: Record<string, string> = { brand: 'brand', segment: 'segment', site: 'site', phone: 'phone', notify: 'notify', autoTopup: 'auto_topup', bank: 'bank' }
  const patch = Object.fromEntries(Object.entries(cols).filter(([k]) => b[k] !== undefined).map(([k, col]) => [col, b[k]]))
  if (Object.keys(patch).length) {
    await sql`update companies set ${sql(patch as never)} where id = ${id}`
    await audit(c.var.partner.userId, id, 'company.update', 'company', id, patch)
  }
  if (b.bank) await enqueue(sql, 'accounting', 'syncCounterparty', { companyId: id }, `acc:cp:${id}:${sha256(JSON.stringify(b.bank)).slice(0, 12)}`)
  return c.json(await companyView(id))
})

company.post('/points', partner('owner', 'staff'), async c => {
  const { addr } = await c.req.json<{ addr: string }>()
  const geo = await port('geo').geocode(String(addr ?? ''))
  if (!geo) fail(422, 'адрес не найден, уточните его')
  await sql`insert into points (company_id, addr, normalized, lat, lon) values (${c.var.partner.companyId}, ${addr.trim()}, ${geo!.normalized}, ${geo!.lat}, ${geo!.lon})`
  return c.json(await companyView(c.var.partner.companyId))
})

company.patch('/points/:pointId', partner('owner', 'staff'), async c => {
  const { active } = await c.req.json<{ active: boolean }>()
  const id = c.var.partner.companyId
  await sql.begin(async tx => {
    const [p] = await tx`update points set active = ${!!active} where id = ${c.req.param('pointId')} and company_id = ${id} returning id`
    if (!p) fail(404, 'нет такой точки')
    const [{ n }] = await tx`select count(*)::int as n from points where company_id = ${id} and active`
    if (n === 0) fail(422, 'хотя бы одна точка должна быть в рекламе')
  })
  return c.json(await companyView(id))
})

company.post('/invitations', partner('owner'), async c => {
  const b = await c.req.json<{ email: string; role: string }>()
  const email = String(b.email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(422, 'проверьте почту')
  if (!['staff', 'accountant'].includes(b.role)) fail(422, 'пригласить можно сотрудника или бухгалтера')
  const t = token(), days = await setting<number>('invitation_ttl_days')
  const [inv] = await sql`insert into invitations (company_id, target, role, token_hash, invited_by, expires_at)
                          values (${c.var.partner.companyId}, ${email}, ${b.role}, ${sha256(t)}, ${c.var.partner.userId}, now() + ${days + ' days'}::interval)
                          returning id`
  const [co] = await sql`select name from companies where id = ${c.var.partner.companyId}`
  await port('messaging').send({ channel: 'email', to: email, template: 'invitation', idempotencyKey: `inv:${inv.id}`,
    params: { company: co.name, role: b.role, url: `${APP_URL()}/invite/${t}` } })
  return c.json(await companyView(c.var.partner.companyId))
})

company.delete('/members/:userId', partner('owner'), async c => {
  const userId = c.req.param('userId'), id = c.var.partner.companyId
  if (userId === c.var.partner.userId) fail(422, 'нельзя удалить себя')
  const [m] = await sql`delete from memberships where company_id = ${id} and user_id = ${userId} returning role`
  if (!m) fail(404, 'нет такого участника')
  await sql`delete from sessions where user_id = ${userId} and company_id = ${id}`
  await audit(c.var.partner.userId, id, 'member.remove', 'user', userId, { role: m.role })
  return c.json(await companyView(id))
})

company.post('/consents', async c => {
  const { kind } = await c.req.json<{ kind: string }>()
  if (!['company', 'signer', 'profile'].includes(kind)) fail(422, 'неизвестное согласие')
  const version = await setting<string>('offer_version')
  await sql`insert into partner_consents (company_id, user_id, kind, version) values (${c.var.partner.companyId}, ${c.var.partner.userId}, ${kind}, ${version})`
  return c.json(await companyView(c.var.partner.companyId))
})

company.delete('/consents/:kind', async c => {
  await sql`update partner_consents set revoked_at = now() where company_id = ${c.var.partner.companyId} and kind = ${c.req.param('kind')} and revoked_at is null`
  return c.json(await companyView(c.var.partner.companyId))
})

/** Принять оферту. Только подписант. Используют и кабинет, и отправка кампании. */
export async function acceptOffer(tx: Tx, companyId: string, userId: string) {
  const version = (await tx`select value from settings where key = 'offer_version'`)[0].value as string
  const [co] = await tx`update companies set offer_version = ${version}, offer_accepted_at = now()
                        where id = ${companyId} and offer_version is distinct from ${version} returning id`
  if (co) {
    await tx`insert into documents (company_id, kind, number, status, data) values (${companyId}, 'offer', ${'оферта ' + version}, 'signed',
             ${tx.json({ version, acceptedBy: userId })}) on conflict (company_id, kind, number) do nothing`
    await tx`insert into audit_log (actor_type, actor_id, company_id, action) values ('partner', ${userId}, ${companyId}, 'offer.accept')`
  }
}

company.post('/offer', async c => {
  if (!c.var.partner.signer) fail(403, 'оферту принимает подписант компании')
  await sql.begin(tx => acceptOffer(tx, c.var.partner.companyId, c.var.partner.userId))
  return c.json(await companyView(c.var.partner.companyId))
})

company.post('/edo', partner('owner', 'accountant'), async c => {
  const { operator } = await c.req.json<{ operator: string }>()
  if (!String(operator ?? '').trim()) fail(422, 'укажите оператора ЭДО')
  const id = c.var.partner.companyId
  await sql.begin(async tx => {
    await tx`update companies set edo_operator = ${operator.trim()} where id = ${id}`
    await enqueue(tx, 'edo', 'invite', { companyId: id }, `edo:invite:${id}:${operator.trim()}`)
  })
  return c.json(await companyView(id))
})

handle('edo', 'invite', async ({ companyId }: { companyId: string }) => {
  const [co] = await sql`select inn, kpp, edo_operator from companies where id = ${companyId}`
  const { externalId } = await port('edo').invite({ inn: co.inn, kpp: co.kpp ?? undefined, operator: co.edo_operator ?? undefined })
  await sql`insert into external_refs (entity, entity_id, system, external_id) values ('company', ${companyId}, 'edo', ${externalId})
            on conflict (entity, entity_id, system) do update set external_id = excluded.external_id`
})

/* ───────── без выбранной компании: добавить компанию, принять приглашение ───────── */

export const onboarding = new Hono<Env>()

async function userOf(c: Parameters<typeof session>[0]) {
  const s = await session(c)
  if (!s?.user_id) fail(401, 'нужно войти')
  return s!
}

// Вошёл по почте и добавляет компанию по ИНН: владелец, но не подписант — оферту примет руководитель через бизнес-ID.
onboarding.post('/companies', async c => {
  const s = await userOf(c)
  const inn = String((await c.req.json()).inn ?? '').trim()
  if (!/^\d{10}(\d{2})?$/.test(inn)) fail(422, 'ИНН — 10 или 12 цифр')
  const companyId = await sql.begin(async tx => {
    const [exists] = await tx`select 1 from companies where inn = ${inn}`
    if (exists) fail(409, 'компания уже подключена — попросите владельца пригласить вас')
    const [co] = await tx`insert into companies (inn, name) values (${inn}, ${'ИНН ' + inn}) returning id`
    await tx`insert into memberships (company_id, user_id, role, signer) values (${co.id}, ${s.user_id}, 'owner', false)`
    await enqueue(tx, 'partners', 'verify', { companyId: co.id }, `kyc:${co.id}`)
    await tx`update sessions set company_id = ${co.id} where token_hash = ${s.token_hash}`
    return co.id as string
  })
  return c.json(await companyView(companyId))
})

onboarding.post('/invitations/:token/accept', async c => {
  const s = await userOf(c)
  const companyId = await sql.begin(async tx => {
    const [inv] = await tx`update invitations set accepted_at = now()
                           where token_hash = ${sha256(c.req.param('token'))} and accepted_at is null and expires_at > now()
                           returning company_id, role`
    if (!inv) fail(404, 'приглашение не найдено или устарело')
    await tx`insert into memberships (company_id, user_id, role) values (${inv.company_id}, ${s.user_id}, ${inv.role}) on conflict do nothing`
    await tx`update sessions set company_id = ${inv.company_id} where token_hash = ${s.token_hash}`
    return inv.company_id as string
  })
  return c.json({ ok: true, companyId })
})

export const audit = (userId: string, companyId: string, action: string, entity: string, entityId: string, diff: unknown) =>
  sql`insert into audit_log (actor_type, actor_id, company_id, action, entity, entity_id, diff)
      values ('partner', ${userId}, ${companyId}, ${action}, ${entity}, ${entityId}, ${sql.json(diff as never)})`
