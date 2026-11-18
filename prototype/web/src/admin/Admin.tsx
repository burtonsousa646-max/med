// Бэкофис сотрудников билайна. Типы — из api/admin.yaml (npm run api:types → admin.gen.ts).
// Разделы показываются по ролям из SSO; права всё равно проверяет сервер.
import { Suspense, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams } from 'react-router'
import { AlertTriangle, Building2, FileWarning, Gauge, LogOut, Megaphone, Plug, ScrollText, Settings2, ShieldCheck, Sparkles, Wallet } from 'lucide-react'
import createFetchClient from 'openapi-fetch'
import createClient from 'openapi-react-query'
import type { paths } from '../admin.gen'
import { kop, newKey, queryClient } from '../api'
import { Brand, Chip, Num, gap, n, rub, toast, when } from '../ui'

const admin = createFetchClient<paths>({ baseUrl: import.meta.env.VITE_API_URL ?? '/api', credentials: 'include' })
const $a = createClient(admin)
const act = { onSuccess: () => queryClient.invalidateQueries(), onError: (e: unknown) => toast((e as { message?: string })?.message ?? 'не получилось') }
type Role = 'moderator' | 'manager' | 'finance' | 'admin'

const NAV: [string, string, typeof Gauge, Role[]][] = [
  ['', 'обзор', Gauge, []], ['moderation', 'модерация', ShieldCheck, ['moderator']], ['companies', 'партнёры', Building2, ['manager', 'finance', 'moderator']],
  ['campaigns', 'кампании', Megaphone, ['manager', 'moderator', 'finance']], ['finance', 'финансы', Wallet, ['finance']], ['special', 'спецпроекты', Sparkles, ['manager']],
  ['catalog', 'справочники', Settings2, ['admin']], ['integrations', 'интеграции', Plug, ['admin']], ['audit', 'журнал', ScrollText, ['admin']],
]
const can = (roles: Role[], need: Role[]) => !need.length || roles.includes('admin') || need.some(r => roles.includes(r))
const KYC: Record<string, [string, string]> = { pending: ['проверяется', ''], verified: ['проверена', 'bl-tag--soft-green'], rejected: ['отказ', 'bl-tag--soft-violet'], blocked: ['заблокирована', 'bl-tag--soft-violet'] }

function Shell({ roles, name, children }: { roles: Role[]; name: string; children: ReactNode }) {
  const nav = useNavigate()
  const logout = () => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(() => { queryClient.clear(); nav('/admin') })
  return (
    <div className="bl-page">
      <div className="cab">
        <aside className="cab-nav">
          <Brand to="/admin" />
          <div className="cab-nav__extra bl-stack" style={gap('2px')}><span className="bl-medium">бэкофис</span><span className="bl-caption">{name} · {roles.join(', ')}</span></div>
          <nav aria-label="Разделы бэкофиса">
            {NAV.filter(x => can(roles, x[3])).map(([id, t, Icon]) => <NavLink key={id} end={id === ''} to={`/admin/${id}`} className={({ isActive }) => (isActive ? 'is-active' : '')}><Icon size={20} />{t}</NavLink>)}
          </nav>
          <button className="bl-btn bl-btn--ghost bl-caption" onClick={logout}><LogOut size={16} />выйти</button>
        </aside>
        <main className="cab-main"><Suspense fallback={<div className="bl-skeleton" style={{ height: 240, marginTop: 16 }} />}>{children}</Suspense></main>
      </div>
    </div>
  )
}
const Title = ({ children, aside }: { children: ReactNode; aside?: ReactNode }) => <div className="page-title" style={{ margin: '16px 0 0' }}><h1 className="bl-display-l">{children}</h1>{aside}</div>
const Section = ({ children, title }: { children: ReactNode; title?: ReactNode }) => <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('16px') }}>{title && <h2 className="bl-h3">{title}</h2>}{children}</section>
const Stat = ({ label, value, sub, to }: { label: string; value: ReactNode; sub?: ReactNode; to?: string }) => {
  const body = <div className="bl-stat"><span className="bl-stat__label">{label}</span><span className="bl-stat__value">{value}</span>{sub && <span className="bl-stat__label">{sub}</span>}</div>
  return to ? <Link to={to} className="bl-card bl-card--white" style={{ color: 'inherit', textDecoration: 'none' }}>{body}</Link> : <div className="bl-card bl-card--white">{body}</div>
}
const Table = ({ head, children }: { head: string[]; children: ReactNode }) => <div className="bl-table-wrap"><table className="bl-table"><thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
const ask = (q: string) => (prompt(q) ?? '').trim()

