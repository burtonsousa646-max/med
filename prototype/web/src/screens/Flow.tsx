import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, Check as CheckIcon, Clock, Copy, FileText, Info, Loader2, MapPin, Plus, Send } from 'lucide-react'
import { $api, act, kop, newKey, queryClient, toKop, useBalance, useCampaign, useCatalog, useCompany, useLater, useMember, useOfferType, type Campaign } from '../api'
import { ReachMap } from '../mock'
import { Trend } from '../charts'
import { Brand, Check, Chip, Done, FlowHead, Highlight, Num, Segmented, Switch, TypeTag, copy, gap, logoUrl, n, rub, toast } from '../ui'
import { startType } from './Entry'

export const useId = () => Number(useParams().id)
const SEGMENTS = [['small', 'малый бизнес'], ['medium', 'средний бизнес'], ['large', 'крупный бизнес']] as const
const SEG_HINT = { small: 'начнём с автопилота: выберете цель, остальное соберём сами', medium: 'откроем ручную настройку: сигналы, условия и места показа', large: 'подготовим медиаплан для согласования и подключим менеджера' }

/** Сколько доплатить при запуске: месячный бюджет минус то, что уже на балансе, но не меньше минимального пополнения. */
function useNeed(c: Campaign) {
  const T = useOfferType(c.type), b = useBalance()
  if (T.share || c.payMethod === 'post') return 0
  const need = kop(c.budgetMonthKop) - kop(b.availableKop)
  return need > 0 ? Math.max(need, 1000) : 0
}

