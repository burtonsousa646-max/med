import { useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router'
import { BarChart3, Building2, CircleHelp, FileText, LogOut, MapPin, Megaphone, MessageCircle, Pause, Play, Plug, Plus, Trash2, Wallet } from 'lucide-react'
import { $api, act, client, kop, newKey, queryClient, toKop, useBalance, useCampaign, useCampaigns, useCatalog, useCompany, useDocuments, useMe, useMember, useOfferType, type Campaign } from '../api'
import { Brand, Check, Chip, Num, StatusTag, TypePicker, day, gap, rub, toast, when } from '../ui'

const NAV = [['campaigns', 'кампании', Megaphone], ['stats', 'статистика', BarChart3], ['connections', 'подключения', Plug], ['balance', 'баланс', Wallet], ['docs', 'документы', FileText], ['company', 'компания', Building2], ['help', 'помощь', CircleHelp]] as const
const ROLE = { owner: 'владелец', staff: 'сотрудник', accountant: 'бухгалтер', agency: 'агентство' } as const

function Shell({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  const co = useCompany(), b = useBalance(), nav = useNavigate()
  const logout = () => client.POST('/auth/logout').then(() => { queryClient.clear(); nav('/login') })
  return (
    <div className="bl-page">
      <div className="cab">
        <aside className="cab-nav">
          <div className="bl-row" style={{ justifyContent: 'space-between' }}><Brand /><Link className="bl-btn bl-btn--s bl-show-mobile" to="/cab/balance">{rub(kop(b.availableKop))}</Link></div>
          <div className="cab-nav__extra bl-stack" style={gap('2px')}><span className="bl-medium">{co.brand || co.name}</span><span className="bl-caption">{co.name}</span></div>
          <nav aria-label="Разделы кабинета">
            {NAV.map(([id, t, Icon]) => <NavLink key={id} to={`/cab/${id}`} className={({ isActive }) => (isActive ? 'is-active' : '')}><Icon size={20} />{t}</NavLink>)}
          </nav>
          <div className="cab-nav__extra bl-card" style={{ gap: 4, padding: 16 }}>
            <span className="bl-caption">баланс</span><span className="bl-h3"><Num value={kop(b.availableKop)} suffix=" ₽" /></span>
            {kop(b.bonusKop) > 0 && <span className="bl-caption">из них бонусы {rub(kop(b.bonusKop))}</span>}
            <Link to="/cab/balance" className="bl-caption">пополнить</Link>
          </div>
          <button className="bl-btn bl-btn--ghost bl-caption cab-nav__extra" onClick={logout}><LogOut size={16} />выйти</button>
        </aside>
        <main className="cab-main">
          {co.kycStatus === 'pending' && <div className="bl-notice">Проверяем компанию по ЕГРЮЛ. Оплата и запуск откроются после проверки.</div>}
          {co.kycStatus === 'rejected' && <div className="bl-notice bl-notice--error">Компания не прошла проверку: {co.kycReason}. Напишите в поддержку.</div>}
          <div className="page-title" style={{ margin: '16px 0 0' }}><div className="bl-stack" style={gap('8px')}>{title}</div>{aside}</div>
          {children}
        </main>
      </div>
    </div>
  )
}

/* ───────── кампании ───────── */
// Куда вести из списка: черновик — в сборку, ожидание — к оплате или запуску, живые — в статистику
const NEXT: Record<Campaign['status'], [string, string]> = {
  draft: ['build', 'продолжить'], approval: ['checkout', 'ждёт руководителя'], invoice: ['launch', 'статус'],
  moderation: ['launch', 'статус'], rejected: ['launch', 'исправить'], live: ['stats', ''], paused: ['stats', ''], finished: ['stats', ''], archived: ['stats', ''],
}
export function Campaigns() {
  const list = useCampaigns(), cat = useCatalog(), member = useMember()
  const nav = useNavigate()
  const [pick, setPick] = useState(false)
  const create = $api.useMutation('post', '/cabinet/campaigns', act)
  const patch = $api.useMutation('patch', '/cabinet/campaigns/{id}', act)
  const link = (c: { id: number; status: Campaign['status'] }) => (NEXT[c.status][0] === 'stats' ? `/cab/stats/${c.id}` : `/c/${c.id}/${NEXT[c.status][0]}`)
  const pause = (c: { id: number; status: Campaign['status'] }) => patch.mutateAsync({ params: { path: { id: c.id } }, body: { paused: c.status !== 'paused' } })
    .then(() => toast(c.status === 'paused' ? 'Кампания снова показывается' : 'Кампания на паузе, деньги не списываются'))
  const canCreate = member && member.role !== 'accountant'
  return (
    <Shell title={<h1 className="bl-display-l">кампании</h1>} aside={canCreate && <button className="bl-btn bl-btn--primary bl-btn--l" onClick={() => setPick(true)}><Plus size={18} />новая кампания</button>}>
      <TypePicker open={pick} onClose={() => setPick(false)} onPick={type => create.mutateAsync({ body: { type } }).then(c => nav(`/c/${c.id}/reach`))} />
      <section className="bl-section pad" style={{ maxWidth: 'none' }}>
        <div className="bl-table-wrap"><table className="bl-table">
          <thead><tr><th>кампания</th><th>тип</th><th>статус</th><th>бюджет</th><th>создана</th><th /></tr></thead>
          <tbody>
            {list.map(c => {
              const T = cat.offerTypes.find(t => t.id === c.type)!, on = c.status === 'live' || c.status === 'paused'
              return (
                <tr key={c.id}>
                  <td><Link to={link(c)}>{c.name}</Link></td><td>{T.short}</td><td><StatusTag s={c.status} /></td>
                  <td>{T.share ? 'без бюджета' : `${rub(kop(c.budgetMonthKop))} в мес.`}</td>
                  <td className="bl-nums">{when(c.createdAt)}</td>
                  <td>{on && canCreate
                    ? <button className="bl-btn bl-btn--s" onClick={() => pause(c)}>{c.status === 'paused' ? <><Play size={16} />возобновить</> : <><Pause size={16} />пауза</>}</button>
                    : NEXT[c.status][1] && <Link className="bl-btn bl-btn--s" to={link(c)}>{NEXT[c.status][1]}</Link>}</td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
        {!list.length && <p className="bl-caption" style={{ marginTop: 16 }}>Кампаний пока нет. Нажмите «новая кампания».</p>}
      </section>
    </Shell>
  )
}

/* ───────── статистика: показы и клики появятся с модулем показа (день 3) ───────── */
export function Stats() {
  const id = Number(useParams().id)
  const list = useCampaigns()
  const latest = list.find(c => c.launchedAt)
  if (!id && latest) return <CampaignStats id={latest.id} />
  if (!id) return <Shell title={<h1 className="bl-display-l">статистика</h1>}><EmptyStats /></Shell>
  return <CampaignStats id={id} />
}

function EmptyStats() {
  return (
    <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('16px') }}>
      <h2 className="bl-h2">здесь появятся показы, клики и результаты</h2>
      <p className="bl-body bl-secondary">Запустите первую кампанию. Первые цифры будут через час после старта показов.</p>
      <div><Link className="bl-btn bl-btn--primary bl-btn--l" to="/cab/campaigns">к кампаниям</Link></div>
    </section>
  )
}

function CampaignStats({ id }: { id: number }) {
  const c = useCampaign(id), T = useOfferType(c.type)
  const patch = $api.useMutation('patch', '/cabinet/campaigns/{id}', act)
  const ready = c.status === 'live' || c.status === 'paused'
  return (
    <Shell
      title={<><span className="bl-row" style={{ gap: 8 }}><StatusTag s={c.status} /><span className="bl-tag bl-tag--soft-violet">{T.t}</span></span><h1 className="bl-display-l">{c.name}</h1></>}
      aside={ready && <button className="bl-btn" onClick={() => patch.mutate({ params: { path: { id } }, body: { paused: c.status !== 'paused' } })}>{c.status === 'paused' ? <><Play size={16} />возобновить</> : <><Pause size={16} />пауза</>}</button>}>
      {!ready ? <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('16px') }}>
        <h2 className="bl-h2">статистика появится после запуска</h2>
        <div><Link className="bl-btn bl-btn--primary bl-btn--l" to={`/c/${id}/launch`}>статус запуска</Link></div>
      </section> : <>
        <section className="bl-grid kpis">
          <div className="bl-card bl-card--white"><div className="bl-stat"><span className="bl-stat__label">запущена</span><span className="bl-stat__value" style={{ fontSize: 24 }}>{c.launchedAt ? day(c.launchedAt) : '—'}</span><span className="bl-stat__label">erid {c.liveCreative?.erid}</span></div></div>
          <div className="bl-card bl-card--white"><div className="bl-stat"><span className="bl-stat__label">прогноз охвата</span><span className="bl-stat__value"><Num value={c.forecast.reach} /></span><span className="bl-stat__label">человек в месяц</span></div></div>
          <div className="bl-card bl-card--white"><div className="bl-stat"><span className="bl-stat__label">прогноз кликов</span><span className="bl-stat__value"><Num value={c.forecast.clicks} /></span><span className="bl-stat__label">по {rub(kop(c.forecast.cpcKop))}</span></div></div>
        </section>
        <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('12px') }}>
          <h2 className="bl-h3">показы и клики</h2>
          <p className="bl-body bl-secondary">Кампания в аукционе. Показы, клики и {T.unit} появятся здесь по часам, как только поверхности билайна начнут запрашивать рекламу.</p>
        </section>
      </>}
    </Shell>
  )
}