/* ───────── обзор ───────── */
function Overview() {
  const o = $a.useSuspenseQuery('get', '/admin/overview', {}, { refetchInterval: 30_000 }).data
  return <>
    <Title>обзор</Title>
    <section className="bl-grid kpis">
      <Stat label="выручка за месяц" value={<Num value={kop(o.revenueMonthKop)} suffix=" ₽" />} sub={`сегодня ${rub(kop(o.revenueTodayKop))}`} />
      <Stat label="показы сегодня" value={<Num value={o.impressionsToday} />} sub={`кликов ${n(o.clicksToday)}`} />
      <Stat label="живые кампании" value={<Num value={o.liveCampaigns} />} sub={`партнёров ${n(o.companies)}`} to="/admin/campaigns" />
    </section>
    <Section title="ждут людей">
      <div className="bl-row">
        <Link className="bl-btn" to="/admin/moderation">модерация · {o.moderationQueued}</Link>
        <Link className="bl-btn" to="/admin/companies?kyc=pending">проверка юрлиц · {o.kycPending}</Link>
        <Link className="bl-btn" to="/admin/finance">счета к оплате · {o.invoicesIssued}</Link>
        <Link className="bl-btn" to="/admin/special">спецпроекты · {o.specialNew}</Link>
        <Link className={`bl-btn${o.outboxFailed ? ' bl-btn--primary' : ''}`} to="/admin/integrations">упавшие интеграции · {o.outboxFailed}</Link>
      </div>
    </Section>
    <Section title="интеграции">
      <div className="bl-row">{o.ports.map(p => <span key={p.port} className={`bl-tag${p.adapter === 'stub' ? '' : ' bl-tag--soft-green'}`}>{p.port}: {p.adapter === 'stub' ? 'заглушка' : p.adapter}</span>)}</div>
      <p className="bl-caption">Зелёные — подключены к системам билайна, серые — работают на заглушках. Как подключить — docs/integrations.md.</p>
    </Section>
  </>
}

/* ───────── модерация ───────── */
function Moderation() {
  const q = $a.useSuspenseQuery('get', '/admin/moderation', {}, { refetchInterval: 15_000 }).data
  const decide = $a.useMutation('post', '/admin/moderation/{id}', act)
  const reject = (id: number) => { const reason = ask('Причина отказа — её увидит партнёр'); if (reason) decide.mutate({ params: { path: { id } }, body: { verdict: 'rejected', reason } }) }
  return <>
    <Title>модерация</Title>
    <Section title={q.length ? `в очереди ${q.length}` : 'очередь пуста'}>
      {!q.length && <p className="bl-body bl-secondary">Стоп-слова и уверенные решения модели проходят сами. Сюда попадает то, где модель попросила человека.</p>}
      {q.map(t => (
        <div key={t.id} className="bl-card bl-card--white" style={{ gap: 12 }}>
          <div className="bl-row" style={{ justifyContent: 'space-between' }}><span className="bl-caption">{t.company} · ИНН {t.inn} · кампания {t.campaignId}, версия {t.version} · {when(t.createdAt)}</span><span className="bl-tag">{t.type}</span></div>
          <p className="bl-body-l">{t.adText}</p>
          {t.imageUrl && <img src={t.imageUrl} alt="картинка объявления" style={{ maxWidth: 240, borderRadius: 12 }} />}
          {t.llm && <p className="bl-caption"><AlertTriangle size={14} /> модель: {String((t.llm as { verdict?: string }).verdict)} — {((t.llm as { reasons?: { why: string }[] }).reasons ?? []).map(r => r.why).join('; ')}</p>}
          <div className="bl-row"><button className="bl-btn bl-btn--primary" disabled={decide.isPending} onClick={() => decide.mutate({ params: { path: { id: t.id } }, body: { verdict: 'approved' } })}>одобрить</button><button className="bl-btn" disabled={decide.isPending} onClick={() => reject(t.id)}>отклонить с причиной</button></div>
        </div>
      ))}
    </Section>
  </>
}