/* Согласия и проверка компании */
export function Consent() {
  const nav = useNavigate()
  const { data: co } = $api.useSuspenseQuery('get', '/cabinet/company', {}, { refetchInterval: q => (q.state.data?.kycStatus === 'pending' ? 2000 : false) })
  const give = $api.useMutation('post', '/cabinet/company/consents', act)
  const revoke = $api.useMutation('delete', '/cabinet/company/consents/{kind}', act)
  const add = $api.useMutation('post', '/cabinet/company/points', act)
  const create = $api.useMutation('post', '/cabinet/campaigns', act)
  const [adding, setAdding] = useState(false)
  const [addr, setAddr] = useState('')
  const has = (k: string) => co.consents.some(c => c.kind === k)
  const toggle = (kind: 'company' | 'signer' | 'profile') => (v: boolean) => v ? give.mutate({ body: { kind } }) : revoke.mutate({ params: { path: { kind } } })
  const ok = has('company') && has('signer')
  const signer = co.members.find(m => m.signer)
  const addPoint = () => {
    if (addr.trim().length < 5) return
    add.mutateAsync({ body: { addr: addr.trim() } }).then(() => { toast(`Точка «${addr.trim()}» добавлена`); setAddr(''); setAdding(false) })
  }
  const start = () => create.mutateAsync({ body: { type: startType() } }).then(c => { sessionStorage.removeItem('startType'); nav(`/c/${c.id}/reach`) })
  return (
    <div className="bl-page wrap">
      <header className="flow-head"><Brand /></header>
      <div className="page-title">
        <div className="bl-stack" style={gap('8px')}>
          {co.kycStatus === 'verified' && <span className="bl-tag bl-tag--soft-green" style={{ alignSelf: 'flex-start' }}><Done size={14} /> компания проверена по ЕГРЮЛ</span>}
          {co.kycStatus === 'pending' && <span className="bl-tag" style={{ alignSelf: 'flex-start' }}><Loader2 size={14} className="spin" /> проверяем компанию по ЕГРЮЛ</span>}
          <h1 className="bl-h1">проверьте, что это вы</h1>
        </div>
      </div>
      {co.kycStatus === 'rejected' && <div className="bl-notice bl-notice--error"><AlertTriangle size={18} /><span>Не получилось проверить компанию: {co.kycReason}. Запуск рекламы недоступен — напишите в поддержку.</span></div>}
      <div className="two">
        <section className="bl-section pad bl-stack" style={gap('24px')}>
          <div><h2 className="bl-h3">{co.name}</h2>{(co.brand || co.site) && <p className="bl-caption" style={{ marginTop: 4 }}>{[co.brand, co.site].filter(Boolean).join(' · ')}</p>}</div>
          <dl className="kv">
            <dt>ИНН / КПП</dt><dd>{co.inn}{co.kpp && ` / ${co.kpp}`}</dd>
            {co.ogrn && <><dt>ОГРН</dt><dd>{co.ogrn}</dd></>}
            {co.address && <><dt>адрес</dt><dd>{co.address}</dd></>}
            <dt>подписант</dt><dd>{signer ? `${signer.name}${signer.title ? `, ${signer.title}` : ''}` : 'войдёт через бизнес-ID'}</dd>
            {co.bank && <><dt>расчётный счёт</dt><dd>{co.bank.bank} · {co.bank.account}</dd></>}
          </dl>
          <div>
            <div className="bl-field__label" style={{ marginBottom: 8 }}>точки продаж</div>
            {co.points.map(pt => (
              <div key={pt.id} className="bl-cell"><span className="bl-cell__icon"><MapPin size={18} /></span><span className="bl-cell__main"><span className="bl-cell__title">{pt.addr}</span>{pt.normalized && <span className="bl-cell__sub" style={{ display: 'block' }}>{pt.normalized}</span>}</span></div>
            ))}
            {!co.points.length && <p className="bl-caption">Добавьте хотя бы одну точку: от неё посчитаем охват.</p>}
          </div>
          {adding ? (
            <div className="bl-row" style={{ alignItems: 'flex-end' }}>
              <label className="bl-field" style={{ flex: 1, minWidth: 220 }}><span className="bl-field__label">адрес точки</span><input className="bl-input" value={addr} onChange={e => setAddr(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPoint()} placeholder="ул. Таганская, 3" autoFocus /></label>
              <button className="bl-btn bl-btn--dark bl-btn--l" onClick={addPoint} disabled={addr.trim().length < 5 || add.isPending}>добавить</button>
              <button className="bl-btn bl-btn--ghost" onClick={() => setAdding(false)}>отмена</button>
            </div>
          ) : <button className="bl-btn bl-btn--s" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}><Plus size={16} />добавить точку</button>}
        </section>
        <section className="bl-section pad bl-stack sticky" style={gap('20px')}>
          <h2 className="bl-h3">что возьмём и зачем</h2>
          <Check checked={has('company')} onChange={toggle('company')} label="данные компании" sub="реквизиты и адреса: заполнить оферту и посчитать охват по точкам" />
          <Check checked={has('signer')} onChange={toggle('signer')} label="данные подписанта" sub="ФИО и должность: чтобы оферту принял тот, кто вправе" />
          <Check checked={has('profile')} onChange={toggle('profile')} label="профиль абонента билайна" sub="по желанию: подскажем аудиторию по вашим интересам и районам" />
          <p className="bl-micro">Согласие можно отозвать в разделе «Компания». Данные не передаём третьим лицам.</p>
          {!ok && <p className="bl-caption bl-error" role="alert">Без данных компании и подписанта не сможем посчитать охват и оформить оферту.</p>}
          <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={!ok || !co.points.length || create.isPending} onClick={start}>показать охват</button>
        </section>
      </div>
    </div>
  )
}

