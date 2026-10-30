/* Встраивание рекламы платформы на сайт билайна (beeline.ru, Магазин, ЛК B2B).
   <div data-beeline-ads data-placement="main" data-limit="1"></div>
   <script src="https://<платформа>/embed.js" data-surface-key="<ключ поверхности>" async></script>
   Скрипт запрашивает рекламу, рисует карточки с пометкой «реклама» и erid, засчитывает показ, когда карточка видна,
   и ведёт клик через платформу (редирект на сайт партнёра с click_id). Без зависимостей. */
(function () {
  var me = document.currentScript
  var base = new URL(me.src).origin
  var key = me.getAttribute('data-surface-key') || ''
  var css = '.bla{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));font:14px/1.4 system-ui,sans-serif}' +
    '.bla a{display:flex;flex-direction:column;gap:6px;padding:16px;border-radius:16px;background:#f8f8f7;color:#191c22;text-decoration:none}' +
    '.bla b{font-size:18px}.bla small{color:#555d6d}.bla i{font-style:normal;font-size:11px;color:#555d6d}'
  var style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)

  function deviceId() {
    try {
      var v = localStorage.getItem('medId') || 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
      localStorage.setItem('medId', v)
      return v
    } catch (e) { return null }
  }

  function render(box, ads) {
    box.className = 'bla'
    ads.forEach(function (ad) {
      var a = document.createElement('a')
      a.href = ad.clickUrl
      a.target = '_blank'
      a.rel = 'noopener sponsored'
      var c = ad.creative
      a.innerHTML = '<i>реклама · ' + esc(c.brand) + ' · erid ' + esc(c.erid) + '</i><b>' + esc(c.offer) + '</b><span>' + esc(c.text) + '</span><small>' + esc(c.cta) + '</small>'
      box.appendChild(a)
      var io = new IntersectionObserver(function (e) {
        if (e[0].isIntersecting) { fetch(ad.impressionUrl, { method: 'POST', keepalive: true }); io.disconnect() }
      }, { threshold: 0.5 })
      io.observe(a)
    })
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return '&#' + ch.charCodeAt(0) + ';' }) }

  document.querySelectorAll('[data-beeline-ads]').forEach(function (box) {
    fetch(base + '/api/public/serve', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-surface-key': key },
      body: JSON.stringify({ placement: box.getAttribute('data-placement') || 'main', limit: Number(box.getAttribute('data-limit')) || undefined, medId: deviceId() }),
    }).then(function (r) { return r.json() }).then(function (r) { if (r.ads && r.ads.length) render(box, r.ads) }).catch(function () {})
  })
})()
