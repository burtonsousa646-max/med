import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { ArrowLeft, Building2, ClipboardList, Clock, Loader2, Mail, MousePointerClick, Repeat, Sparkles, Ticket, TicketPercent, type LucideIcon } from 'lucide-react'
import { Brand, Check, Chip, DemoNote, Done, toast } from '../ui'
import { Creative } from '../creative'
import { LoginAside } from './Entry'
import { rub } from '../data'

/* MVP: только фронт, без API. Лендинг v2 (/mvp) → вход по почте и ИНН → запуск кампании с промокодом.
   Что ввёл партнёр, живёт в sessionStorage вкладки: закрыл вкладку — начал заново. */

type Me = { email: string; inn: string; company: string; addr: string }
type Promo = { code: string; off: string; cond: string; site: string; till: string; fee: string; check: string; via: string }

const read = <T,>(k: string): T | null => { try { return JSON.parse(sessionStorage.getItem(`mvp-${k}`) ?? 'null') } catch { return null } }
const write = (k: string, v: unknown) => { try { v == null ? sessionStorage.removeItem(`mvp-${k}`) : sessionStorage.setItem(`mvp-${k}`, JSON.stringify(v)) } catch { /* приватное окно: живём без сохранения */ } }

/* ───────── вход: почта → код → ИНН ───────── */
const PERKS = ['без пароля: код придёт на почту', 'компанию найдём по ИНН сами', 'договор не нужен: оферта галочкой при запуске']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function MvpLogin() {
  const nav = useNavigate()
  const [step, setStep] = useState<'email' | 'code' | 'inn'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [inn, setInn] = useState('')
  const [found, setFound] = useState<Omit<Me, 'email' | 'inn'> | null>(null)
  const innOk = inn.length === 10 || inn.length === 12
  // ponytail: поиск по ИНН — заглушка; в бою DaData/ФНС по ИНН, проверка контрольной суммы там же
  useEffect(() => {
    setFound(null)
    if (!innOk) return
    const t = setTimeout(() => setFound(inn.length === 10
      ? { company: 'ООО «Зерно»', addr: 'Москва, ул. Покровка, 12 · КПП 770101001' }
      : { company: 'ИП, кофейня «Зерно»', addr: 'Москва · ОГРНИП 324770000012345' }), 700)
    return () => clearTimeout(t)
  }, [inn, innOk])
  const confirm = () => { write('me', { email, inn, ...found }); nav('/mvp/new') }

  const head: Record<typeof step, [string, ReactNode]> = {
    email: ['вход в кабинет', 'Пароль не нужен — пришлём код на почту. Новых партнёров зарегистрируем сами.'],
    code: ['проверьте почту', <>Отправили код на <b className="bl-medium">{email}</b>. Письмо идёт до минуты.</>],
    inn: ['ваша компания', 'ИНН нужен для оферты и маркировки рекламы. Реквизиты подтянем из ЕГРЮЛ.'],
  }
  return (
    <div className="login">
      <div className="login__form">
        <header className="login__head"><Brand to="/mvp" /><Link className="bl-btn bl-btn--ghost" to="/mvp"><ArrowLeft size={18} />на главную</Link></header>
        <motion.main key={step} className="login__body bl-stack" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <ol className="mvp-dots" aria-label={`шаг ${['email', 'code', 'inn'].indexOf(step) + 1} из 3`}>
            {(['email', 'code', 'inn'] as const).map((s, i) => <li key={s} className={i <= ['email', 'code', 'inn'].indexOf(step) ? 'is-on' : ''} />)}
          </ol>
          <div className="bl-stack" style={{ ['--bl-gap' as string]: '8px' }}>
            <h1 className="bl-h1">{head[step][0]}</h1>
            <p className="bl-body bl-secondary">{head[step][1]}</p>
          </div>

          {step === 'email' && (
            <form className="bl-stack" style={{ ['--bl-gap' as string]: '12px' }} onSubmit={e => { e.preventDefault(); if (EMAIL.test(email)) setStep('code') }}>
              <label className="bl-field">
                <span className="bl-field__label">рабочая почта</span>
                <input className="bl-input" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value.trim())} placeholder="hello@mycoffee.ru" autoFocus />
              </label>
              <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={!EMAIL.test(email)}>получить код</button>
            </form>
          )}

          {step === 'code' && (
            <form className="bl-stack" style={{ ['--bl-gap' as string]: '12px' }} onSubmit={e => { e.preventDefault(); if (code.length === 6) setStep('inn') }}>
              <label className="bl-field">
                <span className="bl-field__label">код из письма</span>
                <input className="bl-input mvp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} placeholder="000000" autoFocus
                  onChange={e => { const v = e.target.value.replace(/\D/g, ''); setCode(v); if (v.length === 6) setStep('inn') }} />
              </label>
              <DemoNote>подойдут любые 6 цифр</DemoNote>
              <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={code.length < 6}>подтвердить</button>
              <button type="button" className="bl-btn bl-btn--ghost bl-caption" style={{ alignSelf: 'flex-start' }} onClick={() => { setCode(''); setStep('email') }}>изменить почту</button>
            </form>
          )}

          {step === 'inn' && (
            <div className="bl-stack" style={{ ['--bl-gap' as string]: '12px' }}>
              <label className={`bl-field${inn.length > 10 && !innOk ? ' is-error' : ''}`}>
                <span className="bl-field__label">ИНН компании или ИП</span>
                <input className="bl-input" inputMode="numeric" maxLength={12} value={inn} onChange={e => setInn(e.target.value.replace(/\D/g, ''))} placeholder="10 цифр у компании, 12 у ИП" autoFocus />
                {inn.length > 10 && !innOk && <span className="bl-field__caption">у ИП в ИНН 12 цифр</span>}
              </label>
              {innOk && !found && <p className="bl-caption mvp-wait" role="status"><Loader2 size={16} className="spin" />ищем в ЕГРЮЛ</p>}
              {found && (
                <motion.div className="mvp-found" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                  <Building2 size={22} aria-hidden="true" />
                  <span><b className="bl-medium">{found.company}</b><span className="bl-caption" style={{ display: 'block' }}>ИНН {inn} · {found.addr}</span></span>
                </motion.div>
              )}
              <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={!found} onClick={confirm}>это моя компания</button>
            </div>
          )}
        </motion.main>
      </div>
      <LoginAside perks={PERKS} />
    </div>
  )
}

