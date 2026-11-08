// Витрина «лучшее рядом» — эталонная поверхность: так приложение билайна встраивает рекламу платформы.
// Запрос рекламы (/public/serve) → карточки → маяк показа, когда карточка видна → клик: сайт партнёра или действие в приложении.
// Публичный API в типах кабинета не описан (api/public.yaml), поэтому здесь обычный fetch.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { LocateFixed, RefreshCw } from 'lucide-react'
import { Creative, creativeOf } from '../creative'
import { Brand, Modal, gap, toast } from '../ui'

type Ad = {
  token: string; campaignId: number; type: string; wide: boolean; impressionUrl: string; clickUrl: string
  creative: { text: string; imageUrl: string | null; erid: string; brand: string; offer: string; cta: string; line: string }
}

// ID устройства вместо MED-ID, пока DMP не подключён: случайный, хранится в браузере
function deviceId() {
  try {
    const v = localStorage.getItem('medId') ?? 'dev-' + crypto.randomUUID()
    localStorage.setItem('medId', v)
    return v
  } catch { return null }
}
const api = (url: string) => url.replace(/^https?:\/\/[^/]+/, '') // ссылки сервера — абсолютные; в разработке идём через свой адрес
const post = (url: string, body?: unknown) => fetch(api(url), { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

function Card({ ad, onAct }: { ad: Ad; onAct: (ad: Ad) => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  // показ засчитываем, когда карточка видна хотя бы наполовину — один раз
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { post(ad.impressionUrl); io.disconnect() } }, { threshold: 0.5 })
    io.observe(el)
    return () => io.disconnect()
  }, [ad.impressionUrl])
  const c = ad.creative
  return (
    <button ref={ref} className="bl-card near-card" style={ad.wide ? { gridColumn: 'span 2' } : undefined} onClick={() => onAct(ad)}>
      <Creative o={creativeOf(c.brand, c.offer, ad.campaignId, c.imageUrl)} erid={`реклама · erid ${c.erid}`} wide={ad.wide} />
      <span className="near-card__body">
        <span className="bl-medium">{c.brand}</span>
        <span className="bl-caption">{c.text}</span>
        <span className="near-card__line"><span className="bl-tag bl-tag--soft-violet">{c.cta}</span></span>
      </span>
    </button>
  )
}

export default function Near() {
  const [ads, setAds] = useState<Ad[] | null>(null)
  const [where, setWhere] = useState<{ lat: number; lon: number } | null>(null)
  const [lead, setLead] = useState<{ clickId: string; ad: Ad } | null>(null)
  const [form, setForm] = useState({ name: '', phone: '' })
  const load = () => {
    setAds(null)
    fetch('/api/public/serve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ placement: 'showcase', medId: deviceId(), ...where }) })
      .then(r => r.json()).then(r => setAds(r.ads ?? []), () => setAds([]))
  }
  useEffect(load, [where])
  const locate = () => navigator.geolocation?.getCurrentPosition(p => setWhere({ lat: p.coords.latitude, lon: p.coords.longitude }), () => toast('Не получилось определить, где вы'))

  const act = async (ad: Ad) => {
    // переход и промокод — на сайт партнёра; купон, подписка и заявка — здесь, в приложении
    if (ad.type === 'click' || ad.type === 'promo') return window.open(api(ad.clickUrl), '_blank', 'noopener')
    const { clickId } = await (await fetch(api(ad.clickUrl) + '?format=json')).json()
    if (ad.type === 'lead') return setLead({ clickId, ad })
    const r = await post(`/api/public/act/${clickId}`, {})
    toast(r.ok ? (ad.type === 'coupon' ? 'Купон ваш, оплата со счёта телефона. Покажите его на кассе' : 'Подписка подключена, оплата со счёта телефона') : ((await r.json()).message ?? 'не получилось'))
  }
  const sendLead = async () => {
    const r = await post(`/api/public/act/${lead!.clickId}`, form)
    if (!r.ok) return toast((await r.json()).message ?? 'не получилось')
    toast(`Заявка отправлена в ${lead!.ad.creative.brand}, вам перезвонят`)
    setLead(null); setForm({ name: '', phone: '' })
  }
  return (
    <div className="bl-page wrap">
      <header className="bl-header"><div className="bl-header__side"><Brand to="/near" /></div><Link className="bl-btn bl-btn--s" to="/cab/campaigns">кабинет партнёра</Link></header>
      <main className="near-main">
        <section className="near-intro">
          <div className="bl-stack" style={gap('8px')}><h1 className="bl-display-l">лучшее рядом</h1><p className="bl-body bl-secondary">Предложения партнёров билайна рядом с вами{where ? '' : ' — нажмите «рядом со мной», чтобы показать ближайшие'}.</p></div>
          <div className="bl-row"><button className="bl-btn" onClick={locate}><LocateFixed size={18} />рядом со мной</button><button className="bl-btn bl-btn--ghost" onClick={load} aria-label="Обновить"><RefreshCw size={18} /></button></div>
        </section>
        {ads === null ? <div className="bl-skeleton" style={{ height: 320 }} />
          : ads.length ? <div className="bl-grid" style={{ ['--bl-cols' as string]: 3 }}>{ads.map(ad => <Card key={ad.token} ad={ad} onAct={act} />)}</div>
          : <div className="near-empty"><h2 className="bl-h3">рядом пока нет предложений</h2><p className="bl-body bl-secondary">Партнёры запускают кампании каждый день. Загляните позже.</p></div>}
        <p className="bl-micro">Реклама. Показ, клик и результат считает рекламная платформа билайна; номер телефона партнёр не видит, пока вы сами не оставите заявку.</p>
      </main>
      <Modal open={!!lead} onClose={() => setLead(null)} label="Заявка">
        <h2 className="bl-h2">заявка в {lead?.ad.creative.brand}</h2>
        <p className="bl-caption">{lead?.ad.creative.line}</p>
        <label className="bl-field"><span className="bl-field__label">имя</span><input className="bl-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label className="bl-field"><span className="bl-field__label">телефон</span><input className="bl-input" type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+7 900 000-00-00" /></label>
        <p className="bl-micro">Отправляя, вы соглашаетесь передать имя и телефон партнёру для ответа на заявку.</p>
        <button className="bl-btn bl-btn--primary bl-btn--l bl-btn--block" disabled={form.phone.replace(/\D/g, '').length < 10} onClick={sendLead}>отправить</button>
      </Modal>
    </div>
  )
}