/* Охват и прогноз */
export function Reach() {
  const id = useId(), c = useCampaign(id), co = useCompany(), T = useOfferType(c.type), member = useMember()
  const nav = useNavigate()
  const patch = $api.useMutation('patch', '/cabinet/campaigns/{id}', act)
  const patchCo = $api.useMutation('patch', '/cabinet/company', act)
  const point = $api.useMutation('patch', '/cabinet/company/points/{pointId}', act)
  const [budget, setBudget] = useLater(kop(c.budgetMonthKop), v => patch.mutate({ params: { path: { id } }, body: { budgetMonthKop: toKop(v) } }))
  const [segEdit, setSegEdit] = useState(false)
  const f = c.forecast, click = c.type === 'click'
  const on = co.points.filter(p => p.active).length
  const toggle = (pointId: number, active: boolean) => point.mutate({ params: { path: { pointId } }, body: { active } })
  const weeks = [0.2, 0.45, 0.72, 1].map((k, i) => ({ label: `${i + 1} неделя`, value: Math.round((click ? f.clicks : f.results) * k) }))
  const per = kop(f.perKop), spend = kop(f.spendKop)
  const stats: [string, number, string?][] = click
    ? [['клики', f.clicks], ['придут к вам', f.results], ['цена клика', kop(f.cpcKop), ' ₽'], ['один гость', f.results ? spend / f.results : 0, ' ₽']]
    : [[String(T.unit), f.results], [T.share ? 'выплатим вам' : 'потратите', T.share ? f.results * per : spend, ' ₽'], [String(T.per), per, ' ₽'], ['охват', f.reach]]
  return (
    <div className="bl-page wrap">
      <FlowHead step={0} id={id} />
      <div className="page-title">
        <div className="bl-stack" style={gap('12px')}>
          <div className="bl-row"><TypeTag c={c} /><span className="bl-tag">{SEGMENTS.find(s => s[0] === co.segment)![1]}</span>{member?.role === 'owner' && <button className="bl-btn bl-btn--ghost bl-caption" onClick={() => setSegEdit(!segEdit)}>{segEdit ? 'готово' : 'неверно? изменить'}</button>}</div>
          {segEdit && <Segmented label="Размер бизнеса" value={co.segment} options={SEGMENTS.map(s => [s[0], s[1]])} onChange={v => patchCo.mutate({ body: { segment: v } })} />}
          <h1 className="bl-h1">рядом с {on > 1 ? 'вашими точками' : 'вашей точкой'} <span className="hl"><Num value={f.reach} /></span> подходящих людей</h1>
          <p className="bl-body bl-secondary">{SEG_HINT[co.segment]}</p>
        </div>
      </div>
      <div className="two">
        <section className="bl-section pad bl-stack" style={gap('16px')}>
          <div className="bl-row">
            {co.points.map(p => <Chip key={p.id} on={p.active} onClick={() => toggle(p.id, !p.active)}><MapPin size={16} />{p.addr}</Chip>)}
          </div>
          <div className="map"><ReachMap points={co.points} onToggle={pid => toggle(pid, !co.points.find(p => p.id === pid)!.active)} /><span className="bl-pill-dark map__legend">радиус {((c.targeting.radiusM ?? 1000) / 1000).toLocaleString('ru-RU')} км · живут и работают рядом</span></div>
          <p className="bl-caption">Нажмите на точку, чтобы исключить её. Хотя бы одна точка остаётся в рекламе.</p>
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
          <p className="bl-micro">Прогноз по местам показа и охвату вокруг ваших точек. {click ? 'Списываем только за клики' : `Вы платите ${T.pay}`}, остановить можно в любой момент.</p>
          <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" onClick={() => nav(`/c/${id}/build`)}>{click ? 'собрать кампанию' : 'задать условия'}</button>
        </section>
      </div>
    </div>
  )
}

