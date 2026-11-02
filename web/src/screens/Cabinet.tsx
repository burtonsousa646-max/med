import { useMemo, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router'
import { BarChart3, Building2, CircleHelp, Copy, FileText, LogOut, MapPin, Megaphone, MessageCircle, Pause, Play, Plug, Plus, Trash2, Upload, Wallet } from 'lucide-react'
import { $api, act, client, kop, newKey, queryClient, toKop, useBalance, useCampaign, useCampaigns, useCatalog, useCompany, useDocuments, useMe, useMember, useOfferType, type Campaign, type S } from '../api'
import { Brand, Check, Chip, Num, Segmented, StatusTag, TypePicker, copy, day, gap, n, rub, toast, when } from '../ui'
import { Bars } from '../charts'

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

const CONV_STATUS: Record<string, [string, string]> = {
  pending: ['ждёт решения', ''], approved: ['засчитан', 'bl-tag--soft-green'], rejected: ['отклонён', 'bl-tag--soft-violet'], returned: ['возврат', ''],
}
const KIND: Record<string, string> = { lead: 'заявка', order: 'заказ', redeem: 'купон', renewal: 'подписка' }
const SOURCE: Record<string, string> = { postback: 'ваш сервер', csv: 'файл CSV', cabinet: 'кабинет', form: 'форма в приложении', billing: 'счёт телефона', pos: 'касса' }
const hourLabel = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

// Результаты: в статистике кампании — её, в «подключениях» — общая очередь «ждут решения»
function Conversions({ rows, withCampaign }: { rows: S['Conversion'][]; withCampaign?: boolean }) {
  const decide = $api.useMutation('patch', '/cabinet/conversions/{id}', act)
  const set = (id: number, status: 'approved' | 'rejected') => decide.mutate({ params: { path: { id } }, body: status === 'rejected' ? { status, note: 'оспорено в кабинете' } : { status } })
  return (
    <div className="bl-table-wrap"><table className="bl-table">
      <thead><tr><th>когда</th><th>{withCampaign ? 'кампания и событие' : 'событие'}</th><th>сумма</th><th>источник</th><th>статус</th><th /></tr></thead>
      <tbody>{rows.map(v => (
        <tr key={v.id}>
          <td className="bl-nums" style={{ whiteSpace: 'nowrap' }}>{when(v.createdAt)}</td>
          <td>{withCampaign ? v.campaignName : KIND[v.kind]}<span className="bl-caption" style={{ display: 'block' }}>{withCampaign ? `${KIND[v.kind]} · ` : ''}{v.orderId ? `№ ${v.orderId}` : ''}</span></td>
          <td>{v.amountKop ? rub(kop(v.amountKop)) : '—'}</td>
          <td>{SOURCE[v.source]}{v.note && <span className="bl-caption" style={{ display: 'block' }}>{v.note}</span>}</td>
          <td><span className={`bl-tag ${CONV_STATUS[v.status][1]}`}>{CONV_STATUS[v.status][0]}</span>{v.status === 'pending' && v.disputeUntil && <span className="bl-caption" style={{ display: 'block' }}>спор до {when(v.disputeUntil)}</span>}</td>
          <td>{v.status === 'pending' && v.source !== 'billing' && <span className="bl-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <button className="bl-btn bl-btn--s" onClick={() => set(v.id, 'approved')}>засчитать</button>
            <button className="bl-btn bl-btn--s bl-btn--ghost" onClick={() => set(v.id, 'rejected')}>оспорить</button>
          </span>}</td>
        </tr>
      ))}</tbody>
    </table></div>
  )
}

function CampaignStats({ id }: { id: number }) {
  const c = useCampaign(id), T = useOfferType(c.type)
  const patch = $api.useMutation('patch', '/cabinet/campaigns/{id}', act)
  const [days, setDays] = useState<7 | 14 | 30>(14)
  const ready = c.status === 'live' || c.status === 'paused' || c.status === 'finished'
  // начало периода фиксируем при выборе: иначе каждый рендер — новый ключ запроса и бесконечный перезапрос
  const from = useMemo(() => new Date(Date.now() - days * 864e5).toISOString(), [days])
  const st = $api.useQuery('get', '/cabinet/campaigns/{id}/stats', { params: { path: { id }, query: { from } } }, { enabled: ready, refetchInterval: 60_000 }).data
  const conv = $api.useQuery('get', '/cabinet/conversions', { params: { query: { campaignId: id } } }, { enabled: ready && c.type !== 'click' }).data ?? []
  const t = st?.totals, share = !!T.share
  return (
    <Shell
      title={<><span className="bl-row" style={{ gap: 8 }}><StatusTag s={c.status} /><span className="bl-tag bl-tag--soft-violet">{T.t}</span></span><h1 className="bl-display-l">{c.name}</h1></>}
      aside={ready && <div className="bl-row"><Segmented label="Период" value={days} options={[[7, '7 дней'], [14, '14 дней'], [30, '30 дней']]} onChange={setDays} />
        {c.status !== 'finished' && <button className="bl-btn" onClick={() => patch.mutate({ params: { path: { id } }, body: { paused: c.status !== 'paused' } })}>{c.status === 'paused' ? <><Play size={16} />возобновить</> : <><Pause size={16} />пауза</>}</button>}</div>}>
      {!ready ? <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('16px') }}>
        <h2 className="bl-h2">статистика появится после запуска</h2>
        <div><Link className="bl-btn bl-btn--primary bl-btn--l" to={`/c/${id}/launch`}>статус запуска</Link></div>
      </section> : !t ? <div className="bl-skeleton" style={{ height: 240 }} /> : <>
        <section className="bl-grid kpis">
          <div className="bl-card bl-card--white"><div className="bl-stat"><span className="bl-stat__label">показы</span><span className="bl-stat__value"><Num value={t.impressions} /></span><span className="bl-stat__label">охват {n(t.reach)} · erid {c.liveCreative?.erid}</span></div></div>
          <div className="bl-card bl-card--white"><div className="bl-stat"><span className="bl-stat__label">клики</span><span className="bl-stat__value"><Num value={t.clicks} /></span><span className="bl-stat__label">CTR {t.ctr.toLocaleString('ru-RU')} %{t.clicks > t.billableClicks ? ` · бесплатных ${n(t.clicks - t.billableClicks)}` : ''}</span></div></div>
          <div className="bl-card" data-theme="invert"><div className="bl-stat"><span className="bl-stat__label">{c.type === 'click' ? 'оплачено кликов' : T.unit}</span><span className="bl-stat__value"><Num value={c.type === 'click' ? t.billableClicks : t.results.approved} /></span><span className="bl-stat__label">{c.type === 'click' ? 'повторы, слишком быстрые и боты — бесплатно' : `${t.results.pending} ждут решения`}</span></div></div>
          <div className="bl-card bl-card--white"><div className="bl-stat"><span className="bl-stat__label">{share ? 'начислено вам' : 'потрачено'}</span><span className="bl-stat__value"><Num value={kop(share ? t.payoutKop : t.spendKop)} suffix=" ₽" /></span><span className="bl-stat__label">{share ? 'выплата 1-го числа' : c.type === 'click' && t.billableClicks ? `клик в среднем ${rub(kop(t.spendKop) / t.billableClicks)}` : `бюджет ${rub(kop(c.budgetMonthKop))} в месяц`}</span></div></div>
        </section>
        <div className="two">
          <section className="bl-section pad" style={{ maxWidth: 'none' }}>
            <div className="bl-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}><h2 className="bl-h3">клики по часам</h2><span className="bl-caption">последние 48 часов</span></div>
            {st.hourly.length ? <Bars label="Клики по часам" height={180} fmt={v => `${v} кликов`} data={st.hourly.map(h => ({ label: hourLabel(h.hour), value: h.clicks }))} /> : <p className="bl-body bl-secondary">Показов пока не было. Кампания в аукционе: как только поверхности билайна запросят рекламу, здесь появятся цифры.</p>}
            {st.daily.length > 1 && <>
              <h3 className="bl-h3" style={{ margin: '32px 0 8px' }}>показы по дням</h3>
              <Bars label="Показы по дням" height={160} fmt={v => `${n(v)} показов`} data={st.daily.map(d => ({ label: dayLabel(d.day), value: d.impressions }))} />
            </>}
          </section>
          <section className="bl-section pad" style={{ maxWidth: 'none' }}>
            <h2 className="bl-h3" style={{ marginBottom: 16 }}>по местам показа</h2>
            <div className="bl-table-wrap"><table className="bl-table">
              <thead><tr><th>место</th><th>показы</th><th>клики</th><th>CTR</th>{!share && <th>траты</th>}</tr></thead>
              <tbody>{st.placements.map(p => <tr key={p.placement}><td>{p.name}</td><td>{n(p.impressions)}</td><td>{n(p.clicks)}</td><td>{p.ctr.toLocaleString('ru-RU')} %</td>{!share && <td>{rub(kop(p.spendKop))}</td>}</tr>)}</tbody>
            </table></div>
            {!st.placements.length && <p className="bl-caption" style={{ marginTop: 12 }}>появится после первых показов</p>}
          </section>
        </div>
        {c.type !== 'click' && <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('16px') }}>
          <div className="bl-row" style={{ justifyContent: 'space-between' }}><h2 className="bl-h3">{T.unit} · {t.results.approved} засчитано{t.results.pending ? `, ${t.results.pending} ждут решения` : ''}</h2><Link className="bl-caption" to="/cab/connections">ваш сервер и загрузка файла</Link></div>
          {conv.length ? <Conversions rows={conv} /> : <p className="bl-body bl-secondary">Пока пусто. Как только придёт первый результат, он появится здесь.</p>}
          <p className="bl-caption">Не оспоренные к сроку засчитываются сами. Купоны и подписки билайн видит сам по оплате со счёта телефона.</p>
        </section>}
      </>}
    </Shell>
  )
}

