import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router'
import { motion } from 'motion/react'
import { AlertTriangle, BarChart3, Building2, Check as CheckIcon, CircleHelp, Copy, FileText, Info, Megaphone, MessageCircle, Pause, Play, Plug, Plus, TrendingUp, Upload, Wallet } from 'lucide-react'
import { n, rub } from '../data'
import { $api, act, client, queryClient, useBalance, useCampaign, useCampaigns, useCatalog, useCompany, useOfferType, useSession, type Campaign, type S } from '../api'
import { Bars } from '../charts'
import { Brand, Check, Chip, DemoNote, Modal, Num, Qr, Segmented, TypePicker, copy, toast, when } from '../ui'

const gap = (v: string) => ({ ['--bl-gap' as string]: v })
const NAV = [['campaigns', 'кампании', Megaphone], ['stats', 'статистика', BarChart3], ['connections', 'подключения', Plug], ['balance', 'баланс', Wallet], ['docs', 'документы', FileText], ['company', 'компания', Building2], ['help', 'помощь', CircleHelp]] as const

function Shell({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  const co = useCompany(), b = useBalance()
  return (
    <div className="bl-page">
      <div className="cab">
        <aside className="cab-nav">
          <div className="bl-row" style={{ justifyContent: 'space-between' }}><Brand to="/cab/campaigns" /><Link className="bl-btn bl-btn--s bl-show-mobile" to="/cab/balance">{rub(b.balance)}</Link></div>
          <div className="cab-nav__extra bl-stack" style={gap('2px')}><span className="bl-medium">{co.brand}</span><span className="bl-caption">{co.name}</span></div>
          <nav aria-label="Разделы кабинета">
            {NAV.map(([id, t, Icon]) => <NavLink key={id} to={`/cab/${id}`} className={({ isActive }) => (isActive ? 'is-active' : '')}><Icon size={20} />{t}</NavLink>)}
          </nav>
          <div className="cab-nav__extra bl-card" style={{ gap: 4, padding: 16 }}>
            <span className="bl-caption">баланс</span><span className="bl-h3"><Num value={b.balance} suffix=" ₽" /></span>
            {b.payout && <span className="bl-caption">к выплате {rub(b.payout.due)}</span>}
            <Link to="/cab/balance" className="bl-caption">пополнить</Link>
          </div>
        </aside>
        <main className="cab-main">
          {b.low && <div className="bl-notice"><AlertTriangle size={18} /><span>Баланса хватит меньше чем на 3 дня. <Link to="/cab/balance">Пополнить</Link> или включить автопополнение.</span></div>}
          <div className="page-title" style={{ margin: '16px 0 0' }}><div className="bl-stack" style={gap('8px')}>{title}</div>{aside}</div>
          {children}
        </main>
      </div>
    </div>
  )
}

const STATUS: Record<Campaign['status'], [string, string]> = {
  draft: ['черновик', ''], approval: ['ждёт руководителя', ''], invoice: ['ждём оплату', ''], moderation: ['на проверке', ''],
  rejected: ['нужна правка', 'bl-tag--soft-violet'], live: ['показывается', 'bl-tag--success'], paused: ['на паузе', ''],
}
const StatusTag = ({ c }: { c: Campaign }) => <span className={`bl-tag ${STATUS[c.status][1]}`}>{STATUS[c.status][0]}</span>

/* ───────── статистика ───────── */
function Live({ start, step, label, sub, paused }: { start: number; step: () => number; label: string; sub: ReactNode; paused: boolean }) {
  const [v, setV] = useState(start)
  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setV(x => x + step()), 2200)
    return () => clearInterval(t)
  }, [paused])
  return (
    <div className="bl-card bl-card--white"><div className="bl-stat">
      <span className={`bl-stat__label${paused ? '' : ' live'}`}>{label}</span>
      <motion.span key={v} className="bl-stat__value bl-nums" initial={{ opacity: 0.4 }} animate={{ opacity: 1 }}>{n(v)}</motion.span>
      <span className="bl-stat__label">{sub}</span>
    </div></div>
  )
}