/* ───────── партнёры ───────── */
function Companies() {
  const [q, setQ] = useState(''), [kyc, setKyc] = useState(new URLSearchParams(location.search).get('kyc') ?? '')
  const rows = $a.useQuery('get', '/admin/companies', { params: { query: { q, ...(kyc ? { kyc: kyc as 'pending' } : {}) } } }).data ?? []
  return <>
    <Title>партнёры</Title>
    <Section>
      <div className="bl-row"><input className="bl-input" style={{ maxWidth: 320 }} value={q} onChange={e => setQ(e.target.value)} placeholder="ИНН, название или бренд" />
        {['', 'pending', 'verified', 'rejected', 'blocked'].map(k => <Chip key={k} on={kyc === k} onClick={() => setKyc(k)}>{k ? KYC[k][0] : 'все'}</Chip>)}</div>
      <Table head={['компания', 'ИНН', 'сегмент', 'проверка', 'живые кампании', 'баланс', 'с нами с']}>
        {rows.map(c => <tr key={c.id}><td><Link to={`/admin/companies/${c.id}`}>{c.brand || c.name}</Link><span className="bl-caption" style={{ display: 'block' }}>{c.name}</span></td><td className="bl-nums">{c.inn}</td><td>{c.segment}</td>
          <td><span className={`bl-tag ${KYC[c.kycStatus][1]}`}>{KYC[c.kycStatus][0]}</span></td><td>{c.liveCampaigns}</td><td className="bl-nums">{rub(kop(c.availableKop))}</td><td className="bl-nums">{when(c.createdAt)}</td></tr>)}
      </Table>
      {!rows.length && <p className="bl-caption">никого не нашли</p>}
    </Section>
  </>
}

function CompanyCard({ roles }: { roles: Role[] }) {
  const id = useParams().id!
  const c = $a.useSuspenseQuery('get', '/admin/companies/{id}', { params: { path: { id } } }).data
  const kyc = $a.useMutation('post', '/admin/companies/{id}/kyc', act)
  const adjust = $a.useMutation('post', '/admin/adjustments', act)
  const set = (status: 'verified' | 'rejected' | 'blocked') => {
    const reason = status === 'verified' ? undefined : ask(status === 'blocked' ? 'Причина блокировки — её увидит партнёр' : 'Причина отказа — её увидит партнёр')
    if (status !== 'verified' && !reason) return
    kyc.mutate({ params: { path: { id } }, body: { status, reason } })
  }
  const correct = () => {
    const rubles = Number(ask('Сумма корректировки в рублях, минус — списать').replace(',', '.'))
    if (!rubles) return
    const memo = ask('Причина корректировки')
    if (memo) adjust.mutate({ body: { companyId: id, amountKop: String(Math.round(rubles * 100)), account: 'main', memo, idempotencyKey: newKey() } })
  }
  return <>
    <Title aside={<span className={`bl-tag ${KYC[c.kycStatus][1]}`}>{KYC[c.kycStatus][0]}</span>}>{c.brand || c.name}</Title>
    <div className="two two--even">
      <Section title="реквизиты и проверка">
        <dl className="kv"><dt>название</dt><dd>{c.name}</dd><dt>ИНН / КПП</dt><dd>{c.inn}{c.kpp && ` / ${c.kpp}`}</dd><dt>ОГРН</dt><dd>{c.ogrn ?? '—'}</dd><dt>адрес</dt><dd>{c.address ?? '—'}</dd>
          <dt>риск</dt><dd>{c.risk ?? '—'}</dd>{c.kycReason && <><dt>причина</dt><dd>{c.kycReason}</dd></>}<dt>менеджер B2B</dt><dd>{c.b2bManager ? `${c.b2bManager.name}, ${c.b2bManager.email}` : 'не клиент B2B'}</dd>
          <dt>ЭДО</dt><dd>{c.edoOperator ?? 'не подключено'}</dd><dt>оферта</dt><dd>{c.offerVersion ?? 'не принята'}</dd><dt>связи</dt><dd>{c.externalRefs.map(r => `${r.system}: ${r.externalId}`).join(', ') || '—'}</dd></dl>
        {can(roles, ['manager']) && <div className="bl-row">
          {c.kycStatus !== 'verified' && <button className="bl-btn bl-btn--primary" onClick={() => set('verified')}>проверена</button>}
          {c.kycStatus === 'pending' && <button className="bl-btn" onClick={() => set('rejected')}>отказать</button>}
          {c.kycStatus !== 'blocked' && <button className="bl-btn" onClick={() => set('blocked')}>заблокировать</button>}
        </div>}
      </Section>
      <Section title="деньги">
        <dl className="kv"><dt>основной</dt><dd>{rub(kop(c.balance.mainKop))}</dd><dt>бонусы</dt><dd>{rub(kop(c.balance.bonusKop))}</dd><dt>к выплате</dt><dd>{rub(kop(c.balance.payoutKop))}</dd></dl>
        {can(roles, ['finance']) && <div><button className="bl-btn" onClick={correct}>корректировка баланса</button></div>}
        <Table head={['когда', 'операция', 'сумма']}>{c.operations.map(o => <tr key={o.id}><td className="bl-nums">{when(o.createdAt)}</td><td>{o.memo}</td><td className="bl-nums">{rub(kop(o.amountKop))}</td></tr>)}</Table>
      </Section>
    </div>
    <div className="two two--even" style={{ marginTop: 24 }}>
      <Section title="люди">{c.members.map(m => <div key={(m.email ?? '') + m.name} className="bl-cell"><span className="bl-cell__main"><span className="bl-cell__title">{m.name || m.email}</span><span className="bl-cell__sub" style={{ display: 'block' }}>{m.email}</span></span><span className="bl-tag">{m.role}{m.signer ? ', подписант' : ''}</span></div>)}</Section>
      <Section title="кампании"><Table head={['кампания', 'тип', 'статус', 'бюджет']}>{c.campaigns.map(x => <tr key={x.id}><td>{x.name}</td><td>{x.type}</td><td>{x.status}</td><td>{rub(kop(x.budgetMonthKop))}</td></tr>)}</Table></Section>
    </div>
  </>
}