export function Connections() {
  return (
    <Shell title={<h1 className="bl-display-l">подключения</h1>}>
      <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('12px') }}>
        <h2 className="bl-h3">ответ вашего сервера и загрузка файла</h2>
        <p className="bl-body bl-secondary">Для заявок и заказов по промокоду: ключ и адрес для вашего сайта или CRM, тестовое событие, загрузка CSV из 1С. Раздел откроется вместе с отслеживанием результатов.</p>
      </section>
    </Shell>
  )
}

/* ───────── баланс ───────── */
export function Balance() {
  const b = useBalance(), co = useCompany(), member = useMember()
  const pay = $api.useMutation('post', '/cabinet/payments', act)
  const patchCo = $api.useMutation('patch', '/cabinet/company', act)
  const [pick, setPick] = useState(10000)
  const [method, setMethod] = useState<'sbp' | 'card' | 'invoice'>('sbp')
  const canPay = member?.role === 'owner' || member?.role === 'accountant'
  const top = () => pay.mutateAsync({ body: { amountKop: toKop(pick), method, idempotencyKey: newKey() } }).then(r => {
    if (r.confirmUrl) return location.assign(r.confirmUrl)
    toast(`Счёт ${r.invoice?.number} выставлен, он в документах`)
  })
  return (
    <Shell title={<h1 className="bl-display-l">баланс</h1>}>
      <div className="two">
        <div className="bl-stack" style={gap('24px')}>
          <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('16px') }}>
            <span className="bl-caption">можно потратить</span>
            <span className="bl-number-xl"><Num value={kop(b.availableKop)} suffix=" ₽" /></span>
            <span className="bl-caption">на счёте {rub(kop(b.mainKop))}{kop(b.bonusKop) > 0 && ` · бонусы ${rub(kop(b.bonusKop))}, списываются первыми`}</span>
            {canPay ? <>
              <div className="bl-row" style={{ marginTop: 8 }}>{[3000, 10000, 30000].map(a => <Chip key={a} on={pick === a} onClick={() => setPick(a)}>+{rub(a)}</Chip>)}</div>
              <div className="bl-row">{([['sbp', 'СБП'], ['card', 'карта'], ['invoice', 'счёт']] as const).map(([m, t]) => <Chip key={m} on={method === m} onClick={() => setMethod(m)}>{t}</Chip>)}</div>
              <div><button className="bl-btn bl-btn--primary bl-btn--l" disabled={pay.isPending || co.kycStatus !== 'verified'} onClick={top}>{method === 'invoice' ? `выставить счёт на ${rub(pick)}` : `пополнить на ${rub(pick)}`}</button></div>
              <Check checked={co.autoTopup} onChange={v => patchCo.mutate({ body: { autoTopup: v } })} label="автопополнение" sub="когда останется меньше 1 000 ₽, пополним на 5 000 ₽ по СБП" disabled={member?.role !== 'owner'} />
            </> : <p className="bl-caption">Пополняют владелец или бухгалтер компании.</p>}
          </section>
          {kop(b.payoutKop) > 0 && (
            <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('12px') }}>
              <span className="bl-caption">к выплате 1-го числа</span>
              <span className="bl-h1"><Num value={kop(b.payoutKop)} suffix=" ₽" /></span>
              <p className="bl-body bl-secondary">За купоны и подписки: клиент платит билайну, а мы перечисляем вам долю на расчётный счёт.</p>
            </section>
          )}
          {b.invoices.length > 0 && (
            <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('8px') }}>
              <h2 className="bl-h3">ждут оплаты</h2>
              {b.invoices.map(i => <div key={i.id} className="bl-cell"><span className="bl-cell__main"><span className="bl-cell__title">счёт {i.number}</span><span className="bl-cell__sub" style={{ display: 'block' }}>{rub(kop(i.amountKop))} · в назначении платежа укажите номер счёта</span></span></div>)}
            </section>
          )}
        </div>
        <section className="bl-section pad" style={{ maxWidth: 'none' }}>
          <h2 className="bl-h3" style={{ marginBottom: 16 }}>операции</h2>
          <div className="bl-table-wrap"><table className="bl-table"><tbody>
            {b.operations.map(o => { const v = kop(o.amountKop); return <tr key={o.id}><td className="bl-nums">{when(o.createdAt)}</td><td>{o.memo}</td><td className={v > 0 ? 'bl-success' : 'bl-nums'}>{v > 0 ? '+' : '−'}{rub(Math.abs(v))}</td></tr> })}
            {!b.operations.length && <tr><td className="bl-secondary">операций пока нет</td></tr>}
          </tbody></table></div>
        </section>
      </div>
    </Shell>
  )
}

