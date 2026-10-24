// SQLite тестового сервера. Каждый посетитель — своя строка в companies, остальное ссылается на неё.
// Кампании и реквизиты лежат JSON-ом: модель данных описана в api/openapi.yaml, здесь — только хранение.
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import type { components } from '../src/api.gen.ts'
import { CO, DEFAULT_TERMS, POINTS, SEGMENTS, type CampaignRow, type OfferType, type Segment } from './domain.ts'

type S = components['schemas']
type CompanyData = Omit<S['Company'], 'points' | 'members'>

export const db = new DatabaseSync(process.env.DB_PATH ?? new URL('demo.sqlite', import.meta.url).pathname)
db.exec(`
  pragma journal_mode = wal;
  pragma foreign_keys = on;
  create table if not exists companies (id text primary key, session text not null, data text not null, seen integer not null);
  create table if not exists points (id integer primary key, company_id text not null references companies on delete cascade, addr text not null, x real not null, y real not null, active integer not null default 1);
  create table if not exists members (id integer primary key, company_id text not null references companies on delete cascade, name text not null, email text, role text not null, title text not null);
  create table if not exists campaigns (id integer primary key, company_id text not null references companies on delete cascade, data text not null);
  create table if not exists operations (id integer primary key, company_id text not null references companies on delete cascade, title text not null, amount integer not null, created text not null);
  create table if not exists requests (id integer primary key, company_id text not null references companies on delete cascade, data text not null, created text not null);
  create index if not exists campaigns_company on campaigns (company_id);
`)

const json = <T>(v: unknown) => JSON.parse(String(v)) as T
const now = () => new Date().toISOString()

/* ───────── компания и сессия ───────── */
export function createCompany() {
  // ponytail: чистим заброшенные копии при создании новой; отдельный крон, если посетителей станет много
  db.prepare('delete from companies where seen < ?').run(Date.now() - 30 * 864e5)
  const id = randomUUID()
  const data: CompanyData = {
    name: CO.name, brand: CO.brand, inn: CO.inn, kpp: CO.kpp, ogrn: CO.ogrn, bank: CO.bank, acc: CO.acc, site: CO.site, phone: CO.phone,
    signer: CO.signer, signerShort: CO.signerShort, signerRole: CO.role, employee: CO.employee, segment: 'small',
    consents: { company: true, signer: true, profile: false }, notify: { sms: true, mail: true, tg: false }, edo: null, autoTopup: false, offerAcceptedAt: null,
  }
  const session: S['Session'] = { provider: null, role: 'boss', clock: 'h48' }
  db.prepare('insert into companies values (?, ?, ?, ?)').run(id, JSON.stringify(session), JSON.stringify(data), Date.now())
  for (const p of POINTS) db.prepare('insert into points (company_id, addr, x, y) values (?, ?, ?, ?)').run(id, p.addr, p.x, p.y)
  db.prepare('insert into members (company_id, name, role, title) values (?, ?, ?, ?)').run(id, CO.signer, 'owner', `${CO.role} · подписант, принимает оферту`)
  db.prepare('insert into members (company_id, name, role, title) values (?, ?, ?, ?)').run(id, CO.employee, 'staff', 'маркетолог · кампании и статистика')
  const draft = newCampaign(id, 'click')
  saveCampaign(id, { ...draft, goal: 'rivals', budget: 5000 })
  return id
}

export const companyExists = (id: string) => !!db.prepare('select 1 from companies where id = ?').get(id)
export const touch = (id: string) => db.prepare('update companies set seen = ? where id = ?').run(Date.now(), id)
export const deleteCompany = (id: string) => db.prepare('delete from companies where id = ?').run(id)

export const getSession = (id: string) => json<S['Session']>((db.prepare('select session from companies where id = ?').get(id) as { session: string }).session)
export function setSession(id: string, patch: Partial<S['Session']>) {
  db.prepare('update companies set session = ? where id = ?').run(JSON.stringify({ ...getSession(id), ...patch }), id)
  return getSession(id)
}

const getData = (id: string) => json<CompanyData>((db.prepare('select data from companies where id = ?').get(id) as { data: string }).data)
export function patchCompany(id: string, patch: Partial<CompanyData>) {
  db.prepare('update companies set data = ? where id = ?').run(JSON.stringify({ ...getData(id), ...patch }), id)
}