/* ───────── кампании ───────── */
function Campaigns({ roles }: { roles: Role[] }) {
  const [status, setStatus] = useState('live')
  const rows = $a.useQuery('get', '/admin/campaigns', { params: { query: status ? { status } : {} } }).data ?? []
  const stop = $a.useMutation('post', '/admin/campaigns/{id}/stop', act)
  const kill = (id: number) => { const reason = ask('Почему останавливаем — увидит партнёр'); if (reason) stop.mutate({ params: { path: { id } }, body: { reason } }) }
  return <>
    <Title>кампании</Title>
    <Section>
      <div className="bl-row">{[['live', 'показываются'], ['moderation', 'на проверке'], ['paused', 'на паузе'], ['invoice', 'ждут оплату'], ['draft', 'черновики'], ['', 'все']].map(([k, t]) => <Chip key={k} on={status === k} onClick={() => setStatus(k)}>{t}</Chip>)}</div>
      <Table head={['кампания', 'партнёр', 'тип', 'статус', 'бюджет', 'траты за месяц', '']}>
        {rows.map(c => <tr key={c.id}><td>{c.name}<span className="bl-caption" style={{ display: 'block' }}>№ {c.id} · {c.placements.join(', ')}</span></td><td><Link to={`/admin/companies/${c.companyId}`}>{c.company}</Link></td><td>{c.type}</td><td>{c.status}</td>
          <td className="bl-nums">{rub(kop(c.budgetMonthKop))}</td><td className="bl-nums">{rub(kop(c.spentMonthKop))}</td>
          <td>{can(roles, ['manager', 'moderator']) && ['live', 'paused', 'moderation'].includes(c.status) && <button className="bl-btn bl-btn--s" onClick={() => kill(c.id)}>остановить</button>}</td></tr>)}
      </Table>
      {!rows.length && <p className="bl-caption">кампаний нет</p>}
    </Section>
  </>
}