export function Connections() {
  const member = useMember()
  const { data: t } = $api.useSuspenseQuery('get', '/cabinet/tracking')
  const { data: queue } = $api.useSuspenseQuery('get', '/cabinet/conversions', { params: { query: { status: 'pending' } } })
  const add = $api.useMutation('post', '/cabinet/tracking/keys', act)
  const revoke = $api.useMutation('delete', '/cabinet/tracking/keys/{id}', act)
  const [fresh, setFresh] = useState<string | null>(null)
  const [report, setReport] = useState<{ created: number; updated: number; errors: { line: number; message: string }[] } | null>(null)
  // CSV уходит текстом, как его прислал бы скрипт партнёра
  const upload = async (file: File) => {
    const { data, error } = await client.POST('/cabinet/conversions/import', { body: await file.text(), bodySerializer: b => b as string, headers: { 'content-type': 'text/csv' } })
    if (error) return toast((error as { message?: string }).message ?? 'Файл не принят')
    setReport(data); queryClient.invalidateQueries()
    toast(`Загружено: новых ${data.created}, обновлено ${data.updated}${data.errors.length ? `, ошибок ${data.errors.length}` : ''}`)
  }
  const owner = member?.role === 'owner'
  return (
    <Shell title={<h1 className="bl-display-l">подключения</h1>} aside={<span className={`bl-tag${t.events ? ' bl-tag--success' : ''}`}>{t.events ? `от вас ${t.events} результатов` : 'ждём первый результат'}</span>}>
      <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('16px') }}>
        <div className="bl-row" style={{ justifyContent: 'space-between' }}><h2 className="bl-h3">ждут решения{queue.length ? ` · ${queue.length}` : ''}</h2><span className="bl-caption">заявки и заказы всех кампаний</span></div>
        {queue.length ? <Conversions rows={queue} withCampaign /> : <p className="bl-body bl-secondary">Всё разобрано: решений не ждёт ни одна заявка или заказ.</p>}
        <p className="bl-caption">Не оспоренные к сроку засчитываются сами: заявка — через {t.disputeDays.lead} дней, заказ по промокоду — через {t.disputeDays.promo}, когда пройдёт срок возврата.</p>
      </section>
      {fresh && <div className="bl-notice bl-notice--success" style={{ marginTop: 24 }}><span>Новый ключ — скопируйте сейчас, больше мы его не покажем: <code>{fresh}</code></span><button className="bl-btn bl-btn--s" onClick={() => copy(fresh, 'Ключ')}>скопировать</button></div>}
      <div className="two two--even" style={{ marginTop: 24 }}>
        <section className="bl-card" data-theme="invert" style={{ padding: 32, borderRadius: 'var(--radius-1000)', gap: 12 }}>
          <h2 className="bl-h3">ответ вашего сервера</h2>
          <p className="bl-body bl-secondary">Один адрес на все кампании: кампанию узнаём по click_id из ссылки объявления. Когда заявка или заказ появились, подтвердились или вернулись, ваш сайт или CRM вызывает этот адрес. Повтор с тем же order_id меняет статус, дубля не будет.</p>
          <span className="bl-row track-code"><code>{t.postbackUrl}</code><button className="bl-icon-btn bl-icon-btn--s" aria-label="Скопировать адрес" onClick={() => copy(t.postbackUrl, 'Адрес')}><Copy size={16} /></button></span>
          <p className="bl-caption">status: pending, approved, rejected, returned · amount — сумма заказа в рублях · ключ не публикуйте на сайте, адрес вызывает только сервер</p>
          {t.keys.map(k => <div key={k.id} className="bl-row" style={{ justifyContent: 'space-between' }}><span className="bl-caption">ключ {k.hint} · {k.lastUsedAt ? `последний вызов ${when(k.lastUsedAt)}` : 'ещё не использовался'}</span>{owner && <button className="bl-btn bl-btn--s bl-btn--ghost" onClick={() => revoke.mutate({ params: { path: { id: k.id } } })}>отозвать</button>}</div>)}
          {owner ? <div><button className="bl-btn bl-btn--dark" disabled={add.isPending} onClick={() => add.mutateAsync({}).then(r => setFresh(r.key))}>{t.keys.length ? 'выпустить ещё ключ' : 'выпустить ключ'}</button></div>
            : <p className="bl-caption">Ключ выпускает владелец компании.</p>}
        </section>
        <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('12px') }}>
          <h2 className="bl-h3">загрузить файлом</h2>
          <p className="bl-body bl-secondary">Если сервер подключать некому: выгрузите заказы из CRM или 1С раз в неделю. В одном файле — все кампании.</p>
          <p className="bl-caption">Столбцы: click_id; order_id; status; amount. Первая строка может быть заголовком.</p>
          <label className="bl-btn" style={{ alignSelf: 'flex-start' }}><Upload size={18} />выбрать файл CSV<input type="file" accept=".csv,text/csv" hidden onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} /></label>
          {report && <p className="bl-caption">новых {report.created}, обновлено {report.updated}{report.errors.map(x => <span key={x.line} className="bl-error" style={{ display: 'block' }}>строка {x.line}: {x.message}</span>)}</p>}
        </section>
      </div>
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
            <div key={m.id} className="bl-cell"><span className="bl-cell__main"><span className="bl-cell__title">{m.name || m.email || m.phone}</span><span className="bl-cell__sub" style={{ display: 'block' }}>{[m.title, m.signer && 'подписант'].filter(Boolean).join(' · ')}</span></span>
              <span className="bl-tag">{ROLE[m.role]}</span>
              {owner && m.id !== selfId && m.role !== 'owner' && <button className="bl-icon-btn bl-icon-btn--s" aria-label={`Удалить ${m.name || m.email || m.phone}`} onClick={() => remove.mutate({ params: { path: { userId: m.id } } })}><Trash2 size={16} /></button>}
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
