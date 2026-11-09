import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { AlertTriangle, Check as CheckIcon, Clock, FileText, Info, Loader2, MapPin, Plus, Send, Smartphone } from 'lucide-react'
import { n, rub } from '../data'
import { $api, act, useCampaign, useCatalog, useCompany, useLater, useOfferType, useSession } from '../api'
import { ReachMap } from '../mock'
import { Trend } from '../charts'
import { Brand, Check, Chip, Done, FlowHead, Modal, Num, Qr, Segmented, Switch, TypeTag, toast } from '../ui'
import { IdButtons, useStart } from './Entry'
import logoUrl from '../../../design-system/assets/beeline-logo.svg'

const gap = (v: string) => ({ ['--bl-gap' as string]: v })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
export const useId = () => Number(useParams().id)

/* 2.2 Согласия */
export function Consent() {
  const co = useCompany(), session = useSession(), cat = useCatalog()
  const start = useStart()
  const patch = $api.useMutation('patch', '/company', act)
  const add = $api.useMutation('post', '/company/points', act)
  const p = cat.providers.find(x => x.id === session.provider && x.id !== 'inn') ?? cat.providers[1]
  const [adding, setAdding] = useState(false)
  const [addr, setAddr] = useState('')
  const ok = co.consents.company && co.consents.signer
  const consent = (k: keyof typeof co.consents) => (v: boolean) => patch.mutate({ body: { consents: { ...co.consents, [k]: v } } })
  const addPoint = () => {
    if (addr.trim().length < 5) return
    add.mutateAsync({ body: { addr: addr.trim() } }).then(() => { toast(`Точка «${addr.trim()}» добавлена`); setAddr(''); setAdding(false) })
  }
  return (
    <div className="bl-page wrap">
      <header className="flow-head"><Brand /></header>
      <div className="page-title">
        <div className="bl-stack" style={gap('8px')}>
          <span className="bl-tag bl-tag--soft-green" style={{ alignSelf: 'flex-start' }}><Done size={14} /> компания найдена в {p.name}</span>
          <h1 className="bl-h1">проверьте, что это вы</h1>
        </div>
      </div>
      <div className="two">
        <section className="bl-section pad bl-stack" style={gap('24px')}>
          <div><h2 className="bl-h3">{co.name}</h2><p className="bl-caption" style={{ marginTop: 4 }}>{co.brand} · {co.site}</p></div>
          <dl className="kv"><dt>ИНН / КПП</dt><dd>{co.inn} / {co.kpp}</dd><dt>ОГРН</dt><dd>{co.ogrn}</dd><dt>подписант</dt><dd>{co.signer}, {co.signerRole}</dd><dt>расчётный счёт</dt><dd>{co.bank}</dd></dl>
          <div>
            <div className="bl-field__label" style={{ marginBottom: 8 }}>точки продаж · из Яндекс Карт и DaData</div>
            {co.points.map(pt => (
              <div key={pt.id} className="bl-cell"><span className="bl-cell__icon"><MapPin size={18} /></span><span className="bl-cell__main"><span className="bl-cell__title">{pt.addr}</span><span className="bl-cell__sub" style={{ display: 'block' }}>Москва</span></span></div>
            ))}
          </div>
          {adding ? (
            <div className="bl-row" style={{ alignItems: 'flex-end' }}>
              <label className="bl-field" style={{ flex: 1, minWidth: 220 }}><span className="bl-field__label">адрес новой точки</span><input className="bl-input" value={addr} onChange={e => setAddr(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPoint()} placeholder="ул. Таганская, 3" autoFocus /></label>
              <button className="bl-btn bl-btn--dark bl-btn--l" onClick={addPoint} disabled={addr.trim().length < 5 || add.isPending}>добавить</button>
              <button className="bl-btn bl-btn--ghost" onClick={() => setAdding(false)}>отмена</button>
            </div>
          ) : <button className="bl-btn bl-btn--s" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}><Plus size={16} />добавить точку</button>}
        </section>
        <section className="bl-section pad bl-stack sticky" style={gap('20px')}>
          <h2 className="bl-h3">что возьмём и зачем</h2>
          <Check checked={co.consents.company} onChange={consent('company')} label="данные компании" sub="реквизиты и адреса: заполнить оферту и посчитать охват по точкам" />
          <Check checked={co.consents.signer} onChange={consent('signer')} label="данные подписанта" sub="ФИО и должность: чтобы оферту принял тот, кто вправе" />
          <Check checked={co.consents.profile} onChange={consent('profile')} label="профиль абонента билайна" sub="по желанию: подскажем аудиторию по вашим интересам и районам" />
          <p className="bl-micro">Согласие можно отозвать в разделе «Компания». Данные не передаём третьим лицам.</p>
          {!ok && <p className="bl-caption bl-error" role="alert">Без данных компании и подписанта не сможем посчитать охват и оформить оферту.</p>}
          <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={!ok} onClick={start}>показать охват</button>
        </section>
      </div>
    </div>
  )
}