function First48({ c, st }: { c: Campaign; st: S['Stats'] }) {
  const T = useOfferType(c.type), paused = c.status === 'paused'
  return (
    <>
      <div className="bl-notice bl-notice--info"><Info size={18} />{T.wait}</div>
      <section className="bl-grid" style={{ ['--bl-cols' as string]: 3 }}>
        <Live paused={paused} label="охват вокруг точек" start={st.reach} step={() => 3 + Math.round(Math.random() * 9)} sub={`из ${n(st.reachTotal)} подходящих`} />
        <Live paused={paused} label="клики" start={st.clicks} step={() => (Math.random() > 0.5 ? 1 : 0)} sub={`CTR ${st.ctr.toLocaleString('ru-RU')} %`} />
        <Live paused={paused} label={T.live} start={st.results} step={() => (Math.random() > 0.75 ? 1 : 0)} sub="в витрине «лучшее рядом»" />
      </section>
      <section className="bl-section pad" style={{ maxWidth: 'none' }}>
        <div className="bl-row" style={{ justifyContent: 'space-between' }}><h2 className="bl-h3">клики по часам</h2><span className="bl-caption">с запуска, 12 часов</span></div>
        <Bars label="Клики по часам с запуска" height={200} fmt={v => `${v} кликов`} data={st.hourly} />
      </section>
      {c.type === 'click' && <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('4px') }}>
        <h2 className="bl-h3" style={{ marginBottom: 8 }}>что будет дальше</h2>
        {[['через 1–2 дня', 'первые визиты: кто увидел рекламу и дошёл до точки'], ['через неделю', 'цена гостя и советы, как её снизить'], ['через 2 недели', 'повторные визиты: кто вернулся']].map(([t, d], i) => (
          <div key={t} className="bl-cell"><span className="bl-cell__icon">{i + 1}</span><span className="bl-cell__main"><span className="bl-cell__title">{t}</span><span className="bl-cell__sub" style={{ display: 'block' }}>{d}</span></span></div>
        ))}
      </section>}
    </>
  )
}

function TwoWeeks({ c, st }: { c: Campaign; st: S['Stats'] }) {
  const T = useOfferType(c.type), co = useCompany(), click = c.type === 'click'
  const tip = $api.useMutation('post', '/campaigns/{id}/tips/{tipId}', act)
  const [period, setPeriod] = useState<7 | 14>(14)
  const days = st.daily.slice(-period)
  const unit = click ? 'визиты' : T.unit
  return (
    <>
      <section className="bl-grid kpis">
        <div className="bl-card bl-card--white"><div className="bl-stat"><span className="bl-stat__label">показы</span><span className="bl-stat__value"><Num value={st.impressions} /></span><span className="bl-stat__label">охват {n(st.reach)}</span></div></div>
        <div className="bl-card bl-card--white"><div className="bl-stat"><span className="bl-stat__label">клики</span><span className="bl-stat__value"><Num value={st.clicks} /></span><span className="bl-stat__delta">+12 % к прошлой неделе</span></div></div>
        <div className="bl-card" data-theme="invert"><div className="bl-stat"><span className="bl-stat__label">{click ? 'пришли к вам' : T.unit}</span><span className="bl-stat__value"><Num value={st.results} /></span><span className="bl-stat__label">{click ? `из них ${n(st.returning)} пришли снова` : c.name}</span></div></div>
        {T.share
          ? <div className="bl-card bl-card--white"><div className="bl-stat"><span className="bl-stat__label">к выплате вам</span><span className="bl-stat__value"><Num value={st.payout} suffix=" ₽" /></span><span className="bl-stat__label">{T.per} {rub(st.per)}</span></div></div>
          : <div className="bl-card bl-card--white"><div className="bl-stat"><span className="bl-stat__label">потрачено</span><span className="bl-stat__value"><Num value={st.spent} suffix=" ₽" /></span><span className="bl-stat__label">{click ? `клик ${Math.round(st.cpc)} ₽ · гость ${Math.round(st.spent / Math.max(st.results, 1))} ₽` : `${T.per} ${rub(st.per)}`}</span></div></div>}
      </section>
      <div className="two">
        <section className="bl-section pad" style={{ maxWidth: 'none' }}>
          <div className="bl-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}><h2 className="bl-h3">{unit} по дням</h2><Segmented label="Период" value={period} options={[[7, '7 дней'], [14, '14 дней']]} onChange={setPeriod} /></div>
          <Bars label={`${unit} по дням`} height={200} fmt={v => `${v} · ${unit}`} data={days} />
          <h3 className="bl-h3" style={{ margin: '32px 0 16px' }}>{st.breakdownBy === 'signals' ? 'по сигналам' : 'по местам показа'}</h3>
          <div className="bl-table-wrap"><table className="bl-table">
            <thead><tr><th>{st.breakdownBy === 'signals' ? 'сигнал' : 'место'}</th><th>клики</th><th>CTR</th><th>{click ? 'пришли' : T.unit}</th><th>{click ? 'один гость' : T.per}</th></tr></thead>
            <tbody>{st.breakdown.map(r => <tr key={r.label}><td>{r.label}</td><td>{n(r.clicks)}</td><td>{r.ctr.toLocaleString('ru-RU')} %</td><td>{n(r.results)}</td><td>{rub(r.per)}</td></tr>)}</tbody>
          </table></div>
        </section>
        <aside className="bl-stack" style={gap('24px')}>
          <section className="bl-section pad" style={{ maxWidth: 'none' }}>
            <h2 className="bl-h3" style={{ marginBottom: 8 }}>что улучшить</h2>
            {st.tips.map((t, i) => (
              <button key={t.id} className="bl-cell tip" disabled={t.applied} onClick={() => tip.mutateAsync({ params: { path: { id: c.id, tipId: t.id } } }).then(() => toast(`Готово: ${t.doneTitle}`))}>
                <span className="bl-cell__icon">{t.applied ? <CheckIcon size={18} className="bl-success" /> : i === 0 ? <TrendingUp size={18} /> : <Plus size={18} />}</span>
                <span className="bl-cell__main"><span className="bl-cell__title">{t.applied ? t.doneTitle : t.title}</span><span className="bl-cell__sub" style={{ display: 'block' }}>{t.applied ? 'применено, результат через 2–3 дня' : t.detail}</span>
                  {!t.applied && <span className="bl-btn bl-btn--s" style={{ marginTop: 8 }}>применить</span>}</span>
              </button>
            ))}
          </section>
          <p className="bl-caption">{click ? 'Визиты считаем по обезличенным данным базовых станций.' : `Результат подтверждаете вы: ${T.via.label} — ${c.terms.via}.`} Данные абонентов не передаём, вы видите только итоги.</p>
        </aside>
      </div>
      {!co.edo && <div className="bl-card bl-card--white edo-strip"><span className="bl-body">Подключите ЭДО, чтобы получать закрывающие документы</span><span className="bl-row"><Link className="bl-btn bl-btn--s" to="/cab/docs">подключить ЭДО</Link><Link className="bl-btn bl-btn--s bl-btn--ghost" to="/cab/docs">пригласить бухгалтера</Link></span></div>}
    </>
  )
}

