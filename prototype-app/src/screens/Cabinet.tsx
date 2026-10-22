import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { AlertTriangle, BarChart3, Building2, Check as CheckIcon, CircleHelp, FileText, Info, Megaphone, MessageCircle, Pause, Play, Plus, TrendingUp, Wallet } from 'lucide-react'
import { CO, PAY_NAMES, PROVIDERS, SEGMENTS, n, rub } from '../data'
import { BONUS, activePoints, balance, campName, forecast, modeOf, payAmount, update, useStore } from '../store'
import { Bars } from '../charts'
import { Brand, Check, Chip, DemoNote, Modal, Num, Qr, Segmented, toast } from '../ui'

const gap = (v: string) => ({ ['--bl-gap' as string]: v })
const NAV = [['campaigns', 'кампании', Megaphone], ['stats', 'статистика', BarChart3], ['balance', 'баланс', Wallet], ['docs', 'документы', FileText], ['company', 'компания', Building2], ['help', 'помощь', CircleHelp]] as const

function Shell({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  const s = useStore()
  const bal = balance(s)
  const low = s.paid && !s.paused && bal < (s.budget / 30) * 3
  return (
    <div className="bl-page">
      <div className="cab">
        <aside className="cab-nav">
          <div className="bl-row" style={{ justifyContent: 'space-between' }}><Brand to="/cab/campaigns" /><Link className="bl-btn bl-btn--s bl-show-mobile" to="/cab/balance">{rub(bal)}</Link></div>
          <div className="cab-nav__extra bl-stack" style={gap('2px')}><span className="bl-medium">{CO.brand}</span><span className="bl-caption">{CO.name}</span></div>
          <nav aria-label="Разделы кабинета">
            {NAV.map(([id, t, Icon]) => <NavLink key={id} to={`/cab/${id}`} className={({ isActive }) => (isActive ? 'is-active' : '')}><Icon size={20} />{t}</NavLink>)}
          </nav>
          <div className="cab-nav__extra bl-card" style={{ gap: 4, padding: 16 }}>
            <span className="bl-caption">баланс</span><span className="bl-h3"><Num value={bal} suffix=" ₽" /></span>
            <Link to="/cab/balance" className="bl-caption">пополнить</Link>
          </div>
        </aside>
        <main className="cab-main">
          {low && <div className="bl-notice"><AlertTriangle size={18} /><span>Баланса хватит меньше чем на 3 дня. <Link to="/cab/balance">Пополнить</Link> или включить автопополнение.</span></div>}
          <div className="page-title" style={{ margin: '16px 0 0' }}><div className="bl-stack" style={gap('8px')}>{title}</div>{aside}</div>
          {children}
        </main>
      </div>
    </div>
  )
}

function StatusTag() {
  const s = useStore()
  if (!s.paid) return <span className="bl-tag">черновик</span>
  if (s.pay === 'invoice' && !s.invoicePaid) return <span className="bl-tag">ждём оплату</span>
  if (s.paused) return <span className="bl-tag">на паузе</span>
  return <span className="bl-tag bl-tag--success">показывается</span>
}

/* ───────── статистика ───────── */
function Live({ start, step, label, sub }: { start: number; step: () => number; label: string; sub: ReactNode }) {
  const [v, setV] = useState(start)
  const s = useStore()
  useEffect(() => {
    if (s.paused) return
    const t = setInterval(() => setV(x => x + step()), 2200)
    return () => clearInterval(t)
  }, [s.paused])
  return (
    <div className="bl-card bl-card--white"><div className="bl-stat">
      <span className={`bl-stat__label${s.paused ? '' : ' live'}`}>{label}</span>
      <motion.span key={v} className="bl-stat__value bl-nums" initial={{ opacity: 0.4 }} animate={{ opacity: 1 }}>{n(v)}</motion.span>
      <span className="bl-stat__label">{sub}</span>
    </div></div>
  )
}

function First48() {
  const s = useStore()
  const f = forecast(s)
  const hours = [2, 4, 3, 7, 9, 6, 5, 8, 11, 9, 14, 12]
  return (
    <>
      <div className="bl-notice bl-notice--info"><Info size={18} />Гости ещё идут до вас. Визиты в точку появятся завтра к 18:00, пока смотрите, как люди реагируют на объявление.</div>
      <section className="bl-grid" style={{ ['--bl-cols' as string]: 3 }}>
        <Live label="охват вокруг точек" start={4120} step={() => 3 + Math.round(Math.random() * 9)} sub={`из ${n(f.reach)} подходящих`} />
        <Live label="клики" start={42} step={() => (Math.random() > 0.5 ? 1 : 0)} sub="CTR 1,0 %" />
        <Live label="сохранили купон" start={17} step={() => (Math.random() > 0.75 ? 1 : 0)} sub="в Витрине выгод" />
      </section>
      <section className="bl-section pad" style={{ maxWidth: 'none' }}>
        <div className="bl-row" style={{ justifyContent: 'space-between' }}><h2 className="bl-h3">клики по часам</h2><span className="bl-caption">с запуска, 12 часов</span></div>
        <Bars label="Клики по часам с запуска" height={200} fmt={v => `${v} кликов`} data={hours.map((v, i) => ({ label: `${String(8 + i).padStart(2, '0')}:00`, value: v }))} />
      </section>
      <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('4px') }}>
        <h2 className="bl-h3" style={{ marginBottom: 8 }}>что будет дальше</h2>
        {[['через 1–2 дня', 'первые визиты: кто увидел рекламу и дошёл до точки'], ['через неделю', 'цена гостя и советы, как её снизить'], ['через 2 недели', 'повторные визиты: кто вернулся']].map(([t, d], i) => (
          <div key={t} className="bl-cell"><span className="bl-cell__icon">{i + 1}</span><span className="bl-cell__main"><span className="bl-cell__title">{t}</span><span className="bl-cell__sub" style={{ display: 'block' }}>{d}</span></span></div>
        ))}
      </section>
    </>
  )
}

