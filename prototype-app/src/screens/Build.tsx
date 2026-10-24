import { useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, Check as CheckIcon, Download, FileDown, Image as ImageIcon, PenLine, Plus, Sparkles, X } from 'lucide-react'
import { CO, GOALS, IMAGES, PLACES, SIGNALS, VALUE, n, rub, stopHit, type GoalId } from '../data'
import { activePoints, adText, audience, deal, forecast, modeOf, tabOf, typeOf, update, useStore, type Bucket, type State, type Tab } from '../store'
import { PhoneSurface, type Ad } from '../mock'
import { Bars } from '../charts'
import { Chip, Done, FlowHead, Num, Segmented, TypeTag, toast } from '../ui'

const gap = (v: string) => ({ ['--bl-gap' as string]: v })
const TABS: [Tab, string][] = [['auto', 'автопилот'], ['manual', 'вручную'], ['plan', 'медиаплан'], ['special', 'спецпроект']]

export function adOf(s: State): Ad {
  const pts = activePoints(s)
  const d = deal(s)
  return { brand: CO.brand, text: adText(s), offer: d.offer, img: s.img, addr: pts[0] ? `${pts[0].addr} · 300 м` : undefined, cta: s.otype === 'click' ? undefined : d.cta }
}

// Условия оффера для купона, заявки, промокода и подписки. У перехода условий нет: платит за клик.
function Terms() {
  const s = useStore()
  const T = typeOf(s), t = s.terms[s.otype]
  const set = (k: string, v: string) => update(x => { x.terms[x.otype][k] = v; x.adText = null })
  return (
    <section className="bl-section bl-section--wide pad" style={{ marginBottom: 24 }}>
      <div className="bl-row" style={{ justifyContent: 'space-between', marginBottom: 16 }}><h2 className="bl-h3">условия оффера</h2><span className="bl-caption">{deal(s).line}</span></div>
      <div className="terms">
        {T.fields.map(f => (
          <label key={f.k} className={`bl-field${f.wide ? ' is-wide' : ''}${f.num && !(+t[f.k] > 0) ? ' is-error' : ''}`}>
            <span className="bl-field__label">{f.label}{f.suffix ? `, ${f.suffix}` : ''}</span>
            <input className="bl-input" inputMode={f.num ? 'numeric' : undefined} value={t[f.k]} onChange={e => set(f.k, f.num ? e.target.value.replace(/\D/g, '') : e.target.value)} />
          </label>
        ))}
        <div className="bl-field terms__via"><span className="bl-field__label">{T.via.label}</span><div className="bl-row">{T.via.options.map(o => <Chip key={o} on={t.via === o} onClick={() => update(x => { x.terms[x.otype].via = o })}>{o}</Chip>)}</div></div>
      </div>
      <p className="bl-caption">{T.via.hint}{T.share ? ` · комиссия билайна ${T.fee} % удерживается из выплаты` : ''}</p>
    </section>
  )
}

function Highlight({ text }: { text: string }) {
  const hit = stopHit(text)
  if (!hit) return <>{text}</>
  const [a, ...rest] = text.split(hit.word)
  return <>{a}<mark className="stop">{hit.word}</mark>{rest.join(hit.word)}</>
}

