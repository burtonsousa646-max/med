import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, Check as CheckIcon, Clock, FileText, Info, Loader2, MapPin, Plus, Send, Smartphone } from 'lucide-react'
import { CO, PAY_NAMES, PLACES, PROVIDERS, SEGMENTS, n, rub, stopHit, type Pay, type Segment } from '../data'

const PAY_HINT: Record<Pay, string> = { sbp: 'зачисление за 10 секунд, без комиссии', card: 'любая карта юрлица, зачисление сразу', invoice: 'зачисление 1–3 дня, запуск после оплаты', post: 'лимит 500 000 ₽, счёт в конце месяца' }
import { BONUS, activePoints, adText, campName, deal, forecast, modeOf, payAmount, typeOf, update, useStore } from '../store'
import { ReachMap } from '../mock'
import { Trend } from '../charts'
import { Check, Chip, Done, FlowHead, Modal, Num, Qr, Segmented, Switch, TypeTag, toast } from '../ui'
import { IdButtons } from './Entry'
import logoUrl from '../../../design-system/assets/beeline-logo.svg'

const gap = (v: string) => ({ ['--bl-gap' as string]: v })

/* 2.2 Согласия */
export function Consent() {
  const s = useStore()
  const nav = useNavigate()
  const p = s.provider && s.provider !== 'inn' ? PROVIDERS[s.provider] : PROVIDERS.sber
  const [adding, setAdding] = useState(false)
  const [addr, setAddr] = useState('')
  const ok = s.consents.company && s.consents.signer
  const addPoint = () => {
    if (addr.trim().length < 5) return
    update(x => {
      const slots = [{ x: 470, y: 120 }, { x: 160, y: 360 }, { x: 330, y: 400 }]
      const slot = slots[(x.points.length - 2) % slots.length]
      const id = `p${Date.now()}`
      x.points.push({ id, addr: addr.trim(), ...slot }); x.pointsOn[id] = true
    })
    toast(`Точка «${addr.trim()}» добавлена`)
    setAddr(''); setAdding(false)
  }
  return (
    <div className="bl-page wrap">
      <FlowHead step={0} />
      <div className="page-title">
        <div className="bl-stack" style={gap('8px')}>
          <span className="bl-tag bl-tag--soft-green" style={{ alignSelf: 'flex-start' }}><Done size={14} /> компания найдена в {p.name}</span>
          <h1 className="bl-h1">проверьте, что это вы</h1>
        </div>
      </div>
      <div className="two">
        <section className="bl-section pad bl-stack" style={gap('24px')}>
          <div><h2 className="bl-h3">{CO.name}</h2><p className="bl-caption" style={{ marginTop: 4 }}>{CO.brand} · {CO.site}</p></div>
          <dl className="kv"><dt>ИНН / КПП</dt><dd>{CO.inn} / {CO.kpp}</dd><dt>ОГРН</dt><dd>{CO.ogrn}</dd><dt>подписант</dt><dd>{CO.signer}, {CO.role}</dd><dt>расчётный счёт</dt><dd>{CO.bank}</dd></dl>
          <div>
            <div className="bl-field__label" style={{ marginBottom: 8 }}>точки продаж · из Яндекс Карт и DaData</div>
            {s.points.map(pt => (
              <div key={pt.id} className="bl-cell"><span className="bl-cell__icon"><MapPin size={18} /></span><span className="bl-cell__main"><span className="bl-cell__title">{pt.addr}</span><span className="bl-cell__sub" style={{ display: 'block' }}>Москва</span></span></div>
            ))}
          </div>
          {adding ? (
            <div className="bl-row" style={{ alignItems: 'flex-end' }}>
              <label className="bl-field" style={{ flex: 1, minWidth: 220 }}><span className="bl-field__label">адрес новой точки</span><input className="bl-input" value={addr} onChange={e => setAddr(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPoint()} placeholder="ул. Таганская, 3" autoFocus /></label>
              <button className="bl-btn bl-btn--dark bl-btn--l" onClick={addPoint} disabled={addr.trim().length < 5}>добавить</button>
              <button className="bl-btn bl-btn--ghost" onClick={() => setAdding(false)}>отмена</button>
            </div>
          ) : <button className="bl-btn bl-btn--s" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}><Plus size={16} />добавить точку</button>}
        </section>
        <section className="bl-section pad bl-stack sticky" style={gap('20px')}>
          <h2 className="bl-h3">что возьмём и зачем</h2>
          <Check path="consents.company" label="данные компании" sub="реквизиты и адреса: заполнить оферту и посчитать охват по точкам" />
          <Check path="consents.signer" label="данные подписанта" sub="ФИО и должность: чтобы оферту принял тот, кто вправе" />
          <Check path="consents.profile" label="профиль абонента билайна" sub="по желанию: подскажем аудиторию по вашим интересам и районам" />
          <p className="bl-micro">Согласие можно отозвать в разделе «Компания». Данные не передаём третьим лицам.</p>
          {!ok && <p className="bl-caption bl-error" role="alert">Без данных компании и подписанта не сможем посчитать охват и оформить оферту.</p>}
          <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={!ok} onClick={() => nav('/reach')}>показать охват</button>
        </section>
      </div>
    </div>
  )
}