/* Оплата и запуск */
const approvalKey = (id: number) => `approval:${id}`
export function Checkout() {
  const id = useId(), c = useCampaign(id), co = useCompany(), cat = useCatalog(), T = useOfferType(c.type), member = useMember(), b = useBalance()
  const nav = useNavigate()
  const patch = $api.useMutation('patch', '/cabinet/campaigns/{id}', act)
  const submit = $api.useMutation('post', '/cabinet/campaigns/{id}/submit', act)
  const [offer, setOffer] = useState(false)
  const [key] = useState(newKey)
  const signer = !!member?.signer, accepted = co.offerVersion === co.currentOfferVersion
  const need = useNeed(c), method = c.payMethod ?? 'sbp'
  const sent = c.status === 'approval'
  const approvalUrl = sessionStorage.getItem(approvalKey(id))
  const boss = co.members.find(m => m.signer)
  const canGo = co.kycStatus === 'verified' && (accepted || offer || !signer) && !submit.isPending && c.status === 'draft'

  const go = async () => {
    const r = await submit.mutateAsync({ params: { path: { id } }, body: { acceptOffer: signer ? true : undefined, payMethod: method, idempotencyKey: key } })
    if (r.approvalUrl) { sessionStorage.setItem(approvalKey(id), r.approvalUrl); return toast('Ссылка ушла руководителю на почту') }
    if (r.payment?.confirmUrl) return location.assign(r.payment.confirmUrl) // страница банка, потом вернёт на запуск
    toast(r.payment?.invoice ? `Счёт ${r.payment.invoice.number} в документах. Запустим после зачисления` : 'Отправили на проверку')
    nav(`/c/${id}/launch`)
  }
  const button = !need ? (T.share ? 'принять оферту и запустить' : 'запустить') : method === 'invoice' ? `выставить счёт на ${rub(need)}` : `оплатить ${rub(need)} и запустить`
  return (
    <div className="bl-page wrap">
      <FlowHead step={2} id={id} />
      <div className="page-title"><h1 className="bl-h1">оплата и запуск</h1></div>
      {co.kycStatus !== 'verified' && <div className="bl-notice"><Info size={18} />Запуск откроется после проверки компании по ЕГРЮЛ{co.kycReason ? `: ${co.kycReason}` : ''}.</div>}
      <div className="two">
        <div className="bl-stack" style={gap('24px')}>
          <section className="bl-section pad bl-stack" style={gap('16px')}>
            <h2 className="bl-h3">реквизиты</h2>
            <p className="bl-body">{co.name}, ИНН {co.inn}{co.bank && ` · ${co.bank.bank}`}<span className="bl-caption" style={{ display: 'block' }}>{boss ? `подписант ${boss.name}` : 'подписант войдёт через бизнес-ID'}</span></p>
          </section>
          {T.share ? (
            <section className="bl-section pad bl-stack" style={gap('16px')}>
              <h2 className="bl-h3">выплаты вам</h2>
              <p className="bl-body">Пополнять баланс не нужно. Клиент платит билайну, а мы перечисляем вам <b className="bl-medium">{rub(kop(c.forecast.perKop))}</b> {c.type === 'coupon' ? 'за каждый погашенный купон' : 'за каждый оплаченный месяц подписки'}.</p>
              <p className="bl-caption">Комиссию {T.feePct} % удерживаем из выплаты. Отчёт агента придёт вместе с актом.</p>
            </section>
          ) : <>
            <section className="bl-section pad bl-stack" style={gap('16px')}>
              <h2 className="bl-h3">деньги</h2>
              <p className="bl-body">бюджет на месяц <b className="bl-medium">{rub(kop(c.budgetMonthKop))}</b> · на балансе <b className="bl-medium">{rub(kop(b.availableKop))}</b></p>
              <p className="bl-body">{need ? <>к оплате сейчас <b className="bl-medium">{rub(need)}</b> — недостающее до месячного бюджета</> : 'денег на балансе хватает, доплачивать не нужно'}{!b.operations.some(o => o.kind === 'topup') && <span className="bl-success"> · +{rub(kop(cat.settings.firstBonusKop))} бонус за первую оплату</span>}</p>
            </section>
            {need > 0 && <section className="bl-section pad bl-stack" style={gap('16px')}>
              <h2 className="bl-h3">способ оплаты</h2>
              <div className="bl-row">{cat.payMethods.map(m => <Chip key={m.id} on={method === m.id} onClick={m.largeOnly && co.segment !== 'large' ? undefined : () => patch.mutate({ params: { path: { id } }, body: { payMethod: m.id } })}>{m.name}</Chip>)}</div>
              <p className="bl-caption">{cat.payMethods.find(x => x.id === method)?.hint}{co.segment !== 'large' && ' · постоплата — для крупного бизнеса'}</p>
            </section>}
          </>}
        </div>
        <section className="bl-section pad bl-stack sticky" style={gap('16px')}>
          <h2 className="bl-h3">кампания</h2>
          <dl className="kv kv--narrow">
            <dt>тип</dt><dd>{T.t}</dd>
            <dt>{c.type === 'click' ? 'кампания' : 'оффер'}</dt><dd>{c.name}</dd>
            {c.type !== 'click' && <><dt>условия</dt><dd>{c.deal.line}</dd></>}
            <dt>точки</dt><dd>{co.points.filter(x => x.active).length} из {co.points.length}</dd>
            <dt>места</dt><dd>{cat.placements.filter(p => c.placements.includes(p.id)).map(p => p.name).join(', ')}</dd>
            <dt>к оплате</dt><dd className="bl-h3">{T.share ? 'без предоплаты' : rub(need)}</dd>
          </dl>
          {c.moderation?.hits.length ? <div className="bl-notice bl-notice--error"><AlertTriangle size={18} /><span>В тексте есть слово, которое не пройдёт проверку. <Link to={`/c/${id}/build`}>Исправить сейчас</Link> или поправите на шаге запуска.</span></div> : null}
          <hr className="bl-divider" />
          {signer ? (
            <>
              {!accepted && <Check checked={offer} onChange={setOffer} label={<>принимаю <Link to="/offer" target="_blank">оферту</Link></>} sub={`версия ${co.currentOfferVersion} · договор и ЭДО не нужны`} />}
              <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={!canGo} onClick={go}>{submit.isPending ? <Loader2 size={20} className="spin" /> : button}</button>
              {!accepted && !offer && <p className="bl-micro" style={{ textAlign: 'center' }}>отметьте оферту, чтобы продолжить</p>}
            </>
          ) : sent ? (
            <>
              <div className="bl-notice bl-notice--success"><Send size={18} /><span>Ссылка ушла руководителю на почту. Как только подтвердит{T.share ? '' : ' и оплатит'}, кампания запустится.</span></div>
              {approvalUrl && <span className="bl-row track-code"><code>{approvalUrl}</code><button className="bl-icon-btn bl-icon-btn--s" aria-label="Скопировать ссылку" onClick={() => copy(approvalUrl, 'Адрес')}><Copy size={16} /></button></span>}
            </>
          ) : (
            <>
              <div className="bl-notice"><Info size={18} /><span>Оферту принимает руководитель{boss ? `: ${boss.name}` : ''}. Отправим ссылку, подтвердит через бизнес-ID.</span></div>
              <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={!canGo} onClick={go}>отправить на подтверждение</button>
            </>
          )}
          {['draft'].includes(c.status) && <Link className="bl-btn bl-btn--ghost" to={`/c/${id}/build`} style={{ alignSelf: 'center' }}>изменить кампанию</Link>}
          {!['draft', 'approval'].includes(c.status) && <Link className="bl-btn" to={`/c/${id}/launch`} style={{ alignSelf: 'center' }}>статус запуска</Link>}
        </section>
      </div>
    </div>
  )
}