function TwoWeeks() {
  const s = useStore()
  const f = forecast(s)
  const k = s.budget / 10000
  const spent = Math.min(s.budget * 0.64, payAmount(s) + BONUS)
  const clicks = Math.round(spent / f.cpc), visits = Math.round(clicks * f.conv), again = Math.round(visits * 0.22)
  const days = (s.period === 7 ? [50, 65, 75, 60, 80, 90, 100] : [8, 20, 30, 45, 40, 60, 55, 50, 65, 75, 60, 80, 90, 100]).map(v => Math.round(v * visits / 900))
  const rows = modeOf(s) === 'manual'
    ? [['живут рядом, 1 км', 0.56, 2.4, 37], ['работают рядом, 1 км', 0.3, 3.8, 27], ['ходят в кофейни рядом', 0.14, 6.1, 41]]
    : [['Витрина выгод', 0.56, 3.1, 31], ['«Платёж прошёл»', 0.28, 1.6, 38], ['Главная приложения', 0.16, 0.5, 44]]
  const tips = [
    { id: 'morning' as const, icon: TrendingUp, t: 'поднять ставку утром', d: `ещё ≈ ${Math.round(60 * k)} гостей за клик 14 ₽`, done: 'ставка утром 14 ₽' },
    { id: 'rest' as const, icon: Plus, t: 'добавить экран остатков', d: 'у кофеен рядом гость дешевле на 20 %', done: 'экран остатков подключён' },
  ]
  return (
    <>
      <section className="bl-grid kpis">
        <div className="bl-card bl-card--white"><div className="bl-stat"><span className="bl-stat__label">показы</span><span className="bl-stat__value"><Num value={clicks * 56} /></span><span className="bl-stat__label">охват {n(f.reach * 0.8)}</span></div></div>
        <div className="bl-card bl-card--white"><div className="bl-stat"><span className="bl-stat__label">клики</span><span className="bl-stat__value"><Num value={clicks} /></span><span className="bl-stat__delta">+12 % к прошлой неделе</span></div></div>
        <div className="bl-card" data-theme="invert"><div className="bl-stat"><span className="bl-stat__label">пришли к вам</span><span className="bl-stat__value"><Num value={visits} /></span><span className="bl-stat__label">из них {n(again)} пришли снова</span></div></div>
        <div className="bl-card bl-card--white"><div className="bl-stat"><span className="bl-stat__label">потрачено</span><span className="bl-stat__value"><Num value={spent} suffix=" ₽" /></span><span className="bl-stat__label">клик {Math.round(f.cpc)} ₽ · гость {Math.round(spent / Math.max(visits, 1))} ₽</span></div></div>
      </section>
      <div className="two">
        <section className="bl-section pad" style={{ maxWidth: 'none' }}>
          <div className="bl-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}><h2 className="bl-h3">визиты по дням</h2><Segmented label="Период" value={s.period} options={[[7, '7 дней'], [14, '14 дней']]} onChange={v => update(x => { x.period = v })} /></div>
          <Bars label="Визиты по дням" height={200} fmt={v => `${v} визитов`} data={days.map((v, i) => ({ label: `${i + 1 + (s.period === 7 ? 7 : 0)} ноя`, value: v }))} />
          <h3 className="bl-h3" style={{ margin: '32px 0 16px' }}>{modeOf(s) === 'manual' ? 'по сигналам' : 'по местам показа'}</h3>
          <div className="bl-table-wrap"><table className="bl-table">
            <thead><tr><th>{modeOf(s) === 'manual' ? 'сигнал' : 'место'}</th><th>клики</th><th>CTR</th><th>пришли</th><th>один гость</th></tr></thead>
            <tbody>{rows.map(([t, share, ctr, guest]) => <tr key={t as string}><td>{t}</td><td>{n(clicks * (share as number))}</td><td>{(ctr as number).toLocaleString('ru-RU')} %</td><td>{n(visits * (share as number))}</td><td>{guest} ₽</td></tr>)}</tbody>
          </table></div>
        </section>
        <aside className="bl-stack" style={gap('24px')}>
          <section className="bl-section pad" style={{ maxWidth: 'none' }}>
            <h2 className="bl-h3" style={{ marginBottom: 8 }}>что улучшить</h2>
            {tips.map(t => (
              <button key={t.id} className="bl-cell tip" disabled={s.tips[t.id]} onClick={() => { update(x => { x.tips[t.id] = true }); toast(`Готово: ${t.done}`) }}>
                <span className="bl-cell__icon">{s.tips[t.id] ? <CheckIcon size={18} className="bl-success" /> : <t.icon size={18} />}</span>
                <span className="bl-cell__main"><span className="bl-cell__title">{s.tips[t.id] ? t.done : t.t}</span><span className="bl-cell__sub" style={{ display: 'block' }}>{s.tips[t.id] ? 'применено, результат через 2–3 дня' : t.d}</span>
                  {!s.tips[t.id] && <span className="bl-btn bl-btn--s" style={{ marginTop: 8 }}>применить</span>}</span>
              </button>
            ))}
          </section>
          <p className="bl-caption">Визиты считаем по обезличенным данным базовых станций. Данные абонентов не передаём, вы видите только итоги.</p>
        </aside>
      </div>
      {!s.edo && <div className="bl-card bl-card--white edo-strip"><span className="bl-body">Подключите ЭДО, чтобы получать закрывающие документы</span><span className="bl-row"><Link className="bl-btn bl-btn--s" to="/cab/docs">подключить ЭДО</Link><Link className="bl-btn bl-btn--s bl-btn--ghost" to="/cab/docs">пригласить бухгалтера</Link></span></div>}
    </>
  )
}