/* 2.3 Охват и прогноз */
export function Reach() {
  const s = useStore()
  const nav = useNavigate()
  const f = forecast(s)
  const [segEdit, setSegEdit] = useState(false)
  const on = activePoints(s).length
  const T = typeOf(s), click = s.otype === 'click'
  const weeks = [0.2, 0.45, 0.72, 1].map((k, i) => ({ label: `${i + 1} неделя`, value: Math.round((click ? f.clicks : f.res) * k) }))
  const stats: [string, number, string?][] = click
    ? [['клики', f.clicks], ['придут к вам', f.visits], ['цена клика', f.cpc, ' ₽'], ['один гость', f.guest, ' ₽']]
    : [[T.unit, f.res], [T.share ? 'выплатим вам' : 'потратите', f.money, ' ₽'], [T.per, f.per, ' ₽'], ['охват', f.reach]]
  return (
    <div className="bl-page wrap">
      <FlowHead step={0} />
      {s.provider === 'inn' && <div className="bl-notice bl-notice--info" style={{ marginTop: 16 }}><Info size={18} />Вы без входа: охват по открытым данным. Точнее посчитаем после входа по бизнес-ID, он же понадобится для оплаты.</div>}
      <div className="page-title">
        <div className="bl-stack" style={gap('12px')}>
          <div className="bl-row"><TypeTag /><span className="bl-tag">{SEGMENTS[s.segment].name}</span><button className="bl-btn bl-btn--ghost bl-caption" onClick={() => setSegEdit(!segEdit)}>{segEdit ? 'готово' : 'неверно? изменить'}</button></div>
          {segEdit && <Segmented label="Размер бизнеса" value={s.segment} options={Object.entries(SEGMENTS).map(([k, v]) => [k as Segment, v.name])} onChange={v => update(x => { x.segment = v; x.tab = null })} />}
          <h1 className="bl-h1">рядом с {on > 1 ? 'вашими точками' : 'вашей точкой'} <span className="hl"><Num value={f.reach} /></span> подходящих людей</h1>
          <p className="bl-body bl-secondary">{SEGMENTS[s.segment].hint}</p>
        </div>
      </div>
      <div className="two">
        <section className="bl-section pad bl-stack" style={gap('16px')}>
          <div className="bl-row">
            {s.points.map(p => <Chip key={p.id} on={s.pointsOn[p.id] !== false} onClick={() => update(x => { if (on > 1 || x.pointsOn[p.id] === false) x.pointsOn[p.id] = x.pointsOn[p.id] === false })}><MapPin size={16} />{p.addr}</Chip>)}
          </div>
          <div className="map"><ReachMap points={s.points} on={s.pointsOn} onToggle={id => update(x => { x.pointsOn[id] = x.pointsOn[id] === false })} /><span className="bl-pill-dark map__legend">радиус 1 км · живут и работают рядом</span></div>
          <p className="bl-caption">Нажмите на точку, чтобы исключить её. Считаем по обезличенным данным базовых станций: сколько людей живут, работают или каждый день бывают рядом.</p>
        </section>
        <section className="bl-section pad bl-stack sticky" style={gap('20px')}>
          <h2 className="bl-h3">прогноз на месяц</h2>
          {T.share
            ? <p className="bl-caption">{deal(s).line}. Бюджет не нужен: клиент платит билайну, мы выплачиваем вам раз в месяц.</p>
            : <label className="bl-field">
                <span className="bl-field__label">бюджет: <b className="bl-medium">{rub(s.budget)}</b></span>
                <input className="bl-range" type="range" min={3000} max={100000} step={1000} value={s.budget} onChange={e => update(x => { x.budget = +e.target.value })} aria-label="Бюджет в месяц" />
              </label>}
          <div className="bl-grid" style={{ ['--bl-cols' as string]: 2, gap: 20 }}>
            {stats.map(([t, v, suf]) => <div key={t} className="bl-stat"><span className="bl-stat__label">{t}</span><span className="bl-stat__value"><Num value={v} suffix={suf} /></span></div>)}
          </div>
          <div className="short-hide"><Trend label={`Накопленные ${click ? 'клики' : T.unit} по неделям`} data={weeks} fmt={v => `${n(v)} · ${click ? 'клики' : T.unit}`} height={120} /></div>
          <p className="bl-micro">{click ? 'Прогноз по ставкам кофеен в вашем районе. Списываем только за клики, остановить можно в любой момент.' : `Прогноз по похожим офферам в вашем районе. Вы платите ${T.pay}, остановить можно в любой момент.`}</p>
          <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" onClick={() => nav('/build')}>{click ? 'собрать кампанию' : 'задать условия'}</button>
        </section>
      </div>
    </div>
  )
}