export function Stats() {
  const id = Number(useParams().id)
  if (!id) return <Shell title={<h1 className="bl-display-l">статистика</h1>}><Empty /></Shell>
  return <CampaignStats id={id} />
}

function CampaignStats({ id }: { id: number }) {
  const c = useCampaign(id), session = useSession(), T = useOfferType(c.type)
  const patchSession = $api.useMutation('patch', '/session', act)
  const ready = c.status === 'live' || c.status === 'paused'
  const { data: st } = $api.useQuery('get', '/campaigns/{id}/stats', { params: { path: { id } } }, { enabled: ready })
  return (
    <Shell
      title={<><span className="bl-row" style={{ gap: 8 }}><StatusTag c={c} /><span className="bl-tag bl-tag--soft-violet">{T.t}</span></span><h1 className="bl-display-l">{c.name}</h1></>}
      aside={ready && <div className="bl-stack" style={{ ...gap('6px'), alignItems: 'flex-end' }}><DemoNote>время с запуска</DemoNote><Segmented label="Время с запуска" value={session.clock} options={[['h48', 'первые 48 часов'], ['d14', 'через 2 недели']]} onChange={v => patchSession.mutate({ body: { clock: v } })} /></div>}>
      {!ready ? <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('16px') }}>
        <h2 className="bl-h2">статистика появится после запуска</h2>
        <div><Link className="bl-btn bl-btn--primary bl-btn--l" to={`/c/${id}/launch`}>статус запуска</Link></div>
      </section> : !st ? <div className="bl-skeleton" style={{ height: 240 }} /> : st.clock === 'h48' ? <First48 c={c} st={st} /> : <TwoWeeks c={c} st={st} />}
      {ready && c.type !== 'click' && <CampaignConversions c={c} />}
    </Shell>
  )
}

function Empty() {
  const nav = useNavigate()
  const create = $api.useMutation('post', '/campaigns', act)
  return (
    <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('16px') }}>
      <h2 className="bl-h2">здесь появятся клики и визиты</h2>
      <p className="bl-body bl-secondary">Соберите и оплатите первую кампанию. Первые цифры будут через час после запуска.</p>
      <div><button className="bl-btn bl-btn--primary bl-btn--l" onClick={() => create.mutateAsync({ body: { type: 'click' } }).then(c => nav(`/c/${c.id}/build`))}>собрать кампанию</button></div>
    </section>
  )
}