/* ───────── документы ───────── */
const EDO = ['Диадок', 'СБИС', 'Калуга Астрал', '1С-ЭДО']
const DOC_STATUS: Record<string, [string, string]> = {
  draft: ['черновик', ''], issued: ['сформирован', ''], sent: ['отправлен в ЭДО', ''], delivered: ['доставлен', ''], signed: ['подписан', 'bl-tag--soft-green'], rejected: ['отказ в подписи', 'bl-tag--soft-violet'],
}
export function Docs() {
  const co = useCompany(), docs = useDocuments(), member = useMember()
  const edo = $api.useMutation('post', '/cabinet/company/edo', act)
  const invite = $api.useMutation('post', '/cabinet/company/invitations', act)
  const [op, setOp] = useState(EDO[0])
  const [mail, setMail] = useState('')
  const send = () => invite.mutateAsync({ body: { email: mail, role: 'accountant' } }).then(() => { toast(`Приглашение отправлено на ${mail}`); setMail('') })
  return (
    <Shell title={<h1 className="bl-display-l">документы</h1>}>
      <div className="two">
        <section className="bl-section pad" style={{ maxWidth: 'none' }}>
          <div className="bl-table-wrap"><table className="bl-table">
            <thead><tr><th>документ</th><th>дата</th><th>сумма</th><th>статус</th></tr></thead>
            <tbody>{docs.map(d => (
              <tr key={d.id}>
                <td><a href={`/api/cabinet/documents/${d.id}/file`} target="_blank" rel="noreferrer">{d.title}{d.number ? ` ${d.number}` : ''}</a></td>
                <td className="bl-nums">{day(d.createdAt)}</td>
                <td>{d.amountKop ? rub(kop(d.amountKop)) : '—'}</td>
                <td><span className={`bl-tag ${DOC_STATUS[d.status]?.[1] ?? ''}`}>{DOC_STATUS[d.status]?.[0] ?? d.status}</span></td>
              </tr>
            ))}</tbody>
          </table></div>
          {!docs.length && <p className="bl-caption" style={{ marginTop: 16 }}>Документов пока нет. Оферта появится, когда вы её примете, акт — первого числа после месяца с показами.</p>}
        </section>
        <aside className="bl-stack" style={gap('24px')}>
          <section className="bl-card" data-theme="invert" style={{ padding: 32, borderRadius: 'var(--radius-1000)', gap: 16 }}>
            {co.edoOperator ? <>
              <span className="bl-tag bl-tag--success" style={{ alignSelf: 'flex-start' }}>ЭДО подключён</span>
              <h2 className="bl-h3">акты будут приходить в {co.edoOperator}</h2>
              <p className="bl-body bl-secondary">Первого числа за прошлый месяц. Запуск рекламы от ЭДО не зависит.</p>
            </> : <>
              <h2 className="bl-h3">закрывающие документы</h2>
              <p className="bl-body bl-secondary">Подключите ЭДО, и акты будут приходить сами. Запуск рекламы от этого не зависит.</p>
              <div className="bl-row">{EDO.map(o => <Chip key={o} on={op === o} onClick={() => setOp(o)}>{o}</Chip>)}</div>
              <div><button className="bl-btn bl-btn--dark" disabled={edo.isPending} onClick={() => edo.mutateAsync({ body: { operator: op } }).then(() => toast(`Приглашение отправлено в ${op}, примите его там`))}>подключить {op}</button></div>
            </>}
          </section>
          {member?.role === 'owner' && <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('12px') }}>
            <h2 className="bl-h3">пригласить бухгалтера</h2>
            <p className="bl-caption">Бухгалтер увидит документы и баланс, сможет пополнять, но не сможет менять кампании.</p>
            <label className="bl-field"><span className="bl-field__label">почта</span><input className="bl-input" type="email" value={mail} onChange={e => setMail(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="buh@company.ru" /></label>
            <div><button className="bl-btn" onClick={send} disabled={invite.isPending || !mail}>отправить приглашение</button></div>
          </section>}
        </aside>
      </div>
    </Shell>
  )
}