/* 4.1 Чекаут */
export function Checkout() {
  const s = useStore()
  const nav = useNavigate()
  const f = forecast(s)
  const [modal, setModal] = useState<null | 'sbp' | 'card' | 'done'>(null)
  const p = s.provider && s.provider !== 'inn' ? PROVIDERS[s.provider] : null
  const boss = s.role === 'boss'
  const amount = payAmount(s)
  const T = typeOf(s), d = deal(s)
  const amountErr = !T.share && s.amount === 0 && amount < 3000
  const canGo = !!p && !amountErr && (boss ? s.offer : true)
  const finish = () => { update(x => { x.paid = true; x.launch = 0; x.invoicePaid = false }); nav('/launch') }
  const pay = () => {
    if (T.share) { toast('Оферта принята, отправляем на проверку'); finish() }
    else if (s.pay === 'sbp' || s.pay === 'card') {
      setModal(s.pay)
      setTimeout(() => setModal('done'), s.pay === 'sbp' ? 2400 : 1800)
      setTimeout(() => { setModal(null); finish() }, s.pay === 'sbp' ? 3800 : 3000)
    } else {
      toast(s.pay === 'invoice' ? 'Счёт-оферта отправлен на почту. Запустим после зачисления' : 'Запускаем, счёт придёт в конце месяца')
      finish()
    }
  }
  const amounts: [number | null, string][] = [[null, `на месяц · ${rub(s.budget)}`], [3000, 'тест · 3 000 ₽'], [30000, '30 000 ₽'], [0, 'другая']]
  return (
    <div className="bl-page wrap">
      <FlowHead step={2} />
      <div className="page-title">
        <h1 className="bl-h1">оплата и запуск</h1>
        <div className="bl-stack" style={{ ...gap('6px'), alignItems: 'flex-end' }}>
          <span className="demo-note">кто вошёл</span>
          <Segmented label="Кто вошёл" value={s.role} options={[['boss', 'руководитель'], ['staff', 'сотрудник']]} onChange={v => update(x => { x.role = v; x.sentToBoss = false })} />
        </div>
      </div>
      <div className="two">
        <div className="bl-stack" style={gap('24px')}>
          <section className="bl-section pad bl-stack" style={gap('16px')}>
            <div className="bl-row" style={{ justifyContent: 'space-between' }}><h2 className="bl-h3">реквизиты</h2>{p && <span className="bl-tag bl-tag--soft-green">из {p.name}</span>}</div>
            {!p ? (
              <>
                <p className="bl-body bl-secondary">Чтобы принять оферту и оплатить, войдите по бизнес-ID. Реквизиты заполнятся сами.</p>
                <IdButtons onPick={id => { update(x => { x.provider = id }); toast(`Вход через ${PROVIDERS[id].short}: реквизиты заполнены`) }} />
              </>
            ) : (
              <p className="bl-body">{CO.name}, ИНН {CO.inn} · {CO.bank}<span className="bl-caption" style={{ display: 'block' }}>подписант {CO.signer}{!boss && ` · вы: ${CO.employee}, маркетолог`}</span></p>
            )}
          </section>
          {T.share ? (
          <section className="bl-section pad bl-stack" style={gap('16px')}>
            <h2 className="bl-h3">выплаты вам</h2>
            <p className="bl-body">Пополнять баланс не нужно. Клиент платит билайну, а мы перечисляем вам <b className="bl-medium">{rub(f.per)}</b> {s.otype === 'coupon' ? 'за каждый погашенный купон' : 'за каждый оплаченный месяц подписки'}.</p>
            <p className="bl-body">по прогнозу ≈ <b className="bl-medium"><Num value={f.money} suffix=" ₽" /></b> в месяц · выплата 1-го числа на {CO.bank}</p>
            <p className="bl-caption">Комиссию {T.fee} % удерживаем из выплаты. Отчёт агента придёт в ЭДО вместе с актом.</p>
          </section>
          ) : <>
          <section className="bl-section pad bl-stack" style={gap('16px')}>
            <h2 className="bl-h3">сумма на баланс</h2>
            <div className="bl-row">{amounts.map(([v, t]) => <Chip key={t} on={s.amount === v} onClick={() => update(x => { x.amount = v })}>{t}</Chip>)}</div>
            {s.amount === 0 && (
              <label className={`bl-field${amountErr && s.customAmount ? ' is-error' : ''}`} style={{ maxWidth: 300 }}>
                <span className="bl-field__label">сумма</span>
                <input className="bl-input" inputMode="numeric" value={s.customAmount} onChange={e => update(x => { x.customAmount = e.target.value.replace(/[^\d ]/g, '') })} placeholder="15 000" autoFocus />
                <span className="bl-field__caption">от 3 000 ₽</span>
              </label>
            )}
            <p className="bl-body">хватит примерно на {s.otype === 'click' ? <><b className="bl-medium"><Num value={f.aClicks} /></b> кликов и <b className="bl-medium"><Num value={f.aVisits} /></b> гостей</> : <><b className="bl-medium"><Num value={f.aRes} /></b> {T.many}</>} · <span className="bl-success">+{rub(BONUS)} бонус на первую кампанию</span></p>
          </section>
          <section className="bl-section pad bl-stack" style={gap('16px')}>
            <h2 className="bl-h3">способ оплаты</h2>
            <div className="bl-row">{(Object.keys(PAY_NAMES) as Pay[]).map(k => <Chip key={k} on={s.pay === k} onClick={k === 'post' && s.segment !== 'large' ? undefined : () => update(x => { x.pay = k })}>{PAY_NAMES[k]}</Chip>)}</div>
            <p className="bl-caption">{PAY_HINT[s.pay]}{s.segment !== 'large' && ' · постоплата — для крупного бизнеса по договору'}</p>
          </section>
          </>}
        </div>
        <section className="bl-section pad bl-stack sticky" style={gap('16px')}>
          <h2 className="bl-h3">кампания</h2>
          <dl className="kv kv--narrow">
            <dt>тип</dt><dd>{T.t}</dd>
            <dt>{s.otype === 'click' ? 'цель' : 'оффер'}</dt><dd>{campName(s)}</dd>
            {s.otype !== 'click' && <><dt>условия</dt><dd>{d.line}</dd></>}
            <dt>точки</dt><dd>{activePoints(s).length} из {s.points.length}</dd>
            <dt>места</dt><dd>{modeOf(s) === 'manual' ? PLACES.filter(x => s.places[x.id]).map(x => x.t).join(', ') : 'подберёт автопилот'}</dd>
            {T.share ? <><dt>к оплате</dt><dd>без предоплаты</dd></> : <><dt>к оплате</dt><dd className="bl-h3">{rub(amount)}</dd></>}
          </dl>
          {stopHit(adText(s)) && <div className="bl-notice bl-notice--error"><AlertTriangle size={18} /><span>В тексте есть слово, которое не пройдёт модерацию. <Link to="/build">Исправить сейчас</Link> или поправите на шаге запуска.</span></div>}
          <hr className="bl-divider" />
          {boss ? (
            <>
              <Check path="offer" label={<>принимаю <Link to="/offer" target="_blank">оферту</Link></>} sub="договор и ЭДО не нужны, закрывающие документы — когда подключите ЭДО" />
              <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={!canGo} onClick={pay}>
                {T.share ? 'принять оферту и запустить' : s.pay === 'invoice' ? 'выставить счёт' : s.pay === 'post' ? 'запустить с постоплатой' : `оплатить ${rub(amount)} и запустить`}
              </button>
              {!s.offer && p && <p className="bl-micro" style={{ textAlign: 'center' }}>отметьте оферту, чтобы продолжить</p>}
            </>
          ) : s.sentToBoss ? (
            <>
              <div className="bl-notice bl-notice--success"><Send size={18} /><span>Ссылка ушла {CO.signerShort} в SMS и на почту. Как только подтвердит и оплатит, кампания запустится.</span></div>
              <Link className="bl-btn bl-btn--block" to="/approve"><Smartphone size={18} />открыть как руководитель</Link>
              <button className="bl-btn bl-btn--ghost" style={{ alignSelf: 'center' }} onClick={() => toast('Напоминание отправлено')}>напомнить ещё раз</button>
            </>
          ) : (
            <>
              <div className="bl-notice"><Info size={18} /><span>Оферту принимает руководитель: {CO.signerShort}. Отправим ссылку, подтвердит с телефона через бизнес-ID.</span></div>
              <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={!canGo} onClick={() => update(x => { x.sentToBoss = true })}>отправить на подтверждение</button>
            </>
          )}
          <Link className="bl-btn bl-btn--ghost" to="/build" style={{ alignSelf: 'center' }}>изменить кампанию</Link>
        </section>
      </div>
      <Modal open={!!modal} label="Оплата">
        {modal === 'sbp' && <><h2 className="bl-h2">оплата по СБП</h2><Qr /><p className="bl-body">{rub(amount)} · {CO.name}</p><p className="bl-caption">Отсканируйте в приложении банка или откройте ссылку на телефоне</p><div className="wait-bar" /></>}
        {modal === 'card' && <><h2 className="bl-h2">переходим на страницу банка</h2><div className="bl-skeleton" style={{ height: 56 }} /><p className="bl-caption">Данные карты вводятся на стороне банка, мы их не видим</p></>}
        {modal === 'done' && <motion.div className="bl-stack" style={{ ...gap('12px'), alignItems: 'center' }} initial={{ scale: 0.9 }} animate={{ scale: 1 }}><span className="ok-badge"><CheckIcon size={32} strokeWidth={3} /></span><h2 className="bl-h2">деньги на балансе</h2><p className="bl-caption">зачислено за 8 секунд, +{rub(BONUS)} бонус</p></motion.div>}
      </Modal>
    </div>
  )
}