/* ───────── кампании ───────── */
// Куда вести из списка: черновик — в сборку, ожидание — к оплате или запуску, остальное — в статистику
const NEXT: Record<Campaign['status'], [string, string]> = {
  draft: ['build', 'продолжить'], approval: ['checkout', 'ссылка руководителю'], invoice: ['launch', 'статус'],
  moderation: ['launch', 'статус'], rejected: ['launch', 'исправить'], live: ['stats', ''], paused: ['stats', ''],
}
export function Campaigns() {
  const list = useCampaigns(), cat = useCatalog()
  const nav = useNavigate()
  const [pick, setPick] = useState(false)
  const create = $api.useMutation('post', '/campaigns', act)
  const patch = $api.useMutation('patch', '/campaigns/{id}', act)
  const link = (c: Campaign) => (NEXT[c.status][0] === 'stats' ? `/cab/stats/${c.id}` : `/c/${c.id}/${NEXT[c.status][0]}`)
  const pause = (c: Campaign) => patch.mutateAsync({ params: { path: { id: c.id } }, body: { paused: c.status !== 'paused' } })
    .then(() => toast(c.status === 'paused' ? 'Кампания снова показывается' : 'Кампания на паузе, деньги не списываются'))
  return (
    <Shell title={<h1 className="bl-display-l">кампании</h1>} aside={<button className="bl-btn bl-btn--primary bl-btn--l" onClick={() => setPick(true)}><Plus size={18} />новая кампания</button>}>
      <TypePicker open={pick} onClose={() => setPick(false)} onPick={type => create.mutateAsync({ body: { type } }).then(c => nav(`/c/${c.id}/build`))} />
      <section className="bl-section pad" style={{ maxWidth: 'none' }}>
        <div className="bl-table-wrap"><table className="bl-table">
          <thead><tr><th>кампания</th><th>тип</th><th>статус</th><th>бюджет</th><th>клики</th><th>результат</th><th /></tr></thead>
          <tbody>
            {list.map(c => {
              const T = cat.offerTypes.find(t => t.id === c.type)!, on = c.status === 'live' || c.status === 'paused'
              return (
                <tr key={c.id}>
                  <td><Link to={link(c)}>{c.name}</Link></td><td>{T.short}</td><td><StatusTag c={c} /></td>
                  <td>{T.share ? 'без бюджета' : `${rub(c.budget)} в мес.`}</td>
                  <td>{c.totals ? n(c.totals.clicks) : '—'}</td>
                  <td>{c.totals ? `${n(c.totals.results)} · ${c.type === 'click' ? 'визиты' : T.unit}` : '—'}</td>
                  <td>{on
                    ? <span className="bl-row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                        <button className="bl-btn bl-btn--s" onClick={() => pause(c)}>{c.status === 'paused' ? <><Play size={16} />возобновить</> : <><Pause size={16} />пауза</>}</button>
                        {c.status === 'live' && c.places.showcase && <Link className="bl-btn bl-btn--s" to={`/near?offer=c${c.id}`}>на витрине</Link>}
                      </span>
                    : <Link className="bl-btn bl-btn--s" to={link(c)}>{NEXT[c.status][1]}</Link>}</td>
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

/* ───────── конверсии и подключения ───────── */
const CONV_STATUS: Record<S['ConversionStatus'], [string, string]> = {
  pending: ['ждёт решения', ''], approved: ['засчитана', 'bl-tag--soft-green'], rejected: ['отклонена', 'bl-tag--soft-violet'], returned: ['возврат', ''],
}
const KIND: Record<S['Conversion']['kind'], string> = { lead: 'заявка', order: 'заказ', redeem: 'погашение купона', renewal: 'платёж подписки' }
const SOURCE: Record<S['Conversion']['source'], string> = { postback: 'сервер партнёра', csv: 'файл CSV', cabinet: 'кабинет', form: 'форма билайна', billing: 'счёт телефона' }

// Таблица конверсий: в статистике кампании — её конверсии, в «подключениях» — общая очередь спора
function Conversions({ rows, campaign }: { rows: S['Conversion'][]; campaign?: boolean }) {
  const decide = $api.useMutation('patch', '/conversions/{conversionId}', act)
  const set = (id: number, status: 'approved' | 'rejected') => decide.mutate({ params: { path: { conversionId: id } }, body: status === 'rejected' ? { status, note: 'оспорено в кабинете' } : { status } })
  return (
    <div className="bl-table-wrap"><table className="bl-table">
      <thead><tr><th>когда</th><th>{campaign ? 'кампания и событие' : 'событие'}</th><th>сумма</th><th>источник</th><th>статус</th><th /></tr></thead>
      <tbody>{rows.map(v => (
        <tr key={v.id}>
          <td className="bl-nums" style={{ whiteSpace: 'nowrap' }}>{when(v.createdAt)}</td>
          <td>{campaign ? v.campaignName : KIND[v.kind]}<span className="bl-caption" style={{ display: 'block' }}>{campaign ? `${KIND[v.kind]} · ` : ''}{v.orderId ? `№ ${v.orderId} · ` : ''}{v.clickId}</span></td>
          <td>{v.amount != null ? rub(v.amount) : '—'}</td>
          <td>{SOURCE[v.source]}{v.note && <span className="bl-caption" style={{ display: 'block' }}>{v.note}</span>}</td>
          <td><span className={`bl-tag ${CONV_STATUS[v.status][1]}`}>{CONV_STATUS[v.status][0]}</span>{v.status === 'pending' && v.disputeUntil && <span className="bl-caption" style={{ display: 'block' }}>спор до {when(v.disputeUntil)}</span>}</td>
          <td>{v.status === 'pending' && <span className="bl-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <button className="bl-btn bl-btn--s" onClick={() => set(v.id, 'approved')}>засчитать</button>
            <button className="bl-btn bl-btn--s bl-btn--ghost" onClick={() => set(v.id, 'rejected')}>оспорить</button>
          </span>}</td>
        </tr>
      ))}</tbody>
    </table></div>
  )
}

function CampaignConversions({ c }: { c: Campaign }) {
  const T = useOfferType(c.type)
  const { data: rows } = $api.useSuspenseQuery('get', '/conversions', { params: { query: { campaignId: c.id } } })
  const pending = rows.filter(v => v.status === 'pending').length
  return (
    <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('16px') }}>
      <div className="bl-row" style={{ justifyContent: 'space-between' }}>
        <h2 className="bl-h3">{T.unit} · {rows.filter(v => v.status === 'approved').length} засчитано{pending ? `, ${pending} ждут решения` : ''}</h2>
        <span className="bl-caption">{T.via.label}: {c.terms.via} · {c.partnerEventAt ? `от вас последнее событие ${when(c.partnerEventAt)}` : 'от вас событий ещё не было'}</span>
      </div>
      {rows.length ? <Conversions rows={rows} /> : <p className="bl-body bl-secondary">Пока пусто. Как только придёт первый результат, он появится здесь.</p>}
      <p className="bl-caption">Не оспоренные к сроку засчитываются сами. <Link to="/cab/connections">Ключ для вашего сервера и загрузка файла — в «Подключениях»</Link>.</p>
    </section>
  )
}

export function Connections() {
  const { data: t } = $api.useSuspenseQuery('get', '/tracking')
  const { data: convs } = $api.useSuspenseQuery('get', '/conversions')
  const test = $api.useMutation('post', '/tracking/test', act)
  const [report, setReport] = useState<{ created: number; updated: number; errors: { line: number; message: string }[] } | null>(null)
  // CSV уходит текстом, как его прислал бы скрипт партнёра
  const upload = async (file: File) => {
    const { data, error } = await client.POST('/conversions/import', { body: await file.text(), bodySerializer: b => b as string, headers: { 'content-type': 'text/csv' } })
    if (error) return toast('Файл не принят')
    setReport(data); queryClient.invalidateQueries()
    toast(`Загружено: новых ${data.created}, обновлено ${data.updated}${data.errors.length ? `, ошибок ${data.errors.length}` : ''}`)
  }
  const queue = convs.filter(v => v.status === 'pending')
  return (
    <Shell title={<h1 className="bl-display-l">подключения</h1>} aside={<span className={`bl-tag${t.connected ? ' bl-tag--success' : ''}`}>{t.connected ? 'ваш сервер подключён' : 'ждём первое событие'}</span>}>
      <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('16px') }}>
        <div className="bl-row" style={{ justifyContent: 'space-between' }}><h2 className="bl-h3">ждут решения{queue.length ? ` · ${queue.length}` : ''}</h2><span className="bl-caption">заявки и заказы всех кампаний</span></div>
        {queue.length ? <Conversions rows={queue} campaign /> : <p className="bl-body bl-secondary">Всё разобрано: решений не ждёт ни одна заявка или заказ.</p>}
        <p className="bl-caption">Не оспоренные к сроку засчитываются сами: заявка — через {t.disputeDays.lead} дней, заказ по промокоду — через {t.disputeDays.promo}, когда пройдёт срок возврата. Все конверсии кампании — в её статистике.</p>
      </section>
      <div className="two two--even" style={{ marginTop: 24 }}>
        <section className="bl-card" data-theme="invert" style={{ padding: 32, borderRadius: 'var(--radius-1000)', gap: 12 }}>
          <h2 className="bl-h3">ответ вашего сервера</h2>
          <p className="bl-body bl-secondary">Один адрес на все кампании: кампанию мы узнаём по click_id из ссылки объявления. Когда заявка или заказ появились, подтвердились или вернулись, ваш сайт или CRM вызывает этот адрес. Повтор с тем же order_id меняет статус, дубля не будет.</p>
          <span className="bl-row track-code"><code>{t.postbackUrl}</code><button className="bl-icon-btn bl-icon-btn--s" aria-label="Скопировать адрес" onClick={() => copy(t.postbackUrl, 'Адрес')}><Copy size={16} /></button></span>
          <p className="bl-caption">status: pending, approved, rejected, returned · amount — сумма заказа в рублях · ключ не публикуйте на сайте, его вызывает только сервер</p>
          <p className="bl-caption">{t.events ? `событий от вас: ${t.events}, последнее ${when(t.lastEventAt!)}` : 'событий от вас пока не было'}</p>
          <div><button className="bl-btn bl-btn--dark" disabled={test.isPending} onClick={() => test.mutateAsync({}).then(() => toast('Тестовое событие пришло, смотрите в очереди'))}>отправить тестовое событие</button></div>
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

/* ───────── баланс и выплаты ───────── */
export function Balance() {
  const b = useBalance()
  const top = $api.useMutation('post', '/balance/topups', act)
  const patchCo = $api.useMutation('patch', '/company', act)
  const [busy, setBusy] = useState<number | null>(null)
  const [pick, setPick] = useState(10000)
  const days = b.daysLeft
  const word = (d: number) => d % 10 === 1 && d % 100 !== 11 ? 'день' : d % 10 >= 2 && d % 10 <= 4 && (d % 100 < 10 || d % 100 >= 20) ? 'дня' : 'дней'
  // пауза — имитация оплаты по QR
  const startTop = () => { setBusy(pick); setTimeout(() => top.mutateAsync({ body: { amount: pick } }).then(() => toast(`Баланс пополнен на ${rub(pick)}`)).finally(() => setBusy(null)), 2000) }
  return (
    <Shell title={<h1 className="bl-display-l">баланс</h1>}>
      <div className="two">
        <div className="bl-stack" style={gap('24px')}>
          <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('16px') }}>
            <span className="bl-caption">на счёте</span>
            <span className="bl-number-xl"><Num value={b.balance} suffix=" ₽" /></span>
            <span className="bl-caption">{days === null ? 'активных кампаний с бюджетом нет' : `хватит примерно на ${days} ${word(days)} при текущих бюджетах`}</span>
            <div className="bl-row" style={{ marginTop: 8 }}>{[3000, 10000, 30000].map(a => <Chip key={a} on={pick === a} onClick={() => setPick(a)}>+{rub(a)}</Chip>)}</div>
            <div><button className="bl-btn bl-btn--primary bl-btn--l" onClick={startTop}>пополнить на {rub(pick)} через СБП</button></div>
            <Check checked={b.autoTopup} onChange={v => patchCo.mutate({ body: { autoTopup: v } })} label="автопополнение" sub="когда останется меньше 1 000 ₽, пополним на 5 000 ₽ по СБП" />
          </section>
          {b.payout && (
            <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('12px') }}>
              <span className="bl-caption">к выплате {b.payout.date}</span>
              <span className="bl-h1"><Num value={b.payout.due} suffix=" ₽" /></span>
              <p className="bl-body bl-secondary">За купоны и подписки баланс не нужен: клиент платит билайну, а мы перечисляем вам долю на расчётный счёт.</p>
              <p className="bl-caption">{b.payout.unit}: {n(b.payout.count)} · начислено {rub(b.payout.gross)} · комиссия билайна −{rub(b.payout.fee)}</p>
            </section>
          )}
        </div>
        <section className="bl-section pad" style={{ maxWidth: 'none' }}>
          <h2 className="bl-h3" style={{ marginBottom: 16 }}>операции</h2>
          <div className="bl-table-wrap"><table className="bl-table"><tbody>
            {b.operations.map((o, i) => <tr key={i}><td>{o.date}</td><td>{o.title}</td><td className={o.amount > 0 ? 'bl-success' : 'bl-nums'}>{o.amount > 0 ? '+' : '−'}{rub(Math.abs(o.amount))}</td></tr>)}
            {!b.operations.length && <tr><td className="bl-secondary">операций пока нет</td></tr>}
          </tbody></table></div>
        </section>
      </div>
      <Modal open={busy !== null} label="Пополнение"><h2 className="bl-h2">пополнение на {rub(busy ?? 0)}</h2><Qr /><p className="bl-caption">СБП для бизнеса · отсканируйте в приложении банка</p><div className="wait-bar" /></Modal>
    </Shell>
  )
}