export function Stats() {
  const s = useStore()
  if (!s.paid) return <Shell title={<h1 className="bl-display-l">статистика</h1>}><Empty /></Shell>
  return (
    <Shell
      title={<><StatusTag /><h1 className="bl-display-l">{campName(s)}</h1></>}
      aside={<div className="bl-stack" style={{ ...gap('6px'), alignItems: 'flex-end' }}><DemoNote>время с запуска</DemoNote><Segmented label="Время с запуска" value={s.statsView} options={[['h48', 'первые 48 часов'], ['d14', 'через 2 недели']]} onChange={v => update(x => { x.statsView = v })} /></div>}>
      {s.statsView === 'h48' ? <First48 /> : <TwoWeeks />}
    </Shell>
  )
}

function Empty() {
  return (
    <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('16px') }}>
      <h2 className="bl-h2">здесь появятся клики и визиты</h2>
      <p className="bl-body bl-secondary">Соберите и оплатите первую кампанию. Первые цифры будут через час после запуска.</p>
      <div><Link className="bl-btn bl-btn--primary bl-btn--l" to="/build">собрать кампанию</Link></div>
    </section>
  )
}

/* ───────── кампании ───────── */
export function Campaigns() {
  const s = useStore()
  const nav = useNavigate()
  const f = forecast(s)
  const fresh = () => { update(x => { x.tab = null; x.adText = null; x.launch = 0 }); nav('/build') }
  return (
    <Shell title={<h1 className="bl-display-l">кампании</h1>} aside={<button className="bl-btn bl-btn--primary bl-btn--l" onClick={fresh}><Plus size={18} />новая кампания</button>}>
      <section className="bl-section pad" style={{ maxWidth: 'none' }}>
        <div className="bl-table-wrap"><table className="bl-table">
          <thead><tr><th>кампания</th><th>статус</th><th>бюджет</th><th>клики</th><th>пришли</th><th /></tr></thead>
          <tbody>
            {s.paid && (
              <tr>
                <td><Link to="/cab/stats">{campName(s)}</Link></td><td><StatusTag /></td><td>{rub(s.budget)} в мес.</td>
                <td>{s.statsView === 'd14' ? n(f.clicks * 0.64) : '42'}</td><td>{s.statsView === 'd14' ? n(f.visits * 0.64) : '—'}</td>
                <td><button className="bl-btn bl-btn--s" onClick={() => { update(x => { x.paused = !x.paused }); toast(s.paused ? 'Кампания снова показывается' : 'Кампания на паузе, деньги не списываются') }}>{s.paused ? <><Play size={16} />возобновить</> : <><Pause size={16} />пауза</>}</button></td>
              </tr>
            )}
            <tr><td>утренний кофе на вынос</td><td><span className="bl-tag">черновик</span></td><td>5 000 ₽ в мес.</td><td>—</td><td>—</td><td><Link className="bl-btn bl-btn--s" to="/build">продолжить</Link></td></tr>
          </tbody>
        </table></div>
        {!s.paid && <p className="bl-caption" style={{ marginTop: 16 }}>Оплаченных кампаний пока нет. Пройдите сценарий до оплаты, и кампания появится здесь.</p>}
      </section>
    </Shell>
  )
}