/* ───────── компания ───────── */
export function Company() {
  const co = useCompany(), member = useMember(), me = useMe()
  const selfId = me.kind === 'partner' ? me.user.id : ''
  const owner = member?.role === 'owner'
  const give = $api.useMutation('post', '/cabinet/company/consents', act)
  const revoke = $api.useMutation('delete', '/cabinet/company/consents/{kind}', act)
  const add = $api.useMutation('post', '/cabinet/company/points', act)
  const point = $api.useMutation('patch', '/cabinet/company/points/{pointId}', act)
  const invite = $api.useMutation('post', '/cabinet/company/invitations', act)
  const remove = $api.useMutation('delete', '/cabinet/company/members/{userId}', act)
  const [addr, setAddr] = useState('')
  const [mail, setMail] = useState('')
  const [role, setRole] = useState<'staff' | 'accountant'>('staff')
  const profile = co.consents.some(c => c.kind === 'profile')
  return (
    <Shell title={<h1 className="bl-display-l">компания</h1>}>
      <div className="two two--even">
        <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('16px') }}>
          <div className="bl-row" style={{ justifyContent: 'space-between' }}><h2 className="bl-h3">{co.name}</h2>{co.kycStatus === 'verified' && <span className="bl-tag bl-tag--soft-green">проверена по ЕГРЮЛ</span>}</div>
          <dl className="kv">
            <dt>ИНН / КПП</dt><dd>{co.inn}{co.kpp && ` / ${co.kpp}`}</dd>
            {co.ogrn && <><dt>ОГРН</dt><dd>{co.ogrn}</dd></>}
            {co.address && <><dt>адрес</dt><dd>{co.address}</dd></>}
            <dt>счёт</dt><dd>{co.bank ? `${co.bank.bank}, ${co.bank.account}` : 'не указан'}</dd>
            {co.site && <><dt>сайт</dt><dd>{co.site}</dd></>}
            <dt>оферта</dt><dd>{co.offerAcceptedAt ? `версия ${co.offerVersion}, принята ${day(co.offerAcceptedAt)}` : 'не принята'}</dd>
          </dl>
          <h3 className="bl-h4" style={{ marginTop: 8 }}>точки · {co.points.filter(p => p.active).length} в рекламе</h3>
          {co.points.map(p => (
            <div key={p.id} className="bl-cell"><span className="bl-cell__icon"><MapPin size={18} /></span><span className="bl-cell__main"><span className="bl-cell__title">{p.addr}</span>{p.normalized && <span className="bl-cell__sub" style={{ display: 'block' }}>{p.normalized}</span>}</span>
              <button className={`bl-tag${p.active ? ' bl-tag--soft-green' : ''}`} onClick={() => point.mutate({ params: { path: { pointId: p.id } }, body: { active: !p.active } })}>{p.active ? 'в рекламе' : 'выключена'}</button></div>
          ))}
          {member?.role !== 'accountant' && <form className="bl-row" style={{ alignItems: 'flex-end' }} onSubmit={e => { e.preventDefault(); add.mutateAsync({ body: { addr } }).then(() => setAddr('')) }}>
            <label className="bl-field" style={{ flex: 1, minWidth: 200 }}><span className="bl-field__label">новая точка</span><input className="bl-input" value={addr} onChange={e => setAddr(e.target.value)} placeholder="ул. Таганская, 3" /></label>
            <button className="bl-btn" disabled={addr.trim().length < 5 || add.isPending}>добавить</button>
          </form>}
        </section>
        <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('16px') }}>
          <h2 className="bl-h3">люди и доступ</h2>
          {co.members.map(m => (
            <div key={m.id} className="bl-cell"><span className="bl-cell__main"><span className="bl-cell__title">{m.name || m.email}</span><span className="bl-cell__sub" style={{ display: 'block' }}>{[m.title, m.signer && 'подписант'].filter(Boolean).join(' · ')}</span></span>
              <span className="bl-tag">{ROLE[m.role]}</span>
              {owner && m.id !== selfId && m.role !== 'owner' && <button className="bl-icon-btn bl-icon-btn--s" aria-label={`Удалить ${m.name || m.email}`} onClick={() => remove.mutate({ params: { path: { userId: m.id } } })}><Trash2 size={16} /></button>}
            </div>
          ))}
          {co.invitations.map(i => <div key={i.id} className="bl-cell"><span className="bl-cell__main"><span className="bl-cell__title">{i.target}</span><span className="bl-cell__sub" style={{ display: 'block' }}>приглашение до {day(i.expiresAt)}</span></span><span className="bl-tag">{ROLE[i.role as 'staff']}</span></div>)}
          {owner && <form className="bl-stack" style={gap('8px')} onSubmit={e => { e.preventDefault(); invite.mutateAsync({ body: { email: mail, role } }).then(() => { toast(`Приглашение отправлено на ${mail}`); setMail('') }) }}>
            <div className="bl-row">{([['staff', 'сотрудник'], ['accountant', 'бухгалтер']] as const).map(([r, t]) => <Chip key={r} on={role === r} onClick={() => setRole(r)}>{t}</Chip>)}</div>
            <div className="bl-row" style={{ alignItems: 'flex-end' }}>
              <label className="bl-field" style={{ flex: 1, minWidth: 200 }}><span className="bl-field__label">почта</span><input className="bl-input" type="email" value={mail} onChange={e => setMail(e.target.value)} placeholder="name@company.ru" /></label>
              <button className="bl-btn" disabled={!mail || invite.isPending}>пригласить</button>
            </div>
          </form>}
          <h3 className="bl-h4" style={{ marginTop: 8 }}>согласия</h3>
          <Check checked onChange={() => {}} label="данные компании и подписанта" sub="нужно для оферты, отзывается вместе с закрытием кабинета" disabled />
          <Check checked={profile} onChange={v => v ? give.mutate({ body: { kind: 'profile' } }) : revoke.mutate({ params: { path: { kind: 'profile' } } })} label="профиль абонента билайна" sub="можно отозвать в любой момент" />
        </section>
      </div>
    </Shell>
  )
}