function Auto() {
  const s = useStore()
  const [edit, setEdit] = useState(false)
  const text = adText(s)
  const hit = stopHit(text)
  const k = activePoints(s).length / 2
  return (
    <>
      <div className="two">
        <section className="bl-section pad bl-stack" style={gap('16px')}>
          <h2 className="bl-h2">{s.otype === 'click' ? 'чего хотите?' : 'кому показать?'}</h2>
          {(Object.keys(GOALS) as GoalId[]).map(id => {
            const g = GOALS[id]
            return (
              <button key={id} className="bl-card choice" aria-pressed={s.goal === id} onClick={() => update(x => { x.goal = id; x.adText = null })}>
                <span className="bl-row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><span className="bl-h3">{g.t}</span><span className="choice__mark"><CheckIcon size={16} strokeWidth={3} /></span></span>
                <span className="bl-body bl-secondary">{g.d}</span>
                <span className="bl-caption">≈ {n(g.reach * k)} человек{s.otype === 'click' && ` · клик от ${g.cpc} ₽`}</span>
              </button>
            )
          })}
        </section>
        <section className="bl-section pad bl-stack" style={gap('16px')}>
          <div className="bl-row" style={{ justifyContent: 'space-between' }}><h2 className="bl-h3">объявление готово</h2><span className="bl-tag bl-tag--soft-violet"><Sparkles size={14} /> ИИ · с {CO.site} и Карт</span></div>
          {edit ? (
            <label className="bl-field"><span className="bl-field__label">текст объявления · {text.length} из 90</span>
              <textarea className="bl-input" rows={3} maxLength={90} value={text} onChange={e => update(x => { x.adText = e.target.value })} autoFocus /></label>
          ) : <p className="bl-body-l"><Highlight text={text} /></p>}
          <AnimatePresence mode="wait">
            {hit ? (
              <motion.div key="err" className="bl-notice bl-notice--error" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <AlertTriangle size={18} />
                <div className="bl-stack" style={gap('8px')}>
                  <span><b className="bl-medium">«{hit.word}»</b> не пройдёт модерацию: {hit.why}.</span>
                  <div><button className="bl-btn bl-btn--s bl-btn--dark" onClick={() => { update(x => { x.adText = text.replace(hit.word, hit.fix) }); toast('Текст исправлен, модерацию пройдёт') }}>заменить на «{hit.fix.toLowerCase()}»</button></div>
                </div>
              </motion.div>
            ) : (
              <motion.span key="ok" className="bl-caption bl-success bl-row" style={{ gap: 6 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Done size={14} />текст пройдёт модерацию</motion.span>
            )}
          </AnimatePresence>
          <div className="bl-row">
            <button className="bl-btn bl-btn--s" onClick={() => setEdit(!edit)}><PenLine size={16} />{edit ? 'готово' : 'поменять текст'}</button>
            <button className="bl-btn bl-btn--s" onClick={() => update(x => { x.img = (x.img + 1) % IMAGES.length })}><ImageIcon size={16} />поменять картинку</button>
          </div>
          <div className={`ad-img ad-img--${s.img}`} style={{ aspectRatio: '3' }}>{IMAGES[s.img]}</div>
        </section>
      </div>
      <section className="bl-section bl-section--wide pad" style={{ marginTop: 24 }}>
        <div className="bl-row" style={{ justifyContent: 'space-between', marginBottom: 16 }}><h2 className="bl-h3">так его увидят</h2><span className="bl-caption">места подобраны под цель автоматически</span></div>
        <div className="previews">
          {([['showcase', 'карточка в Витрине выгод'], ['main', 'баннер на главной'], ['paid', 'экран «Платёж прошёл»']] as const).map(([kind, t]) => (
            <figure key={kind} className="preview"><PhoneSurface kind={kind} ad={adOf(s)} compact /><figcaption className="bl-caption">{t}</figcaption></figure>
          ))}
        </div>
      </section>
    </>
  )
}

function Manual() {
  const s = useStore()
  const a = audience(s)
  const f = forecast(s)
  const bucket = (k: Bucket, t: string, sub: string, list: typeof a.any) => (
    <div className={`bucket${s.target === k ? ' is-target' : ''}`} onClick={() => update(x => { x.target = k })}>
      <button className="bucket__head" aria-pressed={s.target === k}><span className="bl-medium">{t}</span><span className="bl-micro">{sub}</span></button>
      <span className="bucket__chips">
        <AnimatePresence initial={false}>
          {list.map(x => (
            <motion.span layout key={x.id} className="bl-chip bucket__chip" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
              {x.t}
              <button className="bucket__x" aria-label={`Убрать ${x.t}`} onClick={e => { e.stopPropagation(); update(y => { delete y.aud[x.id] }) }}><X size={14} /></button>
            </motion.span>
          ))}
        </AnimatePresence>
        {!list.length && <span className="bl-caption">{s.target === k ? 'добавьте сигналы слева' : 'нажмите, чтобы добавлять сюда'}</span>}
      </span>
    </div>
  )
  return (
    <>
      <div className="two">
        <section className="bl-section pad">
          <div className="bl-row" style={{ justifyContent: 'space-between', marginBottom: 16 }}><h2 className="bl-h3">сигналы</h2><span className="bl-micro">метка показывает, насколько горячий спрос</span></div>
          {SIGNALS.map(g => (
            <div key={g.g} className="sig-group">
              <div className="bl-field__label" style={{ marginBottom: 4 }}>{g.g}</div>
              {g.items.map(x => x.v === 'off' ? (
                <div key={x.id} className="sig is-off" title="Не используем в рекламе: риск давления на уязвимых людей"><span className="sig__name">{x.t}</span><span className="bl-tag">не продаётся</span><span className="sig__btn" /></div>
              ) : (
                <div key={x.id} className="sig">
                  <span className="sig__name">{x.t}</span>
                  <span className={`bl-tag ${VALUE[x.v].cls}`}>{VALUE[x.v].t}</span>
                  {s.aud[x.id]
                    ? <button className="bl-icon-btn bl-icon-btn--s is-on sig__btn" onClick={() => update(y => { delete y.aud[x.id] })} aria-label={`Убрать ${x.t}`}><CheckIcon size={16} strokeWidth={3} /></button>
                    : <button className="bl-icon-btn bl-icon-btn--s sig__btn" onClick={() => update(y => { y.aud[x.id] = y.target })} aria-label={`Добавить ${x.t}`}><Plus size={16} /></button>}
                </div>
              ))}
            </div>
          ))}
        </section>
        <section className="bl-section pad bl-stack sticky" style={gap('12px')}>
          <h2 className="bl-h3">аудитория</h2>
          <p className="bl-caption">Выберите блок, затем добавляйте в него сигналы.</p>
          {bucket('any', 'любой из', 'расширяет охват', a.any)}
          {bucket('and', 'и', 'сужает', a.and)}
          {bucket('not', 'кроме', 'исключает', a.not)}
          <div className="bl-row" style={{ ...gap('40px'), marginTop: 8 }}>
            <div className="bl-stat"><span className="bl-stat__label">охват</span><span className="bl-stat__value"><Num value={f.reach} /></span></div>
            <div className="bl-stat"><span className="bl-stat__label">средний клик</span><span className="bl-stat__value">{a.empty ? '—' : <Num value={f.cpc} suffix=" ₽" />}</span></div>
          </div>
          {a.empty && <div className="bl-notice"><AlertTriangle size={18} />Добавьте хотя бы один сигнал в «любой из» или «и».</div>}
          {!a.empty && f.reach < 1500 && <div className="bl-notice"><AlertTriangle size={18} />Аудитория узкая, показы будут идти медленно. Уберите одно условие «и».</div>}
        </section>
      </div>
      <section className="bl-section bl-section--wide pad" style={{ marginTop: 24 }}>
        <h2 className="bl-h3" style={{ marginBottom: 16 }}>где показать</h2>
        <div className="bl-table-wrap"><table className="bl-table">
          <thead><tr><th /><th>место</th><th>формат</th><th>CTR</th><th>оплата</th></tr></thead>
          <tbody>{PLACES.map(p => (
            <tr key={p.id} className={s.places[p.id] ? '' : 'is-dim'}>
              <td style={{ width: 40 }}><label className="bl-check"><input type="checkbox" checked={s.places[p.id]} aria-label={p.t} onChange={e => update(x => { x.places[p.id] = e.target.checked })} /><span className="bl-check__box" /></label></td>
              <td>{p.t}</td><td className="bl-secondary">{p.f}</td><td>{p.ctr === null ? '—' : `${p.ctr.toLocaleString('ru-RU')} %`}</td>
              <td>{p.pay === 'показы' ? <span className="bl-tag bl-tag--soft-blue">за показы</span> : typeOf(s).payFor}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
    </>
  )
}

function planRows(s: State) {
  const f = forecast(s)
  return [['ноябрь', 1], ['декабрь', 1.15], ['январь', 1.3]].map(([mo, k]) => ({ mo: mo as string, budget: (typeOf(s).share ? f.money : s.budget) * (k as number), clicks: f.clicks * (k as number), visits: f.res * (k as number) }))
}

function Plan() {
  const s = useStore()
  const f = forecast(s)
  const rows = planRows(s)
  const a = audience(s)
  const sum = (k: 'budget' | 'clicks' | 'visits') => rows.reduce((t, r) => t + r[k], 0)
  const T = typeOf(s), money = T.share ? 'выплата вам' : 'бюджет'
  const csv = () => {
    const lines = [['месяц', `${money}, ₽`, 'клики', T.unit], ...rows.map(r => [r.mo, Math.round(r.budget), Math.round(r.clicks), Math.round(r.visits)])]
    const blob = new Blob(['﻿' + lines.map(r => r.join(';')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const el = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'медиаплан-зерно.csv' })
    el.click(); URL.revokeObjectURL(el.href); toast('Медиаплан скачан, открывается в Excel')
  }
  return (
    <div className="two">
      <section className="bl-section pad bl-stack" style={gap('24px')}>
        <div><h2 className="bl-h2">медиаплан</h2><p className="bl-caption" style={{ marginTop: 4 }}>собран из текущих настроек, режим «{modeOf(s) === 'manual' ? 'вручную' : 'автопилот'}»</p></div>
        <dl className="kv">
          <dt>аудитории</dt><dd>{modeOf(s) === 'manual' ? [...a.any, ...a.and].map(x => x.t).join(', ') || '—' : GOALS[s.goal].t}</dd>
          <dt>места показа</dt><dd>{modeOf(s) === 'manual' ? PLACES.filter(p => s.places[p.id]).map(p => p.t).join(', ') : 'подберёт автопилот'}</dd>
          <dt>точки</dt><dd>{activePoints(s).map(p => p.addr).join(', ')}</dd>
          <dt>охват</dt><dd>{n(f.reach)} человек</dd>
          <dt>тип оффера</dt><dd>{T.t}{s.otype !== 'click' && `: ${deal(s).line}`}</dd>
        </dl>
        <Bars label={`${money} по месяцам`} height={140} fmt={rub} data={rows.map(r => ({ label: r.mo, value: Math.round(r.budget) }))} />
        <div className="bl-table-wrap"><table className="bl-table">
          <thead><tr><th>месяц</th><th>{money}</th><th>клики</th><th>{T.unit}</th></tr></thead>
          <tbody>
            {rows.map(r => <tr key={r.mo}><td>{r.mo}</td><td>{rub(r.budget)}</td><td>{n(r.clicks)}</td><td>{n(r.visits)}</td></tr>)}
            <tr className="bl-medium"><td>итого</td><td>{rub(sum('budget'))}</td><td>{n(sum('clicks'))}</td><td>{n(sum('visits'))}</td></tr>
          </tbody>
        </table></div>
        <div className="bl-row no-print"><button className="bl-btn bl-btn--dark" onClick={csv}><Download size={18} />скачать в Excel</button><button className="bl-btn" onClick={() => print()}><FileDown size={18} />PDF для согласования</button></div>
      </section>
      <section className="bl-card no-print" data-theme="invert" style={{ padding: 40, borderRadius: 'var(--radius-1000)', gap: 16 }}>
        <h2 className="bl-h3">нужно больше, чем баннер?</h2>
        <p className="bl-body bl-secondary">Игра в приложении, свой раздел, розыгрыш, отдельный сегмент. Соберём с менеджером, обычная кампания может идти параллельно.</p>
        <div className="bl-row">{['игра', 'свой раздел', 'розыгрыш', 'свой сегмент'].map(x => <span key={x} className="bl-tag">{x}</span>)}</div>
        <div><button className="bl-btn bl-btn--dark" onClick={() => update(x => { x.tab = 'special' })}>обсудить с менеджером</button></div>
      </section>
    </div>
  )
}

function Special() {
  const s = useStore()
  const sp = s.special
  if (sp.sent) return (
    <motion.section className="bl-section pad bl-stack" style={{ ...gap('16px'), maxWidth: 760, margin: 0 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <span className="bl-tag bl-tag--success" style={{ alignSelf: 'flex-start' }}>заявка отправлена</span>
      <h2 className="bl-h2">менеджер свяжется в течение рабочего дня</h2>
      <p className="bl-body bl-secondary">Ольга, менеджер спецпроектов, позвонит {CO.signerShort} и пришлёт бриф. Обычную кампанию можно запустить уже сейчас.</p>
      <div className="bl-row"><button className="bl-btn" onClick={() => update(x => { x.tab = 'auto' })}>вернуться к кампании</button><button className="bl-btn bl-btn--ghost" onClick={() => update(x => { x.special = { type: 'game', task: '', budget: '300 000 – 1 млн ₽', sent: false } })}>новая заявка</button></div>
    </motion.section>
  )
  const short = sp.task.trim().length < 10
  return (
    <section className="bl-section pad bl-stack" style={{ ...gap('24px'), maxWidth: 760, margin: 0 }}>
      <div><h2 className="bl-h2">спецпроект с менеджером</h2><p className="bl-body bl-secondary" style={{ marginTop: 8 }}>Для любого бизнеса. Одна форма, остальное обсудим голосом.</p></div>
      <div className="bl-field"><span className="bl-field__label">что хотите</span><div className="bl-row">{[['game', 'игра'], ['section', 'свой раздел'], ['raffle', 'розыгрыш'], ['segment', 'свой сегмент']].map(([v, t]) => <Chip key={v} on={sp.type === v} onClick={() => update(x => { x.special.type = v })}>{t}</Chip>)}</div></div>
      <label className="bl-field"><span className="bl-field__label">задача</span><textarea className="bl-input" rows={4} value={sp.task} onChange={e => update(x => { x.special.task = e.target.value })} placeholder="Например: открываем третью точку на Таганке, хотим, чтобы о ней узнал район" /></label>
      <label className="bl-field"><span className="bl-field__label">бюджет</span><select className="bl-select" value={sp.budget} onChange={e => update(x => { x.special.budget = e.target.value })}>{['до 300 000 ₽', '300 000 – 1 млн ₽', '1–5 млн ₽', 'больше 5 млн ₽'].map(o => <option key={o}>{o}</option>)}</select></label>
      <p className="bl-caption">Контакт: {CO.signer}, {CO.phone} — из профиля компании</p>
      <div><button className="bl-btn bl-btn--primary bl-btn--l" disabled={short} onClick={() => update(x => { x.special.sent = true })}>отправить заявку</button>{short && <span className="bl-caption" style={{ marginLeft: 12 }}>опишите задачу хотя бы парой слов</span>}</div>
    </section>
  )
}

export default function Build() {
  const s = useStore()
  const nav = useNavigate()
  const t = tabOf(s)
  const f = forecast(s)
  const a = audience(s)
  const hit = stopHit(adText(s))
  const T = typeOf(s)
  const block = t === 'manual' && a.empty ? 'добавьте сигнал' : T.fields.some(x => x.num && !(+s.terms[s.otype][x.k] > 0)) ? 'заполните условия' : null
  return (
    <div className="bl-page wrap">
      <FlowHead step={1} />
      <div className="page-title">
        <div className="bl-stack" style={gap('8px')}><TypeTag /><h1 className="bl-h1">соберите кампанию</h1></div>
        <Segmented label="Режим сборки" value={t} options={TABS} onChange={v => update(x => { x.tab = v })} />
      </div>
      {s.otype !== 'click' && t !== 'special' && <Terms />}
      <AnimatePresence mode="wait">
        <motion.div key={t} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
          {t === 'auto' && <Auto />}{t === 'manual' && <Manual />}{t === 'plan' && <Plan />}{t === 'special' && <Special />}
        </motion.div>
      </AnimatePresence>
      <div className="bottombar">
        <div className="bl-row" style={gap('24px')}>
          {T.share
            ? <span><span className="bl-caption">выплатим вам</span> <b className="bl-medium"><Num value={f.money} suffix=" ₽" /></b></span>
            : <span><span className="bl-caption">бюджет</span> <b className="bl-medium">{rub(s.budget)}</b></span>}
          {s.otype === 'click'
            ? <span><span className="bl-caption">клики</span> <b className="bl-medium"><Num value={f.clicks} /></b></span>
            : <span><span className="bl-caption">{T.unit}</span> <b className="bl-medium"><Num value={f.res} /></b></span>}
          <span className="bl-hide-mobile">{s.otype === 'click'
            ? <><span className="bl-caption">придут</span> <b className="bl-medium"><Num value={f.visits} /></b></>
            : <><span className="bl-caption">{T.per}</span> <b className="bl-medium"><Num value={f.per} suffix=" ₽" /></b></>}</span>
          {hit && t === 'auto' && <span className="bl-caption bl-error bl-hide-mobile">в тексте есть правка</span>}
        </div>
        <div className="bl-row">
          <button className="bl-btn bl-hide-mobile" onClick={() => nav('/reach')}>назад</button>
          <button className={`bl-btn bl-btn--l ${t === 'special' ? 'bl-btn--dark' : 'bl-btn--primary'}`} disabled={!!block} title={block ?? undefined} onClick={() => nav('/checkout')}>{T.share ? 'к оферте' : 'к оплате'}</button>
        </div>
      </div>
    </div>
  )
}