/* ───────── документы ───────── */
const EDO = ['Диадок', 'СБИС', 'Калуга Астрал', '1С-ЭДО']
export function Docs() {
  const co = useCompany()
  const { data: docs } = $api.useSuspenseQuery('get', '/documents')
  const patchCo = $api.useMutation('patch', '/company', act)
  const invite = $api.useMutation('post', '/company/members', act)
  const [op, setOp] = useState(EDO[0])
  const [mail, setMail] = useState('')
  const invited = co.members.filter(m => m.role === 'accountant').at(-1)
  const send = () => invite.mutateAsync({ body: { email: mail } }).then(() => { toast(`Приглашение отправлено на ${mail}`); setMail('') })
  return (
    <Shell title={<h1 className="bl-display-l">документы</h1>}>
      <div className="two">
        <section className="bl-section pad" style={{ maxWidth: 'none' }}>
          <div className="bl-table-wrap"><table className="bl-table">
            <thead><tr><th>документ</th><th>дата</th><th>статус</th></tr></thead>
            <tbody>{docs.map(d => (
              <tr key={d.id}><td>{d.id === 'offer' ? <Link to="/offer">{d.title}</Link> : d.title}</td><td>{d.date}</td><td><span className={`bl-tag${d.status === 'принята' ? ' bl-tag--soft-green' : ''}`}>{d.status}</span></td></tr>
            ))}</tbody>
          </table></div>
        </section>
        <aside className="bl-stack" style={gap('24px')}>
          <section className="bl-card" data-theme="invert" style={{ padding: 32, borderRadius: 'var(--radius-1000)', gap: 16 }}>
            {co.edo ? <>
              <span className="bl-tag bl-tag--success" style={{ alignSelf: 'flex-start' }}>ЭДО подключён</span>
              <h2 className="bl-h3">акты будут приходить в {co.edo}</h2>
              <p className="bl-body bl-secondary">Первый — 1 декабря. Запуск рекламы от ЭДО не зависит.</p>
            </> : <>
              <h2 className="bl-h3">закрывающие документы</h2>
              <p className="bl-body bl-secondary">Подключите ЭДО, и акты будут приходить сами. Запуск рекламы от этого не зависит.</p>
              <div className="bl-row">{EDO.map(o => <Chip key={o} on={op === o} onClick={() => setOp(o)}>{o}</Chip>)}</div>
              <div><button className="bl-btn bl-btn--dark" onClick={() => patchCo.mutateAsync({ body: { edo: op } }).then(() => toast(`Приглашение отправлено в ${op}, примите его там`))}>подключить {op}</button></div>
            </>}
          </section>
          <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('12px') }}>
            <h2 className="bl-h3">пригласить бухгалтера</h2>
            <p className="bl-caption">Бухгалтер увидит документы и баланс, но не сможет менять кампании.</p>
            {invited && <p className="bl-caption bl-success">приглашение отправлено на {invited.email}</p>}
            <label className={`bl-field${invite.isError ? ' is-error' : ''}`}><span className="bl-field__label">почта</span><input className="bl-input" type="email" value={mail} onChange={e => { setMail(e.target.value); invite.reset() }} onKeyDown={e => e.key === 'Enter' && send()} placeholder="buh@mycoffee.ru" />{invite.isError && <span className="bl-field__caption">проверьте адрес почты</span>}</label>
            <div><button className="bl-btn" onClick={send} disabled={invite.isPending}>отправить приглашение</button></div>
          </section>
        </aside>
      </div>
    </Shell>
  )
}

