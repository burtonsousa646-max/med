import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, Check as CheckIcon, Copy, Download, FileDown, Image as ImageIcon, PenLine, Plus, Sparkles, X } from 'lucide-react'
import { n, rub } from '../data'
import { $api, act, useCampaign, useCatalog, useCompany, useLater, useOfferType, type Campaign, type S } from '../api'
import { PhoneSurface, type Ad } from '../mock'
import { Creative, creativeOf } from '../creative'
import { Bars } from '../charts'
import { Chip, Done, FlowHead, Num, Segmented, Switch, TypeTag, copy, toast, when } from '../ui'
import { useId } from './Flow'

const gap = (v: string) => ({ ['--bl-gap' as string]: v })
const TABS: [S['Mode'], string][] = [['auto', 'автопилот'], ['manual', 'вручную'], ['plan', 'медиаплан'], ['special', 'спецпроект']]
const VALUE: Record<'hot' | 'week' | 'wide', { t: string; cls: string }> = {
  hot: { t: 'горячий спрос 24 ч', cls: 'bl-tag--soft-green' },
  week: { t: 'событие недели', cls: 'bl-tag--soft-violet' },
  wide: { t: 'широкий интерес', cls: 'bl-tag--soft-blue' },
}

// Правка кампании: каждый экран сборки шлёт PATCH только с изменённым полем
function usePatch(id: number) {
  const m = $api.useMutation('patch', '/campaigns/{id}', act)
  return (body: S['CampaignPatch']) => m.mutate({ params: { path: { id } }, body })
}

// Широкая карточка в витрине «лучшее рядом»: первое место в разделе за наценку к цене клика или результата
function WideCard({ c }: { c: Campaign }) {
  const patch = usePatch(c.id), T = useOfferType(c.type), { wideMarkup } = useCatalog()
  if (!c.places.showcase) return null
  return (
    <div className="bl-stack" style={gap('4px')}>
      <Switch checked={c.wideCard} onChange={v => patch({ wideCard: v })} label="широкая карточка в витрине «лучшее рядом»" />
      <span className="bl-caption">первое место в разделе и карточка вдвое шире. {T.share ? 'Для купона и подписки входит в комиссию.' : `Цена ${c.type === 'click' ? 'клика' : 'результата'} выше на ${wideMarkup} %.`}</span>
    </div>
  )
}

function useAd(c: Campaign): Ad {
  const pt = useCompany().points.find(p => p.active)
  return { brand: useCompany().brand, text: c.adText, offer: c.deal.offer, img: c.img, addr: pt ? `${pt.addr} · 300 м` : undefined, cta: c.type === 'click' ? undefined : c.deal.cta }
}

function Highlight({ text, word }: { text: string; word?: string }) {
  if (!word || !text.includes(word)) return <>{text}</>
  const [a, ...rest] = text.split(word)
  return <>{a}<mark className="stop">{word}</mark>{rest.join(word)}</>
}

// Условия оффера для купона, заявки, промокода и подписки. У перехода условий нет: платит за клик.
function Terms({ c }: { c: Campaign }) {
  const T = useOfferType(c.type), patch = usePatch(c.id)
  const [terms, setTerms] = useLater(c.terms, v => patch({ terms: v }))
  return (
    <section className="bl-section bl-section--wide pad" style={{ marginBottom: 24 }}>
      <div className="bl-row" style={{ justifyContent: 'space-between', marginBottom: 16 }}><h2 className="bl-h3">условия оффера</h2><span className="bl-caption">{c.deal.line}</span></div>
      <div className="terms">
        {T.fields.map(f => (
          <label key={f.k} className={`bl-field${f.wide ? ' is-wide' : ''}${f.num && !(+terms[f.k] > 0) ? ' is-error' : ''}`}>
            <span className="bl-field__label">{f.label}{f.suffix ? `, ${f.suffix}` : ''}</span>
            <input className="bl-input" inputMode={f.num ? 'numeric' : undefined} value={terms[f.k] ?? ''} onChange={e => setTerms({ ...terms, [f.k]: f.num ? e.target.value.replace(/\D/g, '') : e.target.value })} />
          </label>
        ))}
      </div>
      {T.share && <p className="bl-caption">Комиссия билайна {T.fee} % удерживается из выплаты.</p>}
    </section>
  )
}