/* 2.3 Охват и прогноз */
export function Reach() {
  const id = useId(), c = useCampaign(id), co = useCompany(), session = useSession(), cat = useCatalog(), T = useOfferType(c.type)
  const nav = useNavigate()
  const patch = $api.useMutation('patch', '/campaigns/{id}', act)
  const patchCo = $api.useMutation('patch', '/company', act)
  const point = $api.useMutation('patch', '/company/points/{pointId}', act)
  const [budget, setBudget] = useLater(c.budget, v => patch.mutate({ params: { path: { id } }, body: { budget: v } }))
  const [segEdit, setSegEdit] = useState(false)
  const f = c.forecast, click = c.type === 'click'
  const on = co.points.filter(p => p.active).length
  const seg = cat.segments.find(x => x.id === co.segment)!
  const toggle = (pointId: number, active: boolean) => point.mutate({ params: { path: { pointId } }, body: { active } })
  const weeks = [0.2, 0.45, 0.72, 1].map((k, i) => ({ label: `${i + 1} неделя`, value: Math.round((click ? f.clicks : f.results) * k) }))
  const stats: [string, number, string?][] = click
    ? [['клики', f.clicks], ['придут к вам', f.visits], ['цена клика', f.cpc, ' ₽'], ['один гость', f.guest, ' ₽']]
    : [[T.unit, f.results], [T.share ? 'выплатим вам' : 'потратите', f.money, ' ₽'], [T.per, f.per, ' ₽'], ['охват', f.reach]]
  return (
    <div className="bl-page wrap">
      <FlowHead step={0} id={id} />
      {session.provider === 'inn' && <div className="bl-notice bl-notice--info" style={{ marginTop: 16 }}><Info size={18} />Вы без входа: охват по открытым данным. Точнее посчитаем после входа по бизнес-ID, он же понадобится для оплаты.</div>}
      <div className="page-title">
        <div className="bl-stack" style={gap('12px')}>
          <div className="bl-row"><TypeTag c={c} /><span className="bl-tag">{seg.name}</span><button className="bl-btn bl-btn--ghost bl-caption" onClick={() => setSegEdit(!segEdit)}>{segEdit ? 'готово' : 'неверно? изменить'}</button></div>
          {segEdit && <Segmented label="Размер бизнеса" value={co.segment} options={cat.segments.map(x => [x.id, x.name])} onChange={v => patchCo.mutate({ body: { segment: v } })} />}
          <h1 className="bl-h1">рядом с {on > 1 ? 'вашими точками' : 'вашей точкой'} <span className="hl"><Num value={f.reach} /></span> подходящих людей</h1>
          <p className="bl-body bl-secondary">{seg.hint}</p>
        </div>
      </div>
      <div className="two">
        <section className="bl-section pad bl-stack" style={gap('16px')}>
          <div className="bl-row">
            {co.points.map(p => <Chip key={p.id} on={p.active} onClick={() => toggle(p.id, !p.active)}><MapPin size={16} />{p.addr}</Chip>)}
          </div>
          <div className="map"><ReachMap points={co.points} onToggle={pid => toggle(pid, !co.points.find(p => p.id === pid)!.active)} /><span className="bl-pill-dark map__legend">радиус 1 км · живут и работают рядом</span></div>
          <p className="bl-caption">Нажмите на точку, чтобы исключить её. Считаем по обезличенным данным базовых станций: сколько людей живут, работают или каждый день бывают рядом.</p>
        </section>
        <section className="bl-section pad bl-stack sticky" style={gap('20px')}>
          <h2 className="bl-h3">прогноз на месяц</h2>
          {T.share
            ? <p className="bl-caption">{c.deal.line}. Бюджет не нужен: клиент платит билайну, мы выплачиваем вам раз в месяц.</p>
            : <label className="bl-field">
                <span className="bl-field__label">бюджет: <b className="bl-medium">{rub(budget)}</b></span>
                <input className="bl-range" type="range" min={3000} max={100000} step={1000} value={budget} onChange={e => setBudget(+e.target.value)} aria-label="Бюджет в месяц" />
              </label>}
          <div className="bl-grid" style={{ ['--bl-cols' as string]: 2, gap: 20 }}>
            {stats.map(([t, v, suf]) => <div key={t} className="bl-stat"><span className="bl-stat__label">{t}</span><span className="bl-stat__value"><Num value={v} suffix={suf} /></span></div>)}
          </div>
          <div className="short-hide"><Trend label={`Накопленные ${click ? 'клики' : T.unit} по неделям`} data={weeks} fmt={v => `${n(v)} · ${click ? 'клики' : T.unit}`} height={120} /></div>
          <p className="bl-micro">{click ? 'Прогноз по ставкам кофеен в вашем районе. Списываем только за клики, остановить можно в любой момент.' : `Прогноз по похожим офферам в вашем районе. Вы платите ${T.pay}, остановить можно в любой момент.`}</p>
          <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" onClick={() => nav(`/c/${id}/build`)}>{click ? 'собрать кампанию' : 'задать условия'}</button>
        </section>
      </div>
    </div>
  )
}