/* ───────── компания ───────── */
export function Company() {
  const co = useCompany(), session = useSession(), cat = useCatalog()
  const patchCo = $api.useMutation('patch', '/company', act)
  const prov = cat.providers.find(p => p.id === session.provider)?.name ?? 'открытых данных'
  return (
    <Shell title={<h1 className="bl-display-l">компания</h1>}>
      <div className="two two--even">
        <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('16px') }}>
          <div className="bl-row" style={{ justifyContent: 'space-between' }}><h2 className="bl-h3">{co.name}</h2><span className="bl-tag bl-tag--soft-green">из {prov}</span></div>
          <dl className="kv"><dt>ИНН / КПП</dt><dd>{co.inn} / {co.kpp}</dd><dt>ОГРН</dt><dd>{co.ogrn}</dd><dt>счёт</dt><dd>{co.bank}, {co.acc}</dd><dt>сайт</dt><dd>{co.site}</dd><dt>сегмент</dt><dd>{cat.segments.find(x => x.id === co.segment)!.name}</dd></dl>
          <h3 className="bl-h4" style={{ marginTop: 8 }}>точки · {co.points.filter(p => p.active).length} активны</h3>
          {co.points.map(p => <div key={p.id} className="bl-cell"><span className="bl-cell__main"><span className="bl-cell__title">{p.addr}</span></span><span className={`bl-tag${p.active ? ' bl-tag--soft-green' : ''}`}>{p.active ? 'в рекламе' : 'выключена'}</span></div>)}
        </section>
        <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('16px') }}>
          <h2 className="bl-h3">люди и доступ</h2>
          {co.members.map(m => (
            <div key={m.id} className="bl-cell"><span className="bl-cell__main"><span className="bl-cell__title">{m.name}</span><span className="bl-cell__sub" style={{ display: 'block' }}>{m.title}</span></span><span className="bl-tag">{{ owner: 'владелец', staff: 'сотрудник', accountant: 'приглашён' }[m.role]}</span></div>
          ))}
          <h3 className="bl-h4" style={{ marginTop: 8 }}>согласия</h3>
          <Check checked={co.consents.company} onChange={() => {}} label="данные компании" sub="нужно для оферты, отозвать можно только вместе с закрытием кабинета" disabled />
          <Check checked={co.consents.signer} onChange={() => {}} label="данные подписанта" disabled />
          <Check checked={co.consents.profile} onChange={v => patchCo.mutate({ body: { consents: { ...co.consents, profile: v } } })} label="профиль абонента билайна" sub="можно отозвать в любой момент" />
        </section>
      </div>
    </Shell>
  )
}