/* ───────── помощь ───────── */
export function Help() {
  const q = [
    ['чем отличаются типы офферов?', 'За переход платите за клик с баланса. За заявку и промокод — за подтверждённый результат, тоже с баланса. Купон и подписку оплачивает клиент, а мы выплачиваем вам долю раз в месяц.'],
    ['сколько нужно заплатить при запуске?', 'Недостающее до месячного бюджета: если на балансе уже есть деньги, доплачивать нужно только разницу. Купон и подписка денег не требуют.'],
    ['почему объявление не прошло проверку?', 'Подсвечиваем причину и предлагаем замену прямо в тексте. Спорные тексты смотрит модератор, обычно в течение суток.'],
    ['что такое erid?', 'Номер маркировки рекламы по закону. Присваиваем сами после проверки, без него реклама не показывается.'],
    ['как получить акты?', 'Подключите ЭДО в разделе «Документы» или пригласите бухгалтера. Акт и счёт-фактура формируются первого числа за прошлый месяц.'],
    ['кто может запускать рекламу?', 'Оферту и оплату подтверждает подписант — руководитель, вошедший через бизнес-ID. Сотрудник собирает кампанию и отправляет ему ссылку.'],
    ['как остановить рекламу?', 'В разделе «Кампании» нажмите «пауза». Деньги перестанут списываться сразу.'],
  ]
  return (
    <Shell title={<h1 className="bl-display-l">помощь</h1>} aside={<button className="bl-btn bl-btn--dark" onClick={() => toast('Чат поддержки подключим с Service desk билайна')}><MessageCircle size={18} />написать в чат</button>}>
      <section className="bl-section pad" style={{ maxWidth: 'none' }}><div className="bl-accordion">{q.map(([t, a], i) => <details key={t} open={i === 0}><summary>{t}</summary><div className="bl-accordion__body">{a}</div></details>)}</div></section>
    </Shell>
  )
}