export function getCompany(id: string): S['Company'] {
  const points = (db.prepare('select id, addr, x, y, active from points where company_id = ? order by id').all(id) as unknown as S['Point'][]).map(p => ({ ...p, active: !!p.active }))
  const members = db.prepare('select id, name, email, role, title from members where company_id = ? order by id').all(id) as unknown as S['Member'][]
  return { ...getData(id), points, members }
}
export const activePoints = (id: string) => (db.prepare('select count(*) n from points where company_id = ? and active = 1').get(id) as { n: number }).n

export function addPoint(id: string, addr: string, slot: { x: number; y: number }) {
  db.prepare('insert into points (company_id, addr, x, y) values (?, ?, ?, ?)').run(id, addr, slot.x, slot.y)
}
export const pointCount = (id: string) => (db.prepare('select count(*) n from points where company_id = ?').get(id) as { n: number }).n
export const setPointActive = (id: string, pointId: number, active: boolean) =>
  db.prepare('update points set active = ? where company_id = ? and id = ?').run(active ? 1 : 0, id, pointId).changes > 0
export const addMember = (id: string, email: string) =>
  db.prepare('insert into members (company_id, name, email, role, title) values (?, ?, ?, ?, ?)').run(id, email, email, 'accountant', 'бухгалтер · документы и баланс')

/* ───────── кампании ───────── */
const MODE: Record<Segment, S['Mode']> = { small: 'auto', medium: 'manual', large: 'plan' }
export function newCampaign(companyId: string, type: OfferType): CampaignRow {
  const segment = getData(companyId).segment
  const row: Omit<CampaignRow, 'id'> = {
    type, status: 'draft', mode: MODE[segment in SEGMENTS ? segment : 'small'], goal: 'near', adText: null, img: 0,
    terms: { ...DEFAULT_TERMS[type] }, audience: { live: 'any', work: 'any', rival: 'and' },
    places: { showcase: true, main: true, paid: true, rest: false, shop: false, push: false, tv: false },
    budget: 10000, amount: null, payMethod: 'sbp', tips: [], approvalToken: null, approved: false, createdAt: now(), submittedAt: null,
  }
  const { lastInsertRowid } = db.prepare('insert into campaigns (company_id, data) values (?, ?)').run(companyId, JSON.stringify(row))
  return { ...row, id: Number(lastInsertRowid) }
}

export function listCampaigns(companyId: string) {
  return (db.prepare('select id, data from campaigns where company_id = ? order by id desc').all(companyId) as { id: number; data: string }[])
    .map(r => ({ ...json<CampaignRow>(r.data), id: r.id }))
}
export function getCampaign(companyId: string, id: number) {
  const r = db.prepare('select data from campaigns where company_id = ? and id = ?').get(companyId, id) as { data: string } | undefined
  return r ? { ...json<CampaignRow>(r.data), id } : null
}
export function saveCampaign(companyId: string, c: CampaignRow) {
  const { id, ...data } = c
  db.prepare('update campaigns set data = ? where company_id = ? and id = ?').run(JSON.stringify(data), companyId, id)
  return c
}
export function byToken(token: string) {
  const r = db.prepare("select id, company_id, data from campaigns where json_extract(data, '$.approvalToken') = ?").get(token) as { id: number; company_id: string; data: string } | undefined
  return r ? { companyId: r.company_id, c: { ...json<CampaignRow>(r.data), id: r.id } } : null
}

/* ───────── деньги и заявки ───────── */
export const addOperation = (companyId: string, title: string, amount: number) =>
  db.prepare('insert into operations (company_id, title, amount, created) values (?, ?, ?, ?)').run(companyId, title, Math.round(amount), now())
export const listOperations = (companyId: string) =>
  db.prepare('select title, amount, created from operations where company_id = ? order by id desc').all(companyId) as { title: string; amount: number; created: string }[]
export const addRequest = (companyId: string, data: object) =>
  Number(db.prepare('insert into requests (company_id, data, created) values (?, ?, ?)').run(companyId, JSON.stringify(data), now()).lastInsertRowid)