/* ───────── шапка кабинета MVP ───────── */
function useMe() { return read<Me>('me') }

function Head() {
  const me = useMe()!, nav = useNavigate()
  return (
    <header className="bl-header">
      <div className="bl-header__side"><Brand to="/mvp" /></div>
      <div className="bl-row mvp-me">
        <span className="bl-caption"><b className="bl-medium" style={{ color: 'var(--color-text-primary)' }}>{me.company}</b><br />{me.email}</span>
        <button className="bl-btn bl-btn--s" onClick={() => { write('me', null); write('promo', null); nav('/mvp') }}>выйти</button>
      </div>
    </header>
  )
}

/* ───────── шаг 1: тип кампании, как «новая кампания» в Директе ───────── */
const TYPES: { id: string; t: string; d: string; icon: LucideIcon; on?: boolean }[] = [
  { id: 'promo', t: 'промокод на покупку', d: 'Абонент получает ваш код и покупает со скидкой. Платите процент только с оплаченных покупок.', icon: TicketPercent, on: true },
  { id: 'click', t: 'клиенты на сайт', d: 'Приведём абонентов на сайт или в Карты, оплата за переход.', icon: MousePointerClick },
  { id: 'coupon', t: 'купон со скидкой', d: 'Клиент покупает купон в приложении и гасит у вас на кассе.', icon: Ticket },
  { id: 'lead', t: 'заявки', d: 'Имя и телефон клиента — в почту или CRM, оплата за заявку.', icon: ClipboardList },
  { id: 'sub', t: 'подписка на сервис', d: 'Оплата со счёта телефона каждый месяц, вам — доля платежа.', icon: Repeat },
]

function Guard({ children }: { children: ReactNode }) {
  return useMe() ? <>{children}</> : <Navigate to="/mvp/login" replace />
}