/* ───────── финансы ───────── */
function Finance() {
  const f = $a.useSuspenseQuery('get', '/admin/finance').data
  const paid = $a.useMutation('post', '/admin/invoices/{id}/paid', act)
  const close = $a.useMutation('post', '/admin/documents/close-month', act)
  const payouts = $a.useMutation('post', '/admin/payouts/run', act)
  const prev = (() => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 7) })()
  const run = (what: 'close' | 'payouts') => {
    const period = ask(`Период ГГГГ-ММ (обычно воркер делает это первого числа сам)`) || prev
    const m = what === 'close' ? close : payouts
    m.mutateAsync({ body: { period } }).then(r => toast(`Готово: компаний ${r.companies}, создано ${r.created}`))
  }
  return <>
    <Title aside={<div className="bl-row"><button className="bl-btn" onClick={() => run('close')}>закрыть месяц</button><button className="bl-btn" onClick={() => run('payouts')}>выплаты за месяц</button></div>}>финансы</Title>
    <section className="bl-grid kpis">
      <Stat label="выручка билайна" value={<Num value={kop(f.totals.revenueKop)} suffix=" ₽" />} sub="за всё время" />
      <Stat label="деньги партнёров на балансах" value={<Num value={kop(f.totals.depositsKop)} suffix=" ₽" />} sub={`бонусы ${rub(kop(f.totals.bonusesKop))}`} />
      <Stat label="к выплате партнёрам" value={<Num value={kop(f.totals.payoutsDueKop)} suffix=" ₽" />} sub="купоны и подписки" />
    </section>
    <Section title={`счета к оплате · ${f.invoices.length}`}>
      <Table head={['счёт', 'партнёр', 'сумма', 'выставлен', '']}>{f.invoices.map(i => <tr key={i.id}><td className="bl-nums">{i.number}</td><td>{i.company}<span className="bl-caption" style={{ display: 'block' }}>ИНН {i.inn}</span></td><td className="bl-nums">{rub(kop(i.amountKop))}</td><td className="bl-nums">{when(i.issuedAt)}</td>
        <td><button className="bl-btn bl-btn--s" onClick={() => confirm(`Отметить счёт ${i.number} оплаченным? Деньги зачислятся партнёру.`) && paid.mutate({ params: { path: { id: i.id } } })}>оплачен</button></td></tr>)}</Table>
    </Section>
    {f.unmatched.length > 0 && <Section title={<><FileWarning size={18} /> поступления без счёта · {f.unmatched.length}</>}>
      <Table head={['когда', 'ИНН плательщика', 'сумма', 'назначение']}>{f.unmatched.map(u => <tr key={u.externalId}><td className="bl-nums">{when(u.createdAt)}</td><td>{u.payerInn}</td><td className="bl-nums">{u.amountKop ? rub(kop(u.amountKop)) : '—'}</td><td>{u.purpose}</td></tr>)}</Table>
    </Section>}
    <Section title="выплаты">
      <Table head={['партнёр', 'период', 'сумма', 'статус']}>{f.payouts.map(p => <tr key={p.id}><td>{p.company}</td><td>{p.period.slice(0, 7)}</td><td className="bl-nums">{rub(kop(p.netKop))}</td><td>{p.status}</td></tr>)}</Table>
    </Section>
  </>
}

/* ───────── спецпроекты ───────── */
function Special() {
  const rows = $a.useSuspenseQuery('get', '/admin/special-requests').data
  const set = $a.useMutation('patch', '/admin/special-requests/{id}', act)
  const ST = { new: 'новая', in_work: 'в работе', done: 'сделано', declined: 'отказ' } as const
  return <>
    <Title>спецпроекты</Title>
    <Section>{rows.map(r => (
      <div key={r.id} className="bl-card bl-card--white" style={{ gap: 8 }}>
        <div className="bl-row" style={{ justifyContent: 'space-between' }}><span className="bl-medium">{r.company} · {r.kind}</span><span className="bl-tag">{ST[r.status]}{r.manager ? ` · ${r.manager}` : ''}</span></div>
        <p className="bl-body">{r.task}</p><p className="bl-caption">бюджет {r.budget} · {r.phone ?? 'телефон не указан'} · {when(r.createdAt)}</p>
        <div className="bl-row">{(['in_work', 'done', 'declined'] as const).map(s => <Chip key={s} on={r.status === s} onClick={() => set.mutate({ params: { path: { id: r.id } }, body: { status: s } })}>{ST[s]}</Chip>)}</div>
      </div>
    ))}{!rows.length && <p className="bl-body bl-secondary">заявок нет</p>}</Section>
  </>
}