/* 4.1 Чекаут */
export function Checkout() {
  const id = useId(), c = useCampaign(id), co = useCompany(), session = useSession(), cat = useCatalog(), T = useOfferType(c.type)
  const nav = useNavigate()
  const patch = $api.useMutation('patch', '/campaigns/{id}', act)
  const patchSession = $api.useMutation('patch', '/session', act)
  const login = $api.useMutation('post', '/session/login', act)
  const submit = $api.useMutation('post', '/campaigns/{id}/submit', act)
  const set = (body: Parameters<typeof patch.mutate>[0]['body']) => patch.mutate({ params: { path: { id } }, body })
  const [modal, setModal] = useState<null | 'sbp' | 'card' | 'done'>(null)
  const [offer, setOffer] = useState(false)
  const preset = c.amount === null || c.amount === 3000 || c.amount === 30000
  const [custom, setCustom] = useLater(preset ? '' : String(c.amount), v => set({ amount: +v.replace(/\D/g, '') || 0 }))
  const p = cat.providers.find(x => x.id === session.provider && x.id !== 'inn')
  const boss = session.role === 'boss', f = c.forecast, amount = f.amount
  const amountErr = !T.share && !preset && amount < 3000
  const canGo = !!p && !amountErr && (boss ? offer : true) && !submit.isPending
  const sent = c.status === 'approval'
  const pay = async () => {
    const card = !T.share && (c.payMethod === 'sbp' || c.payMethod === 'card')
    try {
      if (card) { setModal(c.payMethod as 'sbp' | 'card'); await sleep(c.payMethod === 'sbp' ? 2400 : 1800) }
      await submit.mutateAsync({ params: { path: { id } }, body: { acceptOffer: true } })
      if (card) { setModal('done'); await sleep(1400) }
      else toast(T.share ? 'Оферта принята, отправляем на проверку' : c.payMethod === 'invoice' ? 'Счёт-оферта отправлен на почту. Запустим после зачисления' : 'Запускаем, счёт придёт в конце месяца')
      nav(`/c/${id}/launch`)
    } finally { setModal(null) }
  }
  const amounts: [number | null, string][] = [[null, `на месяц · ${rub(c.budget)}`], [3000, 'тест · 3 000 ₽'], [30000, '30 000 ₽']]
  const payHint = cat.payMethods.find(x => x.id === c.payMethod)!.hint
  return (
    <div className="bl-page wrap">
      <FlowHead step={2} id={id} />
      <div className="page-title">
        <h1 className="bl-h1">оплата и запуск</h1>
        <div className="bl-stack" style={{ ...gap('6px'), alignItems: 'flex-end' }}>
          <span className="demo-note">кто вошёл</span>
          <Segmented label="Кто вошёл" value={session.role} options={[['boss', 'руководитель'], ['staff', 'сотрудник']]} onChange={v => patchSession.mutate({ body: { role: v } })} />
        </div>
      </div>
      <div className="two">
        <div className="bl-stack" style={gap('24px')}>
          <section className="bl-section pad bl-stack" style={gap('16px')}>
            <div className="bl-row" style={{ justifyContent: 'space-between' }}><h2 className="bl-h3">реквизиты</h2>{p && <span className="bl-tag bl-tag--soft-green">из {p.name}</span>}</div>
            {!p ? (
              <>
                <p className="bl-body bl-secondary">Чтобы принять оферту и оплатить, войдите по бизнес-ID. Реквизиты заполнятся сами.</p>
                <IdButtons onPick={pid => login.mutateAsync({ body: { provider: pid } }).then(() => toast(`Вход через ${cat.providers.find(x => x.id === pid)!.short}: реквизиты заполнены`))} />
              </>
            ) : (
              <p className="bl-body">{co.name}, ИНН {co.inn} · {co.bank}<span className="bl-caption" style={{ display: 'block' }}>подписант {co.signer}{!boss && ` · вы: ${co.employee}, маркетолог`}</span></p>
            )}
          </section>
          {T.share ? (
            <section className="bl-section pad bl-stack" style={gap('16px')}>
              <h2 className="bl-h3">выплаты вам</h2>
              <p className="bl-body">Пополнять баланс не нужно. Клиент платит билайну, а мы перечисляем вам <b className="bl-medium">{rub(f.per)}</b> {c.type === 'coupon' ? 'за каждый погашенный купон' : 'за каждый оплаченный месяц подписки'}.</p>
              <p className="bl-body">по прогнозу ≈ <b className="bl-medium"><Num value={f.money} suffix=" ₽" /></b> в месяц · выплата 1-го числа на {co.bank}</p>
              <p className="bl-caption">Комиссию {T.fee} % удерживаем из выплаты. Отчёт агента придёт в ЭДО вместе с актом.</p>
            </section>
          ) : <>
            <section className="bl-section pad bl-stack" style={gap('16px')}>
              <h2 className="bl-h3">сумма на баланс</h2>
              <div className="bl-row">
                {amounts.map(([v, t]) => <Chip key={t} on={c.amount === v} onClick={() => set({ amount: v })}>{t}</Chip>)}
                <Chip on={!preset} onClick={() => set({ amount: +custom || 0 })}>другая</Chip>
              </div>
              {!preset && (
                <label className={`bl-field${amountErr && custom ? ' is-error' : ''}`} style={{ maxWidth: 300 }}>
                  <span className="bl-field__label">сумма</span>
                  <input className="bl-input" inputMode="numeric" value={custom} onChange={e => setCustom(e.target.value.replace(/[^\d ]/g, ''))} placeholder="15 000" autoFocus />
                  <span className="bl-field__caption">от 3 000 ₽</span>
                </label>
              )}
              <p className="bl-body">хватит примерно на {c.type === 'click' ? <><b className="bl-medium"><Num value={f.payClicks} /></b> кликов и <b className="bl-medium"><Num value={f.payVisits} /></b> гостей</> : <><b className="bl-medium"><Num value={f.payResults} /></b> {T.many}</>} · <span className="bl-success">+{rub(cat.bonus)} бонус на первую кампанию</span></p>
            </section>
            <section className="bl-section pad bl-stack" style={gap('16px')}>
              <h2 className="bl-h3">способ оплаты</h2>
              <div className="bl-row">{cat.payMethods.map(m => <Chip key={m.id} on={c.payMethod === m.id} onClick={m.largeOnly && co.segment !== 'large' ? undefined : () => set({ payMethod: m.id })}>{m.name}</Chip>)}</div>
              <p className="bl-caption">{payHint}{co.segment !== 'large' && ' · постоплата — для крупного бизнеса по договору'}</p>
            </section>
          </>}
        </div>
        <section className="bl-section pad bl-stack sticky" style={gap('16px')}>
          <h2 className="bl-h3">кампания</h2>
          <dl className="kv kv--narrow">
            <dt>тип</dt><dd>{T.t}</dd>
            <dt>{c.type === 'click' ? 'цель' : 'оффер'}</dt><dd>{c.name}</dd>
            {c.type !== 'click' && <><dt>условия</dt><dd>{c.deal.line}</dd></>}
            <dt>точки</dt><dd>{co.points.filter(x => x.active).length} из {co.points.length}</dd>
            <dt>места</dt><dd>{c.mode === 'manual' ? cat.places.filter(x => c.places[x.id]).map(x => x.t).join(', ') : 'подберёт автопилот'}</dd>
            {T.share ? <><dt>к оплате</dt><dd>без предоплаты</dd></> : <><dt>к оплате</dt><dd className="bl-h3">{rub(amount)}</dd></>}
          </dl>
          {c.moderation && <div className="bl-notice bl-notice--error"><AlertTriangle size={18} /><span>В тексте есть слово, которое не пройдёт модерацию. <Link to={`/c/${id}/build`}>Исправить сейчас</Link> или поправите на шаге запуска.</span></div>}
          <hr className="bl-divider" />
          {boss ? (
            <>
              <Check checked={offer} onChange={setOffer} label={<>принимаю <Link to="/offer" target="_blank">оферту</Link></>} sub="договор и ЭДО не нужны, закрывающие документы — когда подключите ЭДО" />
              <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={!canGo} onClick={pay}>
                {T.share ? 'принять оферту и запустить' : c.payMethod === 'invoice' ? 'выставить счёт' : c.payMethod === 'post' ? 'запустить с постоплатой' : `оплатить ${rub(amount)} и запустить`}
              </button>
              {!offer && p && <p className="bl-micro" style={{ textAlign: 'center' }}>отметьте оферту, чтобы продолжить</p>}
            </>
          ) : sent ? (
            <>
              <div className="bl-notice bl-notice--success"><Send size={18} /><span>Ссылка ушла {co.signerShort} в SMS и на почту. Как только подтвердит{T.share ? '' : ' и оплатит'}, кампания запустится.</span></div>
              <Link className="bl-btn bl-btn--block" to={`/approve/${c.approvalToken}`}><Smartphone size={18} />открыть как руководитель</Link>
              <button className="bl-btn bl-btn--ghost" style={{ alignSelf: 'center' }} onClick={() => toast('Напоминание отправлено')}>напомнить ещё раз</button>
            </>
          ) : (
            <>
              <div className="bl-notice"><Info size={18} /><span>Оферту принимает руководитель: {co.signerShort}. Отправим ссылку, подтвердит с телефона через бизнес-ID.</span></div>
              <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={!canGo} onClick={() => submit.mutate({ params: { path: { id } }, body: {} })}>отправить на подтверждение</button>
            </>
          )}
          <Link className="bl-btn bl-btn--ghost" to={`/c/${id}/build`} style={{ alignSelf: 'center' }}>изменить кампанию</Link>
        </section>
      </div>
      <Modal open={!!modal} label="Оплата">
        {modal === 'sbp' && <><h2 className="bl-h2">оплата по СБП</h2><Qr /><p className="bl-body">{rub(amount)} · {co.name}</p><p className="bl-caption">Отсканируйте в приложении банка или откройте ссылку на телефоне</p><div className="wait-bar" /></>}
        {modal === 'card' && <><h2 className="bl-h2">переходим на страницу банка</h2><div className="bl-skeleton" style={{ height: 56 }} /><p className="bl-caption">Данные карты вводятся на стороне банка, мы их не видим</p></>}
        {modal === 'done' && <motion.div className="bl-stack" style={{ ...gap('12px'), alignItems: 'center' }} initial={{ scale: 0.9 }} animate={{ scale: 1 }}><span className="ok-badge"><CheckIcon size={32} strokeWidth={3} /></span><h2 className="bl-h2">деньги на балансе</h2><p className="bl-caption">зачислено за 8 секунд, +{rub(cat.bonus)} бонус</p></motion.div>}
      </Modal>
    </div>
  )
}