/* 4.2 Подтверждение руководителем, телефон */
export function Approve() {
  const s = useStore()
  const nav = useNavigate()
  const [stage, setStage] = useState<'confirm' | 'busy' | 'pay' | 'paying' | 'done'>(s.approved ? 'done' : 'confirm')
  const amount = payAmount(s)
  const share = typeOf(s).share
  const needsPay = !share && (s.pay === 'sbp' || s.pay === 'card')
  const confirm = () => {
    setStage('busy')
    setTimeout(() => {
      if (needsPay) setStage('pay')
      else { update(x => { x.approved = true; x.paid = true; x.launch = 0 }); setStage('done') }
    }, 1200)
  }
  const payNow = () => { setStage('paying'); setTimeout(() => { update(x => { x.approved = true; x.paid = true; x.launch = 0 }); setStage('done') }, 1500) }
  return (
    <div className="bl-page">
      <div className="phone"><div className="phone__in">
        <div className="bl-row" style={{ justifyContent: 'space-between' }}><img className="bl-logo bl-logo--s" src={logoUrl} alt="билайн" width={32} height={32} /><span className="bl-caption">рекламная платформа</span></div>
        <AnimatePresence mode="wait">
          {stage === 'done' ? (
            <motion.div key="done" className="bl-stack" style={{ ...gap('16px'), flex: 1 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <div className="bl-card bl-card--white" style={{ marginTop: 32, gap: 16 }}>
                <span className="ok-badge"><CheckIcon size={28} strokeWidth={3} /></span>
                <h1 className="bl-h2">готово, кампания на проверке</h1>
                <p className="bl-body bl-secondary">Оферта принята{needsPay ? `, ${rub(amount)} оплачено` : !share && s.pay === 'invoice' ? ', счёт отправлен на почту' : ''}. {CO.employee} получит уведомление.</p>
              </div>
              <button className="bl-btn bl-btn--block bl-btn--l" style={{ marginTop: 'auto' }} onClick={() => nav('/launch')}>открыть кабинет</button>
            </motion.div>
          ) : stage === 'pay' || stage === 'paying' ? (
            <motion.div key="pay" className="bl-stack" style={{ ...gap('16px'), flex: 1 }} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}>
              <span className="bl-tag bl-tag--soft-green" style={{ alignSelf: 'flex-start', marginTop: 16 }}><Done size={14} /> оферта принята</span>
              <h1 className="bl-h2">осталось оплатить {rub(amount)}</h1>
              <p className="bl-body bl-secondary">{s.pay === 'sbp' ? 'Откроем приложение вашего банка, подтвердите платёж там.' : 'Перейдём на страницу банка для оплаты картой.'}</p>
              <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" style={{ marginTop: 'auto' }} disabled={stage === 'paying'} onClick={payNow}>
                {stage === 'paying' ? <><Loader2 size={20} className="spin" />ждём банк…</> : s.pay === 'sbp' ? 'оплатить по СБП' : 'оплатить картой'}
              </button>
            </motion.div>
          ) : (
            <motion.div key="confirm" className="bl-stack" style={{ ...gap('16px'), flex: 1 }} exit={{ opacity: 0, x: -24 }}>
              <h1 className="bl-h2" style={{ marginTop: 16 }}>{CO.employee} просит подтвердить запуск рекламы</h1>
              <div className="bl-card bl-card--white">
                <dl className="kv kv--stack"><dt>компания</dt><dd>{CO.name}</dd><dt>кампания</dt><dd>{campName(s)}</dd><dt>тип</dt><dd>{typeOf(s).t}</dd>{share ? <><dt>оплата</dt><dd>без предоплаты, выплаты вам раз в месяц</dd></> : <><dt>сумма</dt><dd className="bl-h3">{rub(amount)}</dd><dt>оплата</dt><dd>{PAY_NAMES[s.pay]}</dd></>}</dl>
                <Link to="/offer" target="_blank" className="bl-caption">текст оферты</Link>
              </div>
              <p className="bl-caption">Подтверждая, вы принимаете оферту от имени {CO.name}.</p>
              <div className="bl-stack" style={{ ...gap('8px'), marginTop: 'auto' }}>
                <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={stage === 'busy'} onClick={confirm}>{stage === 'busy' ? <><Loader2 size={20} className="spin" />подтверждаем…</> : 'подтвердить через Госуслуги'}</button>
                <button className="bl-btn bl-btn--block" disabled={stage === 'busy'} onClick={confirm}>СберБизнес ID</button>
                <button className="bl-btn bl-btn--block" disabled={stage === 'busy'} onClick={confirm}>Альфа ID для бизнеса</button>
                <button className="bl-btn bl-btn--ghost" style={{ alignSelf: 'center' }} onClick={() => toast(`${CO.employee} получит отказ с комментарием`)}>отклонить</button>
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
  const s = useStore()
  const nav = useNavigate()
  const text = adText(s)
  const hit = stopHit(text)
  const T = typeOf(s)
  const waitInvoice = s.paid && !T.share && s.pay === 'invoice' && !s.invoicePaid
  const L = hit || waitInvoice || !s.paid ? 0 : s.launch
  useEffect(() => {
    if (hit || waitInvoice || !s.paid || s.launch >= 3) return
    const t = setTimeout(() => update(x => { x.launch++ }), s.launch === 0 ? 1600 : 1200)
    return () => clearTimeout(t)
  }, [hit, waitInvoice, s.paid, s.launch])
  const fix = () => update(x => { x.adText = text.replace(hit!.word, hit!.fix) })
  const rows = [
    ...(s.pay === 'invoice' && !T.share ? [{ done: !waitInvoice, wait: waitInvoice, t: waitInvoice ? 'ждём оплату по счёту' : 'оплата по счёту получена', sub: 'обычно 1–3 рабочих дня' }] : []),
    { done: L >= 1, wait: !hit && !waitInvoice && L === 0, t: L >= 1 ? 'проверено за 2 минуты' : 'ИИ-проверка текста и картинки', sub: 'закон «О рекламе», правила площадок' },
    { done: L >= 2, wait: L === 1, t: 'маркировка', sub: L >= 2 ? 'erid 2SDnjc7Xy3M присвоен, данные в ОРД переданы' : 'присвоим erid и передадим данные в ОРД' },
    ...(s.otype !== 'click' ? [{ done: L >= 2, wait: L === 1, t: `${T.via.label}: ${s.terms[s.otype].via}`, sub: L >= 2 ? 'проверили тестовым результатом' : T.via.hint }] : []),
    { done: L >= 3, wait: L === 2, t: 'показывается', sub: L >= 3 ? 'первые показы в Витрине выгод и на главной' : 'старт в аукционе сразу после маркировки' },
  ]
  if (!s.paid) {
    return (
      <div className="bl-page wrap"><FlowHead step={3} />
        <section className="bl-section pad bl-stack" style={{ ...gap('16px'), marginTop: 32, maxWidth: 640 }}>
          <h1 className="bl-h2">кампания ещё не оплачена</h1>
          <p className="bl-body bl-secondary">Запуск начнётся сразу после оплаты или подтверждения руководителем.</p>
          <div><Link className="bl-btn bl-btn--primary bl-btn--l" to="/checkout">к оплате</Link></div>
        </section>
      </div>
    )
  }
  return (
    <div className="bl-page wrap">
      <FlowHead step={3} />
      <div className="page-title">
        <h1 className="bl-h1">{L >= 3 ? 'кампания показывается' : hit ? 'одна правка, и запускаем' : waitInvoice ? 'ждём оплату счёта' : 'проверяем и запускаем'}</h1>
        {L >= 3 && <motion.span className="bl-tag bl-tag--success" initial={{ scale: 0.6 }} animate={{ scale: 1 }}>показывается</motion.span>}
      </div>
      <div className="two">
        <section className="bl-section pad bl-stack" style={gap('16px')}>
          <h2 className="bl-h3">текст объявления</h2>
          <p className="bl-body-l">{hit ? <>{text.split(hit.word)[0]}<mark className="stop">{hit.word}</mark>{text.split(hit.word).slice(1).join(hit.word)}</> : text}</p>
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
          <div className="bl-row" style={gap('24px')}><Switch path="notify.sms" label="SMS" /><Switch path="notify.mail" label="почта" /><Switch path="notify.tg" label="Telegram" /></div>
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
          {waitInvoice && <button className="bl-btn bl-btn--s" onClick={() => update(x => { x.invoicePaid = true; x.launch = 0 })}><span className="demo-note">оплата пришла</span></button>}
          <button className={`bl-btn bl-btn--l bl-btn--block${L >= 3 ? ' bl-btn--primary' : ''}`} disabled={L < 3} onClick={() => nav('/cab/stats')}>смотреть статистику</button>
          {L < 3 && <p className="bl-micro" style={{ textAlign: 'center' }}>статистика откроется, как только пойдут показы</p>}
        </section>
      </div>
    </div>
  )
}