/* ───────── справочники ───────── */
function Catalog() {
  const places = $a.useSuspenseQuery('get', '/admin/placements').data
  const settings = $a.useSuspenseQuery('get', '/admin/settings').data
  const patchPlace = $a.useMutation('patch', '/admin/placements/{id}', act)
  const patchSetting = $a.useMutation('patch', '/admin/settings/{key}', act)
  const editBid = (id: string, cur: string) => { const v = Number(ask(`Минимальная ставка, ₽ (сейчас ${kop(cur)})`).replace(',', '.')); if (v > 0) patchPlace.mutate({ params: { path: { id } }, body: { minBidKop: Math.round(v * 100) } }) }
  const editSetting = (key: string, cur: unknown) => {
    const raw = prompt(`Новое значение ${key} (JSON)`, JSON.stringify(cur))
    if (raw === null) return
    try { patchSetting.mutate({ params: { path: { key } }, body: { value: JSON.parse(raw) } }) } catch { toast('Это не JSON') }
  }
  return <>
    <Title>справочники</Title>
    <Section title="места показа">
      <Table head={['место', 'поверхность', 'оплата', 'CTR', 'мест', 'мин. ставка', '']}>{places.map(p => <tr key={p.id} className={p.active ? '' : 'is-dim'}><td>{p.name}<span className="bl-caption" style={{ display: 'block' }}>{p.id}</span></td><td>{p.surface}</td><td>{p.pricing}</td><td>{p.baseCtr ?? '—'} %</td><td>{p.slots}</td>
        <td className="bl-nums"><button className="bl-btn bl-btn--s bl-btn--ghost" onClick={() => editBid(p.id, p.minBidKop)}>{rub(kop(p.minBidKop))}</button></td>
        <td><button className="bl-btn bl-btn--s" onClick={() => patchPlace.mutate({ params: { path: { id: p.id } }, body: { active: !p.active } })}>{p.active ? 'выключить' : 'включить'}</button></td></tr>)}</Table>
    </Section>
    <Section title="параметры">
      <Table head={['параметр', 'значение', 'изменён', '']}>{settings.map(s => <tr key={s.key}><td className="bl-nums">{s.key}</td><td><code style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(s.value)}</code></td><td className="bl-nums">{when(s.updatedAt)}</td>
        <td>{s.editable && <button className="bl-btn bl-btn--s" onClick={() => editSetting(s.key, s.value)}>изменить</button>}</td></tr>)}</Table>
    </Section>
  </>
}

/* ───────── интеграции и журнал ───────── */
function Integrations() {
  const [system, setSystem] = useState('')
  const d = $a.useQuery('get', '/admin/integrations', { params: { query: system ? { system } : {} } }, { refetchInterval: 15_000 }).data
  const retry = $a.useMutation('post', '/admin/outbox/{id}/retry', act)
  if (!d) return <div className="bl-skeleton" style={{ height: 240, marginTop: 16 }} />
  return <>
    <Title>интеграции</Title>
    <Section title="очередь">
      <Table head={['задача', 'статус', 'попыток', 'ошибка', 'следующая', '']}>{d.outbox.map(o => <tr key={o.id}><td className="bl-nums">{o.system}.{o.action}</td><td>{o.status}</td><td>{o.attempts}</td><td>{o.lastError ?? '—'}</td><td className="bl-nums">{when(o.nextAt)}</td>
        <td>{o.status === 'failed' && <button className="bl-btn bl-btn--s" onClick={() => retry.mutate({ params: { path: { id: o.id } } })}>повторить</button>}</td></tr>)}</Table>
      {!d.outbox.length && <p className="bl-caption">очередь пуста: всё доставлено</p>}
    </Section>
    <Section title="вызовы и вебхуки">
      <div className="bl-row"><Chip on={!system} onClick={() => setSystem('')}>все</Chip>{d.ports.map(p => <Chip key={p.port} on={system === p.port} onClick={() => setSystem(p.port)}>{p.port}</Chip>)}</div>
      <Table head={['когда', 'система', 'действие', 'итог', 'мс', 'запрос']}>{d.log.map(l => <tr key={l.id}><td className="bl-nums">{when(l.createdAt)}</td><td>{l.direction === 'in' ? '← ' : '→ '}{l.system}</td><td>{l.action}</td>
        <td><span className={`bl-tag${l.ok ? ' bl-tag--soft-green' : ' bl-tag--soft-violet'}`}>{l.ok ? 'ок' : 'ошибка'}</span></td><td>{l.ms ?? '—'}</td><td><code className="bl-caption">{JSON.stringify(l.request)?.slice(0, 120)}</code></td></tr>)}</Table>
    </Section>
  </>
}