/* ───────── баланс ───────── */
export function Balance() {
  const s = useStore()
  const [top, setTop] = useState<number | null>(null)
  const [pick, setPick] = useState(10000)
  const bal = balance(s)
  const days = Math.max(0, Math.round(bal / (s.budget / 30)))
  const startTop = () => { setTop(pick); setTimeout(() => { update(x => { x.topups += pick }); setTop(null); toast(`Баланс пополнен на ${rub(pick)}`) }, 2000) }
  return (
    <Shell title={<h1 className="bl-display-l">баланс</h1>}>
      <div className="two">
        <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('16px') }}>
          <span className="bl-caption">на счёте</span>
          <span className="bl-number-xl"><Num value={bal} suffix=" ₽" /></span>
          <span className="bl-caption">хватит примерно на {days} {days % 10 === 1 && days % 100 !== 11 ? 'день' : days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 10 || days % 100 >= 20) ? 'дня' : 'дней'} при текущем бюджете</span>
          <div className="bl-row" style={{ marginTop: 8 }}>{[3000, 10000, 30000].map(a => <Chip key={a} on={pick === a} onClick={() => setPick(a)}>+{rub(a)}</Chip>)}</div>
          <div><button className="bl-btn bl-btn--primary bl-btn--l" onClick={startTop}>пополнить на {rub(pick)} через СБП</button></div>
          <Check path="autoTopup" label="автопополнение" sub="когда останется меньше 1 000 ₽, пополним на 5 000 ₽ по СБП" />
        </section>
        <section className="bl-section pad" style={{ maxWidth: 'none' }}>
          <h2 className="bl-h3" style={{ marginBottom: 16 }}>операции</h2>
          <div className="bl-table-wrap"><table className="bl-table"><tbody>
            {s.topups > 0 && <tr><td>сегодня</td><td>пополнение, СБП</td><td className="bl-success">+{rub(s.topups)}</td></tr>}
            {s.paid && (s.pay !== 'invoice' || s.invoicePaid) ? <>
              <tr><td>сегодня</td><td>списано за клики</td><td className="bl-nums">−{rub(payAmount(s) + BONUS + s.topups - bal)}</td></tr>
              <tr><td>сегодня</td><td>бонус за первую кампанию</td><td className="bl-success">+{rub(BONUS)}</td></tr>
              <tr><td>сегодня</td><td>пополнение, {PAY_NAMES[s.pay]}</td><td className="bl-success">+{rub(payAmount(s))}</td></tr>
            </> : !s.topups && <tr><td className="bl-secondary">операций пока нет</td></tr>}
          </tbody></table></div>
        </section>
      </div>
      <Modal open={top !== null} label="Пополнение"><h2 className="bl-h2">пополнение на {rub(top ?? 0)}</h2><Qr /><p className="bl-caption">СБП для бизнеса · отсканируйте в приложении банка</p><div className="wait-bar" /></Modal>
    </Shell>
  )
}