export function MvpNew() {
  const nav = useNavigate()
  return (
    <Guard>
      <div className="bl-page wrap">
        <Head />
        <section className="bl-section bl-section--wide mvp-sheet">
          <span className="bl-tag bl-tag--soft-violet">можно без опыта</span>
          <h1 className="bl-h1">новая кампания</h1>
          <p className="bl-lead">Покажем ваше предложение абонентам билайна рядом с вами: в витрине «лучшее рядом», в приложении и пушах.</p>
          <div className="mvp-types">
            {TYPES.map(({ id, t, d, icon: Icon, on }) => (
              <button key={id} className={`mvp-type${on ? ' is-on' : ''}`} aria-disabled={!on}
                onClick={() => on ? nav(`/mvp/new/${id}`) : toast(`«${t}» ещё в разработке. Пока доступен промокод`)}>
                <span className="mvp-type__top"><span className="bl-h4">{t}</span>{!on && <span className="bl-tag">в разработке</span>}</span>
                <span className="bl-caption">{d}</span>
                <span className="mvp-type__icon"><Icon size={on ? 40 : 32} strokeWidth={1.6} aria-hidden="true" /></span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </Guard>
  )
}

/* ───────── шаг 2: оффер промокода, оферта и запуск ───────── */
const VIA = ['файл раз в неделю', 'постбэк', 'коннектор 1С']
const inDays = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10)
// «ИИ» подставляет условия по сфере компании; в бою — модель по ОКВЭД и среднему чеку отрасли
const SUGGEST: Promo = { code: 'ZERNO15', off: '15', cond: 'на первый заказ от 800 ₽', site: 'zerno-coffee.ru', till: inDays(30), fee: '8', check: '1200', via: VIA[0] }

const errors = (p: Promo) => ({
  code: /^[A-ZА-ЯЁ0-9]{4,20}$/.test(p.code) ? '' : 'от 4 до 20 букв и цифр, без пробелов',
  off: +p.off >= 1 && +p.off <= 90 ? '' : 'от 1 до 90 %',
  site: /\S+\.\S{2,}/.test(p.site) ? '' : 'сайт, где сработает код',
  till: p.till > inDays(0) ? '' : 'дата в будущем',
  fee: +p.fee >= 3 && +p.fee <= 50 ? '' : 'от 3 до 50 %',
  check: +p.check > 0 ? '' : 'сумма в рублях',
})

function Field({ label, err, wide, children }: { label: string; err?: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`bl-field${err ? ' is-error' : ''}${wide ? ' is-wide' : ''}`}>
      <span className="bl-field__label">{label}</span>
      {children}
      {err && <span className="bl-field__caption">{err}</span>}
    </label>
  )
}

const creative = (me: Me, p: Promo) => ({ mark: me.company.replace(/^.*«(.+)»$/, '$1'), big: `−${+p.off || 0}%`, small: p.cond || 'по промокоду на сайте', tone: 'violet' as const, img: 'own-2', cat: 'food' as const })

export function MvpPromo() {
  const me = useMe(), nav = useNavigate()
  const [p, setP] = useState<Promo>(() => read<Promo>('promo') ?? SUGGEST)
  const [agree, setAgree] = useState(false)
  if (!me) return <Navigate to="/mvp/login" replace />
  const set = (k: keyof Promo, num?: boolean) => (e: { target: { value: string } }) =>
    setP({ ...p, [k]: num ? e.target.value.replace(/\D/g, '') : k === 'code' ? e.target.value.toUpperCase().replace(/\s/g, '') : e.target.value })
  const err = errors(p), ok = Object.values(err).every(x => !x)
  const save = +p.check * +p.off / 100, pay = +p.check * +p.fee / 100
  const launch = () => { write('promo', p); nav('/mvp/done') }
  return (
    <div className="bl-page wrap">
      <Head />
      <div className="mvp-title">
        <Link className="bl-btn bl-btn--ghost bl-caption" to="/mvp/new"><ArrowLeft size={16} />все форматы</Link>
        <h1 className="bl-h2">промокод на покупку</h1>
      </div>
      <div className="two mvp-promo">
        <section className="bl-section mvp-sheet">
          <p className="bl-caption mvp-ai"><Sparkles size={16} aria-hidden="true" />Заполнили по вашей сфере и среднему чеку — поправьте, если нужно.</p>
          <div className="terms mvp-terms">
            <Field label="промокод" err={err.code}><input className="bl-input" value={p.code} onChange={set('code')} maxLength={20} /></Field>
            <Field label="скидка, %" err={err.off}><input className="bl-input" inputMode="numeric" value={p.off} onChange={set('off', true)} maxLength={2} /></Field>
            <Field label="условие для клиента" wide><input className="bl-input" value={p.cond} onChange={set('cond')} placeholder="например, на первый заказ от 800 ₽" maxLength={60} /></Field>
            <Field label="сайт, где применить код" err={err.site} wide><input className="bl-input" value={p.site} onChange={set('site')} placeholder="mycoffee.ru" /></Field>
            <Field label="действует до" err={err.till}><input className="bl-input" type="date" value={p.till} min={inDays(1)} onChange={set('till')} /></Field>
            <Field label="средний чек, ₽" err={err.check}><input className="bl-input" inputMode="numeric" value={p.check} onChange={set('check', true)} maxLength={7} /></Field>
            <Field label="комиссия билайну, %" err={err.fee}><input className="bl-input" inputMode="numeric" value={p.fee} onChange={set('fee', true)} maxLength={2} /></Field>
          </div>
          <div className="bl-field">
            <span className="bl-field__label">как передадите заказы — нужны сумма и возвраты, без данных клиентов</span>
            <div className="bl-row">{VIA.map(v => <Chip key={v} on={p.via === v} onClick={() => setP({ ...p, via: v })}>{v}</Chip>)}</div>
          </div>
          <hr className="bl-divider" />
          <div className="mvp-go">
            <Check checked={agree} onChange={setAgree} label={<>Принимаю <Link to="/offer" target="_blank">оферту на размещение рекламы</Link></>} sub="маркировку и erid оформим сами" />
            <button className="bl-btn bl-btn--primary bl-btn--l" disabled={!ok || !agree} onClick={launch}>запустить</button>
          </div>
          {!ok && <p className="bl-caption bl-error" role="status">Проверьте поля, отмеченные красным</p>}
        </section>

        <aside className="bl-section mvp-sheet mvp-preview">
          <span className="bl-field__label">так увидит абонент в «лучшее рядом»</span>
          <Creative o={creative(me, p)} erid="реклама · erid после проверки" />
          <dl className="kv kv--narrow mvp-kv">
            <dt>клиент</dt><dd>экономит {rub(save)} с чека {rub(+p.check)}</dd>
            <dt>вы платите</dt><dd><b className="bl-medium">{rub(pay)}</b> с оплаченной покупки</dd>
            <dt>возвраты</dt><dd>не оплачиваете</dd>
          </dl>
        </aside>
      </div>
    </div>
  )
}

/* ───────── шаг 3: отправлено. Дальше — бэкофис: проверка, счёт на предоплату, запуск ───────── */
export function MvpDone() {
  const me = useMe(), p = read<Promo>('promo')
  if (!me) return <Navigate to="/mvp/login" replace />
  if (!p) return <Navigate to="/mvp/new" replace />
  const steps: [string, string, 'done' | 'now' | 'next'][] = [
    ['кампания отправлена', `промокод ${p.code}, −${p.off} % до ${new Date(p.till).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`, 'done'],
    ['проверка и маркировка', 'менеджер проверит условия и получит erid — обычно в течение рабочего дня', 'now'],
    ['счёт на предоплату', `пришлём на ${me.email}, из него списываем комиссию за покупки`, 'next'],
    ['показ абонентам', 'запустим сами после оплаты и напишем на почту', 'next'],
  ]
  return (
    <div className="bl-page wrap">
      <Head />
      <div className="two mvp-done">
        <section className="bl-section mvp-sheet">
          <span className="mvp-ok"><Done size={28} /></span>
          <h1 className="bl-h1">кампания на проверке</h1>
          <p className="bl-lead">Статус пришлём на {me.email}. Дальше ничего делать не нужно — только оплатить счёт.</p>
          <ol className="mvp-steps">
            {steps.map(([t, d, s]) => (
              <li key={t} className={`is-${s}`}>
                <span className="mvp-steps__dot">{s === 'done' ? <Done size={14} /> : s === 'now' ? <Clock size={14} /> : <Mail size={14} />}</span>
                <span><b className="bl-medium">{t}</b><span className="bl-caption" style={{ display: 'block' }}>{d}</span></span>
              </li>
            ))}
          </ol>
          <div className="bl-row">
            <Link className="bl-btn bl-btn--dark" to="/mvp/new">создать ещё кампанию</Link>
            <Link className="bl-btn" to="/mvp/new/promo">изменить условия</Link>
          </div>
        </section>
        <aside className="bl-section mvp-sheet mvp-preview">
          <span className="bl-field__label">креатив</span>
          <Creative o={creative(me, p)} erid="erid появится после проверки" />
        </aside>
      </div>
    </div>
  )
}