function Audit() {
  const rows = $a.useSuspenseQuery('get', '/admin/audit').data
  return <>
    <Title>журнал действий</Title>
    <Section><Table head={['когда', 'кто', 'действие', 'объект', 'компания', 'подробности']}>{rows.map(r => <tr key={r.id}><td className="bl-nums">{when(r.createdAt)}</td><td>{r.actorType}</td><td>{r.action}</td><td>{r.entity ? `${r.entity} ${r.entityId ?? ''}` : '—'}</td><td>{r.company ?? '—'}</td>
      <td><code className="bl-caption">{r.diff ? JSON.stringify(r.diff).slice(0, 140) : ''}</code></td></tr>)}</Table></Section>
  </>
}

/* ───────── вход и маршруты ───────── */
function Login() {
  const start = () => fetch('/api/auth/staff/start', { method: 'POST', credentials: 'include' }).then(r => r.json()).then(r => location.assign(r.url))
  return (
    <div className="bl-page wrap">
      <header className="bl-header"><div className="bl-header__side"><Brand to="/admin" /></div></header>
      <section className="bl-section pad bl-stack" style={{ ...gap('16px'), marginTop: 48, maxWidth: 640 }}>
        <h1 className="bl-h2">бэкофис рекламной платформы</h1>
        <p className="bl-body bl-secondary">Для сотрудников билайна: модерация, партнёры, финансы, справочники и интеграции. Вход — через корпоративный SSO, роли приходят из него.</p>
        <div><button className="bl-btn bl-btn--primary bl-btn--l" onClick={start}>войти через SSO билайна</button></div>
      </section>
    </div>
  )
}

type Staff = { name: string; email: string; roles: Role[] }
// Кто вошёл: /auth/me описан в контракте кабинета, а не бэкофиса, поэтому обычный запрос. null — не сотрудник.
const useStaff = () => useQuery({
  queryKey: ['staff-me'], retry: false,
  queryFn: async (): Promise<Staff | null> => { const r = await fetch('/api/auth/me', { credentials: 'include' }); const b = r.ok ? await r.json() : null; return b?.kind === 'staff' ? b.staff : null },
})

export default function Admin() {
  const { data: me, isPending } = useStaff()
  if (isPending) return <div className="bl-page wrap" aria-busy="true" />
  if (!me) return <Login />
  const roles = me.roles
  const guard = (need: Role[], el: ReactNode) => (can(roles, need) ? el : <Navigate to="/admin" replace />)
  return (
    <Shell roles={roles} name={me.name || me.email}>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="moderation" element={guard(['moderator'], <Moderation />)} />
        <Route path="companies" element={guard(['manager', 'finance', 'moderator'], <Companies />)} />
        <Route path="companies/:id" element={guard(['manager', 'finance', 'moderator'], <CompanyCard roles={roles} />)} />
        <Route path="campaigns" element={guard(['manager', 'moderator', 'finance'], <Campaigns roles={roles} />)} />
        <Route path="finance" element={guard(['finance'], <Finance />)} />
        <Route path="special" element={guard(['manager'], <Special />)} />
        <Route path="catalog" element={guard(['admin'], <Catalog />)} />
        <Route path="integrations" element={guard(['admin'], <Integrations />)} />
        <Route path="audit" element={guard(['admin'], <Audit />)} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Shell>
  )
}