// Куда ведёт объявление и как партнёр сообщает о результате: у каждой кампании свои
const PARTNER_SENDS = new Set(['постбэк', 'API', 'файл раз в неделю', 'коннектор 1С', 'Битрикс24', 'amoCRM', 'коннектор к кассе'])
function LinkBlock({ c }: { c: Campaign }) {
  const T = useOfferType(c.type), patch = usePatch(c.id)
  const [url, setUrl] = useLater(c.landingUrl, v => patch({ landingUrl: v }), 800)
  const sends = PARTNER_SENDS.has(c.terms.via)
  return (
    <section className="bl-section bl-section--wide pad" style={{ marginTop: 24 }}>
      <div className="bl-row" style={{ justifyContent: 'space-between', marginBottom: 16 }}><h2 className="bl-h3">ссылка и отслеживание</h2><span className="bl-caption">переходы видны в вашей Яндекс Метрике по utm_source=beeline</span></div>
      <div className="two two--even">
        <div className="bl-stack" style={gap('12px')}>
          <label className="bl-field"><span className="bl-field__label">куда ведёт объявление</span><input className="bl-input" value={url} onChange={e => setUrl(e.target.value)} inputMode="url" /></label>
          <span className="bl-row track-code"><code>{c.trackingUrl}</code><button className="bl-icon-btn bl-icon-btn--s" aria-label="Скопировать ссылку" onClick={() => copy(c.trackingUrl, 'Адрес')}><Copy size={16} /></button></span>
          <p className="bl-caption">При каждом переходе билайн подставит свой click_id.{c.type !== 'click' && ' Сохраните его в заказе или заявке — по нему вы сообщите о результате.'}</p>
        </div>
        {c.type === 'click' ? (
          <p className="bl-body bl-secondary">За переход вы платите по клику, сообщать о результате не нужно. Визиты в точку посчитаем по обезличенным данным сети.</p>
        ) : (
          <div className="bl-stack" style={gap('12px')}>
            <div className="bl-field"><span className="bl-field__label">{T.via.label}</span><div className="bl-row">{T.via.options.map(o => <Chip key={o} on={c.terms.via === o} onClick={() => patch({ terms: { via: o } })}>{o}</Chip>)}</div></div>
            <p className="bl-caption">{T.via.hint}</p>
            <p className="bl-body">{sends
              ? <>Ключ и адрес для вашего сервера, загрузка файла — в разделе <Link to="/cab/connections">«Подключения»</Link>, один на все кампании.</>
              : <>Результаты появятся в статистике кампании, спорные засчитаете или оспорите там.</>}</p>
            {sends && <p className="bl-caption">{c.partnerEventAt ? `по этой кампании последнее событие ${when(c.partnerEventAt)}` : 'по этой кампании событий от вас ещё не было'}</p>}
          </div>
        )}
      </div>
    </section>
  )
}