/* ───────── документы ───────── */
export function Docs() {
  const s = useStore()
  const [mail, setMail] = useState('')
  const [err, setErr] = useState(false)
  const invite = () => {
    if (!/.+@.+\..+/.test(mail)) return setErr(true)
    update(x => { x.invited = mail }); setErr(false); setMail(''); toast(`Приглашение отправлено на ${mail}`)
  }
  const edoTag = s.edo ? 'придёт в ЭДО' : 'нужен ЭДО'
  return (
    <Shell title={<h1 className="bl-display-l">документы</h1>}>
      <div className="two">
        <section className="bl-section pad" style={{ maxWidth: 'none' }}>
          <div className="bl-table-wrap"><table className="bl-table">
            <thead><tr><th>документ</th><th>дата</th><th>статус</th></tr></thead>
            <tbody>
              <tr><td><Link to="/offer">оферта</Link></td><td>сегодня</td><td>{s.paid ? <span className="bl-tag bl-tag--soft-green">принята {s.role === 'boss' ? 'в кабинете' : 'через бизнес-ID'}</span> : <span className="bl-tag">не принята</span>}</td></tr>
              {s.pay === 'invoice' && s.paid && <tr><td>счёт-оферта № 1042</td><td>сегодня</td><td><span className="bl-tag">{s.invoicePaid ? 'оплачен' : 'ждём оплату'}</span></td></tr>}
              <tr><td>акт за ноябрь</td><td>1 декабря</td><td><span className="bl-tag">{edoTag}</span></td></tr>
              <tr><td>счёт-фактура за ноябрь</td><td>1 декабря</td><td><span className="bl-tag">{edoTag}</span></td></tr>
            </tbody>
          </table></div>
        </section>
        <aside className="bl-stack" style={gap('24px')}>
          <section className="bl-card" data-theme="invert" style={{ padding: 32, borderRadius: 'var(--radius-1000)', gap: 16 }}>
            {s.edo ? <>
              <span className="bl-tag bl-tag--success" style={{ alignSelf: 'flex-start' }}>ЭДО подключён</span>
              <h2 className="bl-h3">акты будут приходить в {s.edoOp}</h2>
              <p className="bl-body bl-secondary">Первый — 1 декабря. Запуск рекламы от ЭДО не зависит.</p>
            </> : <>
              <h2 className="bl-h3">закрывающие документы</h2>
              <p className="bl-body bl-secondary">Подключите ЭДО, и акты будут приходить сами. Запуск рекламы от этого не зависит.</p>
              <div className="bl-row">{['Диадок', 'СБИС', 'Калуга Астрал', '1С-ЭДО'].map(o => <Chip key={o} on={s.edoOp === o} onClick={() => update(x => { x.edoOp = o })}>{o}</Chip>)}</div>
              <div><button className="bl-btn bl-btn--dark" onClick={() => { update(x => { x.edo = true }); toast(`Приглашение отправлено в ${s.edoOp}, примите его там`) }}>подключить {s.edoOp}</button></div>
            </>}
          </section>
          <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('12px') }}>
            <h2 className="bl-h3">пригласить бухгалтера</h2>
            <p className="bl-caption">Бухгалтер увидит документы и баланс, но не сможет менять кампании.</p>
            {s.invited && <p className="bl-caption bl-success">приглашение отправлено на {s.invited}</p>}
            <label className={`bl-field${err ? ' is-error' : ''}`}><span className="bl-field__label">почта</span><input className="bl-input" type="email" value={mail} onChange={e => { setMail(e.target.value); setErr(false) }} onKeyDown={e => e.key === 'Enter' && invite()} placeholder="buh@mycoffee.ru" />{err && <span className="bl-field__caption">проверьте адрес почты</span>}</label>
            <div><button className="bl-btn" onClick={invite}>отправить приглашение</button></div>
          </section>
        </aside>
      </div>
    </Shell>
  )
}