/* Подтверждение руководителем по ссылке: вход подписантом той же компании, затем запуск */
export function Approve() {
  const token = useParams().token!
  const nav = useNavigate()
  const q = $api.useQuery('get', '/cabinet/approvals/{token}', { params: { path: { token } } }, { retry: false })
  const confirm = $api.useMutation('post', '/cabinet/approvals/{token}/confirm', act)
  const [key] = useState(newKey)
  const c = q.data
  const run = async () => {
    const r = await confirm.mutateAsync({ params: { path: { token } }, body: { acceptOffer: true, idempotencyKey: key } })
    if (r.payment?.confirmUrl) return location.assign(r.payment.confirmUrl)
    queryClient.invalidateQueries()
    nav(`/c/${r.campaign.id}/launch`)
  }
  return (
    <div className="bl-page">
      <div className="phone"><div className="phone__in">
        <div className="bl-row" style={{ justifyContent: 'space-between' }}><img className="bl-logo bl-logo--s" src={logoUrl} alt="билайн" width={32} height={32} /><span className="bl-caption">рекламная платформа</span></div>
        <AnimatePresence mode="wait">
          {q.isPending ? <div key="wait" className="bl-skeleton" style={{ height: 240, marginTop: 32 }} />
            : q.isError || !c ? (
              <motion.div key="err" className="bl-stack" style={{ ...gap('16px'), marginTop: 32 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h1 className="bl-h2">не получилось открыть ссылку</h1>
                <p className="bl-body bl-secondary">{(q.error as { message?: string } | null)?.message ?? 'попробуйте ещё раз'}</p>
                <Link className="bl-btn bl-btn--block" to="/cab/campaigns">в кабинет</Link>
              </motion.div>
            ) : (
              <motion.div key="confirm" className="bl-stack" style={{ ...gap('16px'), flex: 1 }} exit={{ opacity: 0, x: -24 }}>
                <h1 className="bl-h2" style={{ marginTop: 16 }}>сотрудник просит подтвердить запуск рекламы</h1>
                <div className="bl-card bl-card--white">
                  <dl className="kv kv--stack"><dt>кампания</dt><dd>{c.name}</dd><dt>условия</dt><dd>{c.deal.line}</dd><dt>бюджет</dt><dd className="bl-h3">{rub(kop(c.budgetMonthKop))} в месяц</dd></dl>
                  <Link to="/offer" target="_blank" className="bl-caption">текст оферты</Link>
                </div>
                <p className="bl-caption">Подтверждая, вы принимаете оферту от имени компании. Если на балансе не хватит денег, откроем оплату недостающего.</p>
                <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" style={{ marginTop: 'auto' }} disabled={confirm.isPending} onClick={run}>{confirm.isPending ? <><Loader2 size={20} className="spin" />подтверждаем…</> : 'подтвердить и запустить'}</button>
              </motion.div>
            )}
        </AnimatePresence>
      </div></div>
    </div>
  )
}

/* Проверка, маркировка и запуск */
export function Launch() {
  const id = useId(), c = useCampaign(id), co = useCompany(), T = useOfferType(c.type)
  const nav = useNavigate()
  const patch = $api.useMutation('patch', '/cabinet/campaigns/{id}', act)
  const patchCo = $api.useMutation('patch', '/cabinet/company', act)
  const mod = c.moderation, cr = c.creative!, hit = mod?.status === 'rejected' || mod?.status === 'preview' ? mod.hits[0] : undefined
  const live = c.status === 'live' || c.status === 'paused'
  const waitPay = c.status === 'invoice'
  const checked = cr.status === 'approved' || !!c.liveCreative, marked = !!c.liveCreative
  const fix = () => hit && patch.mutate({ params: { path: { id } }, body: { adText: cr.adText.replace(hit.word, hit.fix) } })
  const notify = (k: 'sms' | 'mail' | 'tg') => (v: boolean) => patchCo.mutate({ body: { notify: { ...co.notify, [k]: v } } })
  const rows = [
    ...(c.payment && !T.share ? [{ done: c.payment.status === 'succeeded', wait: waitPay, t: waitPay ? (c.payment.method === 'invoice' ? 'ждём оплату по счёту' : 'ждём оплату') : 'оплата получена', sub: c.payment.method === 'invoice' ? 'обычно 1–3 рабочих дня' : rub(kop(c.payment.amountKop)) }] : []),
    { done: checked, wait: !waitPay && c.status === 'moderation' && !checked, t: checked ? 'проверено' : mod?.status === 'queued' ? 'на ручной проверке' : 'проверка текста и картинки', sub: mod?.status === 'queued' ? 'ответ модератора — обычно до 24 часов' : 'закон «О рекламе», правила площадок' },
    { done: marked, wait: checked && !marked, t: 'маркировка', sub: marked ? `erid ${c.liveCreative!.erid} присвоен, данные в ОРД переданы` : 'присвоим erid и передадим данные в ОРД' },
    { done: live, wait: marked && !live, t: 'показывается', sub: live ? 'участвует в аукционе на выбранных местах показа' : 'старт в аукционе сразу после маркировки' },
  ]
  if (c.status === 'draft' || c.status === 'approval') {
    return (
      <div className="bl-page wrap"><FlowHead step={3} id={id} />
        <section className="bl-section pad bl-stack" style={{ ...gap('16px'), marginTop: 32, maxWidth: 640 }}>
          <h1 className="bl-h2">{c.status === 'approval' ? 'ждём подтверждения руководителя' : 'кампания ещё не запущена'}</h1>
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
        <h1 className="bl-h1">{live ? 'кампания запущена' : c.status === 'rejected' ? 'одна правка, и запускаем' : waitPay ? 'ждём оплату' : 'проверяем и запускаем'}</h1>
        {live && <motion.span className="bl-tag bl-tag--success" initial={{ scale: 0.6 }} animate={{ scale: 1 }}>{c.status === 'paused' ? 'на паузе' : 'показывается'}</motion.span>}
      </div>
      <div className="two">
        <section className="bl-section pad bl-stack" style={gap('16px')}>
          <h2 className="bl-h3">текст объявления</h2>
          <p className="bl-body-l"><Highlight text={cr.adText} word={hit?.word} /></p>
          {c.status === 'rejected' ? (
            <div className="bl-notice bl-notice--error">
              <AlertTriangle size={18} />
              <div className="bl-stack" style={gap('8px')}>
                <span>{mod?.reason}</span>
                {hit && <span>Предлагаем: <b className="bl-medium">«{hit.fix}»</b></span>}
                <div className="bl-row">{hit && <button className="bl-btn bl-btn--primary" onClick={fix}>заменить и отправить</button>}<Link className="bl-btn" to={`/c/${id}/build`}>переписать текст</Link></div>
              </div>
            </div>
          ) : checked ? <div className="bl-notice bl-notice--success"><CheckIcon size={18} />Текст и картинка соответствуют закону «О рекламе».</div> : null}
          {c.liveCreative && cr.status === 'moderation' && <p className="bl-caption">Новая версия текста на проверке. До решения показывается прошлая.</p>}
          {c.liveCreative && cr.status === 'rejected' && <div className="bl-notice"><AlertTriangle size={18} /><span>Новая версия не прошла: {mod?.reason}. Показывается прошлая.</span></div>}
          <hr className="bl-divider" />
          <h2 className="bl-h3">уведомления</h2>
          <div className="bl-row" style={gap('24px')}><Switch checked={co.notify.sms} onChange={notify('sms')} label="SMS" /><Switch checked={co.notify.mail} onChange={notify('mail')} label="почта" /><Switch checked={co.notify.tg} onChange={notify('tg')} label="Telegram" /></div>
          <p className="bl-caption">Напишем, когда пойдут показы, когда текст не пройдёт проверку и когда баланс будет заканчиваться.</p>
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
          {waitPay && c.payment?.confirmUrl && <button className="bl-btn bl-btn--primary" onClick={() => location.assign(c.payment!.confirmUrl!)}>перейти к оплате</button>}
          {waitPay && c.payment?.method === 'invoice' && <Link className="bl-btn" to="/cab/docs">счёт в документах</Link>}
          <button className={`bl-btn bl-btn--l bl-btn--block${live ? ' bl-btn--primary' : ''}`} disabled={!live} onClick={() => nav(`/cab/stats/${id}`)}>смотреть статистику</button>
          {!live && <p className="bl-micro" style={{ textAlign: 'center' }}>статистика откроется, как только кампания запустится</p>}
        </section>
      </div>
    </div>
  )
}