/* 4.2 Подтверждение руководителем, телефон. Открывается по ссылке, без входа */
export function Approve() {
  const token = useParams().token!
  const nav = useNavigate()
  const { data: a } = useSuspenseQuery($api.queryOptions('get', '/approvals/{token}', { params: { path: { token } } }))
  const opts = { params: { path: { token } } }
  const confirm = $api.useMutation('post', '/approvals/{token}/confirm', act)
  const payM = $api.useMutation('post', '/approvals/{token}/pay', act)
  const [busy, setBusy] = useState(false)
  const c = a.campaign, amount = c.forecast.amount, T = useOfferType(c.type), share = T.share, typeName = T.t
  const done = c.status !== 'approval'
  const payName = useCatalog().payMethods.find(m => m.id === c.payMethod)!.name
  // пауза — имитация окна бизнес-ID и банка
  const run = (m: () => Promise<unknown>) => { setBusy(true); sleep(1200).then(m).finally(() => setBusy(false)) }
  return (
    <div className="bl-page">
      <div className="phone"><div className="phone__in">
        <div className="bl-row" style={{ justifyContent: 'space-between' }}><img className="bl-logo bl-logo--s" src={logoUrl} alt="билайн" width={32} height={32} /><span className="bl-caption">партнёрская платформа</span></div>
        <AnimatePresence mode="wait">
          {done ? (
            <motion.div key="done" className="bl-stack" style={{ ...gap('16px'), flex: 1 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <div className="bl-card bl-card--white" style={{ marginTop: 32, gap: 16 }}>
                <span className="ok-badge"><CheckIcon size={28} strokeWidth={3} /></span>
                <h1 className="bl-h2">готово, кампания на проверке</h1>
                <p className="bl-body bl-secondary">Оферта принята{c.payMethod === 'invoice' && !share ? ', счёт отправлен на почту' : !share && c.payMethod !== 'post' ? `, ${rub(amount)} оплачено` : ''}. {a.employee} получит уведомление.</p>
              </div>
              <button className="bl-btn bl-btn--block bl-btn--l" style={{ marginTop: 'auto' }} onClick={() => nav(`/c/${c.id}/launch`)}>открыть кабинет</button>
            </motion.div>
          ) : a.needsPay ? (
            <motion.div key="pay" className="bl-stack" style={{ ...gap('16px'), flex: 1 }} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}>
              <span className="bl-tag bl-tag--soft-green" style={{ alignSelf: 'flex-start', marginTop: 16 }}><Done size={14} /> оферта принята</span>
              <h1 className="bl-h2">осталось оплатить {rub(amount)}</h1>
              <p className="bl-body bl-secondary">{c.payMethod === 'sbp' ? 'Откроем приложение вашего банка, подтвердите платёж там.' : 'Перейдём на страницу банка для оплаты картой.'}</p>
              <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" style={{ marginTop: 'auto' }} disabled={busy} onClick={() => run(() => payM.mutateAsync(opts))}>
                {busy ? <><Loader2 size={20} className="spin" />ждём банк…</> : c.payMethod === 'sbp' ? 'оплатить по СБП' : 'оплатить картой'}
              </button>
            </motion.div>
          ) : (
            <motion.div key="confirm" className="bl-stack" style={{ ...gap('16px'), flex: 1 }} exit={{ opacity: 0, x: -24 }}>
              <h1 className="bl-h2" style={{ marginTop: 16 }}>{a.employee} просит подтвердить запуск рекламы</h1>
              <div className="bl-card bl-card--white">
                <dl className="kv kv--stack"><dt>компания</dt><dd>{a.company}</dd><dt>кампания</dt><dd>{c.name}</dd><dt>тип</dt><dd>{typeName}</dd>{share ? <><dt>оплата</dt><dd>без предоплаты, выплаты вам раз в месяц</dd></> : <><dt>сумма</dt><dd className="bl-h3">{rub(amount)}</dd><dt>оплата</dt><dd>{payName}</dd></>}</dl>
                <Link to="/offer" target="_blank" className="bl-caption">текст оферты</Link>
              </div>
              <p className="bl-caption">Подтверждая, вы принимаете оферту от имени {a.company}.</p>
              <div className="bl-stack" style={{ ...gap('8px'), marginTop: 'auto' }}>
                <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={busy} onClick={() => run(() => confirm.mutateAsync({ ...opts, body: { provider: 'gos' } }))}>{busy ? <><Loader2 size={20} className="spin" />подтверждаем…</> : 'подтвердить через Госуслуги'}</button>
                <button className="bl-btn bl-btn--block" disabled={busy} onClick={() => run(() => confirm.mutateAsync({ ...opts, body: { provider: 'sber' } }))}>СберБизнес ID</button>
                <button className="bl-btn bl-btn--block" disabled={busy} onClick={() => run(() => confirm.mutateAsync({ ...opts, body: { provider: 'alfa' } }))}>Альфа ID для бизнеса</button>
                <button className="bl-btn bl-btn--ghost" style={{ alignSelf: 'center' }} onClick={() => toast(`${a.employee} получит отказ с комментарием`)}>отклонить</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div></div>
    </div>
  )
}

/* 5. ИИ-модерация и запуск */
export function Launch() {
  const id = useId(), c = useCampaign(id), co = useCompany(), T = useOfferType(c.type)
  const nav = useNavigate()
  const patch = $api.useMutation('patch', '/campaigns/{id}', act)
  const patchCo = $api.useMutation('patch', '/company', act)
  const paid = $api.useMutation('post', '/campaigns/{id}/invoice-paid', act)
  const hit = c.moderation, waitInvoice = c.status === 'invoice', L = c.launchStep
  const fix = () => patch.mutate({ params: { path: { id } }, body: { adText: c.adText.replace(hit!.word, hit!.fix) } })
  const notify = (k: keyof typeof co.notify) => (v: boolean) => patchCo.mutate({ body: { notify: { ...co.notify, [k]: v } } })
  const rows = [
    ...(c.payMethod === 'invoice' && !T.share ? [{ done: !waitInvoice, wait: waitInvoice, t: waitInvoice ? 'ждём оплату по счёту' : 'оплата по счёту получена', sub: 'обычно 1–3 рабочих дня' }] : []),
    { done: L >= 1, wait: !hit && !waitInvoice && L === 0, t: L >= 1 ? 'проверено за 2 минуты' : 'ИИ-проверка текста и картинки', sub: 'закон «О рекламе», правила площадок' },
    { done: L >= 2, wait: L === 1, t: 'маркировка', sub: L >= 2 ? 'erid 2SDnjc7Xy3M присвоен, данные в ОРД переданы' : 'присвоим erid и передадим данные в ОРД' },
    ...(c.type !== 'click' ? [{ done: L >= 3, wait: L === 2, t: `${T.via.label}: ${c.terms.via}`, sub: L >= 3 ? 'проверили тестовым результатом' : T.via.hint }] : []),
    { done: L >= 3, wait: L === 2 && c.type === 'click', t: 'показывается', sub: L >= 3 ? 'первые показы в витрине «лучшее рядом» и на главной' : 'старт в аукционе сразу после маркировки' },
  ]
  if (c.status === 'draft' || c.status === 'approval') {
    return (
      <div className="bl-page wrap"><FlowHead step={3} id={id} />
        <section className="bl-section pad bl-stack" style={{ ...gap('16px'), marginTop: 32, maxWidth: 640 }}>
          <h1 className="bl-h2">{c.status === 'approval' ? `ждём подтверждения: ${co.signerShort}` : 'кампания ещё не запущена'}</h1>
          <p className="bl-body bl-secondary">Запуск начнётся сразу после {T.share ? 'принятия оферты' : 'оплаты'} или подтверждения руководителем.</p>
          <div><Link className="bl-btn bl-btn--primary bl-btn--l" to={`/c/${id}/checkout`}>{T.share ? 'к оферте' : 'к оплате'}</Link></div>
        </section>
      </div>
    )
  }
  return (
    <div className="bl-page wrap">
      <FlowHead step={3} id={id} />
      <div className="page-title">
        <h1 className="bl-h1">{L >= 3 ? 'кампания показывается' : hit ? 'одна правка, и запускаем' : waitInvoice ? 'ждём оплату счёта' : 'проверяем и запускаем'}</h1>
        {L >= 3 && <motion.span className="bl-tag bl-tag--success" initial={{ scale: 0.6 }} animate={{ scale: 1 }}>{c.status === 'paused' ? 'на паузе' : 'показывается'}</motion.span>}
      </div>
      <div className="two">
        <section className="bl-section pad bl-stack" style={gap('16px')}>
          <h2 className="bl-h3">текст объявления</h2>
          <p className="bl-body-l">{hit ? <>{c.adText.split(hit.word)[0]}<mark className="stop">{hit.word}</mark>{c.adText.split(hit.word).slice(1).join(hit.word)}</> : c.adText}</p>
          {hit ? (
            <div className="bl-notice bl-notice--error">
              <AlertTriangle size={18} />
              <div className="bl-stack" style={gap('8px')}>
                <span><b className="bl-medium">«{hit.word}»</b>: {hit.why}.</span>
                <span>Предлагаем: <b className="bl-medium">«{hit.fix}»</b></span>
                <div className="bl-row"><button className="bl-btn bl-btn--primary" onClick={fix}>заменить и отправить</button><button className="bl-btn" onClick={() => toast('Отправим на ручную проверку, ответ до 24 часов')}>проверить вручную</button></div>
              </div>
            </div>
          ) : <div className="bl-notice bl-notice--success"><CheckIcon size={18} />Текст и картинка соответствуют закону «О рекламе».</div>}
          <hr className="bl-divider" />
          <h2 className="bl-h3">уведомления</h2>
          <div className="bl-row" style={gap('24px')}><Switch checked={co.notify.sms} onChange={notify('sms')} label="SMS" /><Switch checked={co.notify.mail} onChange={notify('mail')} label="почта" /><Switch checked={co.notify.tg} onChange={notify('tg')} label="Telegram" /></div>
          <p className="bl-caption">Напишем, когда пойдут показы, когда появятся первые визиты и когда баланс будет заканчиваться.</p>
        </section>
        <section className="bl-section pad sticky bl-stack" style={gap('8px')}>
          <h2 className="bl-h3">статус</h2>
          <div className="status-list">
            {rows.map(r => (
              <div key={r.t} className={`status${r.done ? ' is-done' : r.wait ? ' is-wait' : ''}`}>
                <span className="status__dot">{r.done ? <CheckIcon size={16} strokeWidth={3} /> : r.wait ? <Clock size={16} /> : <FileText size={16} />}</span>
                <span><span className="bl-body" style={{ display: 'block' }}>{r.t}</span><span className="bl-caption">{r.sub}</span></span>
              </div>
            ))}
          </div>
          {waitInvoice && <button className="bl-btn bl-btn--s" onClick={() => paid.mutate({ params: { path: { id } } })}><span className="demo-note">оплата пришла</span></button>}
          <button className={`bl-btn bl-btn--l bl-btn--block${L >= 3 ? ' bl-btn--primary' : ''}`} disabled={L < 3} onClick={() => nav(`/cab/stats/${id}`)}>смотреть статистику</button>
          {L < 3 && <p className="bl-micro" style={{ textAlign: 'center' }}>статистика откроется, как только пойдут показы</p>}
          {c.status === 'live' && c.places.showcase && <Link className="bl-btn bl-btn--block" to={`/near?offer=c${id}`}>посмотреть на витрине глазами абонента</Link>}
        </section>
      </div>
    </div>
  )
}