/* ───────── компания ───────── */
export function Company() {
  const s = useStore()
  const prov = s.provider && s.provider !== 'inn' ? PROVIDERS[s.provider].name : 'открытых данных'
  return (
    <Shell title={<h1 className="bl-display-l">компания</h1>}>
      <div className="two two--even">
        <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('16px') }}>
          <div className="bl-row" style={{ justifyContent: 'space-between' }}><h2 className="bl-h3">{CO.name}</h2><span className="bl-tag bl-tag--soft-green">из {prov}</span></div>
          <dl className="kv"><dt>ИНН / КПП</dt><dd>{CO.inn} / {CO.kpp}</dd><dt>ОГРН</dt><dd>{CO.ogrn}</dd><dt>счёт</dt><dd>{CO.bank}, {CO.acc}</dd><dt>сайт</dt><dd>{CO.site}</dd><dt>сегмент</dt><dd>{SEGMENTS[s.segment].name}</dd></dl>
          <h3 className="bl-h4" style={{ marginTop: 8 }}>точки · {activePoints(s).length} активны</h3>
          {s.points.map(p => <div key={p.id} className="bl-cell"><span className="bl-cell__main"><span className="bl-cell__title">{p.addr}</span></span><span className={`bl-tag${s.pointsOn[p.id] !== false ? ' bl-tag--soft-green' : ''}`}>{s.pointsOn[p.id] !== false ? 'в рекламе' : 'выключена'}</span></div>)}
        </section>
        <section className="bl-section pad bl-stack" style={{ maxWidth: 'none', ...gap('16px') }}>
          <h2 className="bl-h3">люди и доступ</h2>
          <div className="bl-cell"><span className="bl-cell__main"><span className="bl-cell__title">{CO.signer}</span><span className="bl-cell__sub" style={{ display: 'block' }}>{CO.role} · подписант, принимает оферту</span></span><span className="bl-tag">владелец</span></div>
          <div className="bl-cell"><span className="bl-cell__main"><span className="bl-cell__title">{CO.employee}</span><span className="bl-cell__sub" style={{ display: 'block' }}>маркетолог · кампании и статистика</span></span><span className="bl-tag">сотрудник</span></div>
          {s.invited && <div className="bl-cell"><span className="bl-cell__main"><span className="bl-cell__title">{s.invited}</span><span className="bl-cell__sub" style={{ display: 'block' }}>бухгалтер · документы и баланс</span></span><span className="bl-tag">приглашён</span></div>}
          <h3 className="bl-h4" style={{ marginTop: 8 }}>согласия</h3>
          <Check path="consents.company" label="данные компании" sub="нужно для оферты, отозвать можно только вместе с закрытием кабинета" disabled />
          <Check path="consents.signer" label="данные подписанта" disabled />
          <Check path="consents.profile" label="профиль абонента билайна" sub="можно отозвать в любой момент" />
        </section>
      </div>
    </Shell>
  )
}

/* ───────── помощь ───────── */
export function Help() {
  const q = [
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