/* ───────── помощь ───────── */
export function Help() {
  const q = [
    ['как узнать, что клиент купил или оставил заявку?', 'В статистике кампании. Купоны, подписки и заявки из формы в приложении билайна видны сами. Для заказов на сайте подключите ответ вашего сервера или загружайте файл CSV раз в неделю в разделе «Подключения»: у каждого перехода есть click_id.'],
    ['чем отличаются типы офферов?', 'За переход платите за клик с баланса. За заявку и промокод — за подтверждённый результат, тоже с баланса. Купон и подписку оплачивает клиент, а мы выплачиваем вам долю раз в месяц. Тип выбирается при создании кампании.'],
    ['когда появятся визиты?', 'Через 1–2 дня после запуска: человеку нужно дойти до точки. До этого видны охват, клики и сохранения купона.'],
    ['как считается визит?', 'Человек кликнул по объявлению и в течение 7 дней побывал в радиусе 100 м от вашей точки. Считаем по обезличенным данным базовых станций.'],
    ['почему объявление не прошло проверку?', 'Подсвечиваем причину и предлагаем замену прямо в тексте. Если не согласны, отправьте на ручную проверку.'],
    ['как получить акты?', 'Подключите ЭДО в разделе «Документы» или пригласите бухгалтера.'],
    ['как остановить рекламу?', 'В разделе «Кампании» нажмите «пауза». Деньги перестанут списываться сразу.'],
  ]
  return (
    <Shell title={<h1 className="bl-display-l">помощь</h1>} aside={<button className="bl-btn bl-btn--dark" onClick={() => toast('Чат откроется здесь. Отвечаем в среднем за 5 минут')}><MessageCircle size={18} />написать в чат</button>}>
      <section className="bl-section pad" style={{ maxWidth: 'none' }}><div className="bl-accordion">{q.map(([t, a], i) => <details key={t} open={i === 0}><summary>{t}</summary><div className="bl-accordion__body">{a}</div></details>)}</div></section>
    </Shell>
  )
}