function Auto({ c }: { c: Campaign }) {
  const cat = useCatalog(), co = useCompany(), patch = usePatch(c.id), ad = useAd(c)
  const [edit, setEdit] = useState(false)
  const [text, setText] = useLater(c.adText, v => patch({ adText: v }))
  const hit = c.moderation
  const k = co.points.filter(p => p.active).length / 2
  return (
    <>
      <div className="two">
        <section className="bl-section pad bl-stack" style={gap('16px')}>
          <h2 className="bl-h2">{c.type === 'click' ? 'чего хотите?' : 'кому показать?'}</h2>
          {cat.goals.map(g => (
            <button key={g.id} className="bl-card choice" aria-pressed={c.goal === g.id} onClick={() => patch({ goal: g.id })}>
              <span className="bl-row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><span className="bl-h3">{g.t}</span><span className="choice__mark"><CheckIcon size={16} strokeWidth={3} /></span></span>
              <span className="bl-body bl-secondary">{g.d}</span>
              <span className="bl-caption">≈ {n(g.reach * k)} человек{c.type === 'click' && ` · клик от ${g.cpc} ₽`}</span>
            </button>
          ))}
        </section>
        <section className="bl-section pad bl-stack" style={gap('16px')}>
          <div className="bl-row" style={{ justifyContent: 'space-between' }}><h2 className="bl-h3">объявление готово</h2><span className="bl-tag bl-tag--soft-violet"><Sparkles size={14} /> ИИ · с {co.site} и Карт</span></div>
          {edit ? (
            <label className="bl-field"><span className="bl-field__label">текст объявления · {text.length} из 90</span>
              <textarea className="bl-input" rows={3} maxLength={90} value={text} onChange={e => setText(e.target.value)} autoFocus /></label>
          ) : <p className="bl-body-l"><Highlight text={text} word={hit?.word} /></p>}
          <AnimatePresence mode="wait">
            {hit ? (
              <motion.div key="err" className="bl-notice bl-notice--error" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <AlertTriangle size={18} />
                <div className="bl-stack" style={gap('8px')}>
                  <span><b className="bl-medium">«{hit.word}»</b> не пройдёт модерацию: {hit.why}.</span>
                  <div><button className="bl-btn bl-btn--s bl-btn--dark" onClick={() => { setText(text.replace(hit.word, hit.fix)); toast('Текст исправлен, модерацию пройдёт') }}>заменить на «{hit.fix.toLowerCase()}»</button></div>
                </div>
              </motion.div>
            ) : (
              <motion.span key="ok" className="bl-caption bl-success bl-row" style={{ gap: 6 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Done size={14} />текст пройдёт модерацию</motion.span>
            )}
          </AnimatePresence>
          <div className="bl-row">
            <button className="bl-btn bl-btn--s" onClick={() => setEdit(!edit)}><PenLine size={16} />{edit ? 'готово' : 'поменять текст'}</button>
            <button className="bl-btn bl-btn--s" onClick={() => patch({ img: (c.img + 1) % cat.images.length })}><ImageIcon size={16} />поменять картинку</button>
          </div>
          <div className={`build-creative${c.wideCard ? ' build-creative--wide' : ''}`}>
            <Creative o={creativeOf(co.brand, c.deal.offer, c.img)} erid="erid после маркировки" wide={c.wideCard} />
            <span className="bl-caption">Креатив для витрины «лучшее рядом» собираем сами: ваш знак, условие крупно, картинка «{cat.images[c.img]}». Поменяете условие — креатив обновится.</span>
          </div>
          <WideCard c={c} />
        </section>
      </div>
      <section className="bl-section bl-section--wide pad" style={{ marginTop: 24 }}>
        <div className="bl-row" style={{ justifyContent: 'space-between', marginBottom: 16 }}><h2 className="bl-h3">так его увидят</h2><span className="bl-caption">места подобраны под цель автоматически</span></div>
        <div className="previews">
          {([['showcase', 'карточка в витрине «лучшее рядом»'], ['main', 'баннер на главной'], ['paid', 'экран «Платёж прошёл»']] as const).map(([kind, t]) => (
            <figure key={kind} className="preview"><PhoneSurface kind={kind} ad={{ ...ad, text }} compact /><figcaption className="bl-caption">{t}</figcaption></figure>
          ))}
        </div>
      </section>
    </>
  )
}

function Manual({ c }: { c: Campaign }) {
  const cat = useCatalog(), T = useOfferType(c.type), patch = usePatch(c.id), f = c.forecast
  const [target, setTarget] = useState<S['Bucket']>('any')
  const signals = cat.signals.flatMap(g => g.items)
  const list = (k: S['Bucket']) => signals.filter(x => c.audience[x.id] === k)
  const setAud = (sid: string, k: S['Bucket'] | null) => {
    const { [sid]: _, ...rest } = c.audience
    patch({ audience: k ? { ...rest, [sid]: k } : rest })
  }
  const bucket = (k: S['Bucket'], t: string, sub: string) => (
    <div className={`bucket${target === k ? ' is-target' : ''}`} onClick={() => setTarget(k)}>
      <button className="bucket__head" aria-pressed={target === k}><span className="bl-medium">{t}</span><span className="bl-micro">{sub}</span></button>
      <span className="bucket__chips">
        <AnimatePresence initial={false}>
          {list(k).map(x => (
            <motion.span layout key={x.id} className="bl-chip bucket__chip" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
              {x.t}
              <button className="bucket__x" aria-label={`Убрать ${x.t}`} onClick={e => { e.stopPropagation(); setAud(x.id, null) }}><X size={14} /></button>
            </motion.span>
          ))}
        </AnimatePresence>
        {!list(k).length && <span className="bl-caption">{target === k ? 'добавьте сигналы слева' : 'нажмите, чтобы добавлять сюда'}</span>}
      </span>
    </div>
  )
  return (
    <>
      <div className="two">
        <section className="bl-section pad">
          <div className="bl-row" style={{ justifyContent: 'space-between', marginBottom: 16 }}><h2 className="bl-h3">сигналы</h2><span className="bl-micro">метка показывает, насколько горячий спрос</span></div>
          {cat.signals.map(g => (
            <div key={g.g} className="sig-group">
              <div className="bl-field__label" style={{ marginBottom: 4 }}>{g.g}</div>
              {g.items.map(x => x.v === 'off' ? (
                <div key={x.id} className="sig is-off" title="Не используем в рекламе: риск давления на уязвимых людей"><span className="sig__name">{x.t}</span><span className="bl-tag">не продаётся</span><span className="sig__btn" /></div>
              ) : (
                <div key={x.id} className="sig">
                  <span className="sig__name">{x.t}</span>
                  <span className={`bl-tag ${VALUE[x.v].cls}`}>{VALUE[x.v].t}</span>
                  {c.audience[x.id]
                    ? <button className="bl-icon-btn bl-icon-btn--s is-on sig__btn" onClick={() => setAud(x.id, null)} aria-label={`Убрать ${x.t}`}><CheckIcon size={16} strokeWidth={3} /></button>
                    : <button className="bl-icon-btn bl-icon-btn--s sig__btn" onClick={() => setAud(x.id, target)} aria-label={`Добавить ${x.t}`}><Plus size={16} /></button>}
                </div>
              ))}
            </div>
          ))}
        </section>
        <section className="bl-section pad bl-stack sticky" style={gap('12px')}>
          <h2 className="bl-h3">аудитория</h2>
          <p className="bl-caption">Выберите блок, затем добавляйте в него сигналы.</p>
          {bucket('any', 'любой из', 'расширяет охват')}
          {bucket('and', 'и', 'сужает')}
          {bucket('not', 'кроме', 'исключает')}
          <div className="bl-row" style={{ ...gap('40px'), marginTop: 8 }}>
            <div className="bl-stat"><span className="bl-stat__label">охват</span><span className="bl-stat__value"><Num value={f.reach} /></span></div>
            <div className="bl-stat"><span className="bl-stat__label">средний клик</span><span className="bl-stat__value">{f.audienceEmpty ? '—' : <Num value={f.cpc} suffix=" ₽" />}</span></div>
          </div>
          {f.audienceEmpty && <div className="bl-notice"><AlertTriangle size={18} />Добавьте хотя бы один сигнал в «любой из» или «и».</div>}
          {!f.audienceEmpty && f.reach < 1500 && <div className="bl-notice"><AlertTriangle size={18} />Аудитория узкая, показы будут идти медленно. Уберите одно условие «и».</div>}
        </section>
      </div>
      <section className="bl-section bl-section--wide pad" style={{ marginTop: 24 }}>
        <h2 className="bl-h3" style={{ marginBottom: 16 }}>где показать</h2>
        <div className="bl-table-wrap"><table className="bl-table">
          <thead><tr><th /><th>место</th><th>формат</th><th>CTR</th><th>оплата</th></tr></thead>
          <tbody>{cat.places.map(p => (
            <tr key={p.id} className={c.places[p.id] ? '' : 'is-dim'}>
              <td style={{ width: 40 }}><label className="bl-check"><input type="checkbox" checked={!!c.places[p.id]} aria-label={p.t} onChange={e => patch({ places: { ...c.places, [p.id]: e.target.checked } })} /><span className="bl-check__box" /></label></td>
              <td>{p.t}</td><td className="bl-secondary">{p.f}</td><td>{p.ctr === null ? '—' : `${p.ctr.toLocaleString('ru-RU')} %`}</td>
              <td>{p.pay === 'показы' ? <span className="bl-tag bl-tag--soft-blue">за показы</span> : T.payFor}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <div style={{ marginTop: 16 }}><WideCard c={c} /></div>
      </section>
    </>
  )
}

function Plan({ c }: { c: Campaign }) {
  const cat = useCatalog(), co = useCompany(), T = useOfferType(c.type), patch = usePatch(c.id), f = c.forecast
  const rows = [['ноябрь', 1], ['декабрь', 1.15], ['январь', 1.3]].map(([mo, k]) => ({ mo: mo as string, budget: (T.share ? f.money : c.budget) * (k as number), clicks: f.clicks * (k as number), visits: f.results * (k as number) }))
  const sum = (k: 'budget' | 'clicks' | 'visits') => rows.reduce((t, r) => t + r[k], 0)
  const money = T.share ? 'выплата вам' : 'бюджет'
  const goal = cat.goals.find(g => g.id === c.goal)!
  const csv = () => {
    const lines = [['месяц', `${money}, ₽`, 'клики', T.unit], ...rows.map(r => [r.mo, Math.round(r.budget), Math.round(r.clicks), Math.round(r.visits)])]
    const blob = new Blob(['﻿' + lines.map(r => r.join(';')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const el = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'медиаплан-зерно.csv' })
    el.click(); URL.revokeObjectURL(el.href); toast('Медиаплан скачан, открывается в Excel')
  }
  return (
    <div className="two">
      <section className="bl-section pad bl-stack" style={gap('24px')}>
        <div><h2 className="bl-h2">медиаплан</h2><p className="bl-caption" style={{ marginTop: 4 }}>собран из цели автопилота и бюджета</p></div>
        <dl className="kv">
          <dt>аудитории</dt><dd>{goal.t}</dd>
          <dt>места показа</dt><dd>подберёт автопилот</dd>
          <dt>точки</dt><dd>{co.points.filter(p => p.active).map(p => p.addr).join(', ')}</dd>
          <dt>охват</dt><dd>{n(f.reach)} человек</dd>
          <dt>тип оффера</dt><dd>{T.t}{c.type !== 'click' && `: ${c.deal.line}`}</dd>
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
        <div><button className="bl-btn bl-btn--dark" onClick={() => patch({ mode: 'special' })}>обсудить с менеджером</button></div>
      </section>
    </div>
  )
}

const KINDS = [['game', 'игра'], ['section', 'свой раздел'], ['raffle', 'розыгрыш'], ['segment', 'свой сегмент']] as const
function Special({ c }: { c: Campaign }) {
  const co = useCompany(), patch = usePatch(c.id)
  const send = $api.useMutation('post', '/special-requests', act)
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>('game')
  const [task, setTask] = useState('')
  const [budget, setBudget] = useState('300 000 – 1 млн ₽')
  if (send.isSuccess) return (
    <motion.section className="bl-section pad bl-stack" style={{ ...gap('16px'), maxWidth: 760, margin: 0 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <span className="bl-tag bl-tag--success" style={{ alignSelf: 'flex-start' }}>заявка отправлена</span>
      <h2 className="bl-h2">менеджер свяжется в течение рабочего дня</h2>
      <p className="bl-body bl-secondary">Ольга, менеджер спецпроектов, позвонит {co.signerShort} и пришлёт бриф. Обычную кампанию можно запустить уже сейчас.</p>
      <div className="bl-row"><button className="bl-btn" onClick={() => patch({ mode: 'auto' })}>вернуться к кампании</button><button className="bl-btn bl-btn--ghost" onClick={() => { send.reset(); setTask('') }}>новая заявка</button></div>
    </motion.section>
  )
  const short = task.trim().length < 10
  return (
    <section className="bl-section pad bl-stack" style={{ ...gap('24px'), maxWidth: 760, margin: 0 }}>
      <div><h2 className="bl-h2">спецпроект с менеджером</h2><p className="bl-body bl-secondary" style={{ marginTop: 8 }}>Для любого бизнеса. Одна форма, остальное обсудим голосом.</p></div>
      <div className="bl-field"><span className="bl-field__label">что хотите</span><div className="bl-row">{KINDS.map(([v, t]) => <Chip key={v} on={kind === v} onClick={() => setKind(v)}>{t}</Chip>)}</div></div>
      <label className="bl-field"><span className="bl-field__label">задача</span><textarea className="bl-input" rows={4} value={task} onChange={e => setTask(e.target.value)} placeholder="Например: открываем третью точку на Таганке, хотим, чтобы о ней узнал район" /></label>
      <label className="bl-field"><span className="bl-field__label">бюджет</span><select className="bl-select" value={budget} onChange={e => setBudget(e.target.value)}>{['до 300 000 ₽', '300 000 – 1 млн ₽', '1–5 млн ₽', 'больше 5 млн ₽'].map(o => <option key={o}>{o}</option>)}</select></label>
      <p className="bl-caption">Контакт: {co.signer}, {co.phone} — из профиля компании</p>
      <div><button className="bl-btn bl-btn--primary bl-btn--l" disabled={short || send.isPending} onClick={() => send.mutate({ body: { kind, task, budget } })}>отправить заявку</button>{short && <span className="bl-caption" style={{ marginLeft: 12 }}>опишите задачу хотя бы парой слов</span>}</div>
    </section>
  )
}

export default function Build() {
  const id = useId(), c = useCampaign(id), T = useOfferType(c.type), patch = usePatch(id)
  const nav = useNavigate()
  const t = c.mode, f = c.forecast
  const block = t === 'manual' && f.audienceEmpty ? 'добавьте сигнал' : T.fields.some(x => x.num && !(+c.terms[x.k] > 0)) ? 'заполните условия' : null
  return (
    <div className="bl-page wrap">
      <FlowHead step={1} id={id} />
      <div className="page-title">
        <div className="bl-stack" style={gap('8px')}><TypeTag c={c} /><h1 className="bl-h1">соберите кампанию</h1></div>
        <Segmented label="Режим сборки" value={t} options={TABS} onChange={v => patch({ mode: v })} />
      </div>
      {c.type !== 'click' && t !== 'special' && <Terms c={c} />}
      <AnimatePresence mode="wait">
        <motion.div key={t} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
          {t === 'auto' && <Auto c={c} />}{t === 'manual' && <Manual c={c} />}{t === 'plan' && <Plan c={c} />}{t === 'special' && <Special c={c} />}
        </motion.div>
      </AnimatePresence>
      {(t === 'auto' || t === 'manual') && <LinkBlock c={c} />}
      <div className="bottombar">
        <div className="bl-row" style={gap('24px')}>
          {T.share
            ? <span><span className="bl-caption">выплатим вам</span> <b className="bl-medium"><Num value={f.money} suffix=" ₽" /></b></span>
            : <span><span className="bl-caption">бюджет</span> <b className="bl-medium">{rub(c.budget)}</b></span>}
          {c.type === 'click'
            ? <span><span className="bl-caption">клики</span> <b className="bl-medium"><Num value={f.clicks} /></b></span>
            : <span><span className="bl-caption">{T.unit}</span> <b className="bl-medium"><Num value={f.results} /></b></span>}
          <span className="bl-hide-mobile">{c.type === 'click'
            ? <><span className="bl-caption">придут</span> <b className="bl-medium"><Num value={f.visits} /></b></>
            : <><span className="bl-caption">{T.per}</span> <b className="bl-medium"><Num value={f.per} suffix=" ₽" /></b></>}</span>
          {c.moderation && t === 'auto' && <span className="bl-caption bl-error bl-hide-mobile">в тексте есть правка</span>}
        </div>
        <div className="bl-row">
          <button className="bl-btn bl-hide-mobile" onClick={() => nav(`/c/${id}/reach`)}>назад</button>
          <button className={`bl-btn bl-btn--l ${t === 'special' ? 'bl-btn--dark' : 'bl-btn--primary'}`} disabled={!!block} title={block ?? undefined} onClick={() => nav(`/c/${id}/checkout`)}>{T.share ? 'к оферте' : 'к оплате'}</button>
        </div>
      </div>
    </div>
  )
}
