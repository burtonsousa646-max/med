import assert from 'node:assert/strict'
import { test } from 'node:test'
import { campaignSite, discoverSiteAssets, publicSiteAddress, siteCandidates } from './campaign-site.ts'
import { siteOfferFields } from '../shared/partner-campaign-draft.ts'
import { offerSourceHint } from '../shared/campaign-business.ts'

const page = new URL('https://autoplus.example/services/')

test('brand import tries the conventional favicon when the page has no logo and skips creative images',async()=>{
  const urls:string[]=[]
  const result=await discoverSiteAssets(page.href,async(url,kind)=>{
    urls.push(url.pathname)
    return {url,mime:kind==='html'?'text/html':'image/x-icon',body:Buffer.from(kind==='html'?'<h1>Бренд</h1><img src="/product.png">':'fixture')}
  },false,true)
  assert.deepEqual(urls,['/services/','/favicon.ico'])
  assert.equal(result.assets[0].source,'icon')
})

test('prefills an explicit promotion from page content and skips competing promotions', () => {
  const offer='<p>«Скидка&nbsp;15% по промокоду <b>SHOP15</b>»</p>'
  const site=(body:string)=>siteCandidates('<h1>Положение</h1><main>'+body+'</main>',page).profile
  const profile=site(offer+'<footer>Скидка 20% по промокоду FOOTER20</footer>')
  assert.deepEqual(siteOfferFields(profile),{cond:'Скидка 15% по промокоду SHOP15',off:'15',code:'SHOP15'})
  assert.deepEqual(siteOfferFields(site(offer+'<p>Скидка 20% по промокоду SHOP20</p>')),{cond:'Положение'})
})
const html = `
  <meta content="/cover.webp?one=1&amp;two=2" property="og:image">
  <link rel="apple-touch-icon" href="/icon.png">
  <script type="application/ld+json">{"@graph":[{"logo":{"url":"//cdn.example/brand.svg"}}]}</script>
  <!-- <img src="/comment.png"> -->
  <img class="header-logo" src="/logo.webp">
  <img data-src="tire.png" src="placeholder.png" width="800" height="600">
  <img src="/counter.gif" width="1" height="1">
  <img src="javascript:void(0)">
`

test('extracts site brand and creative candidates in priority order', () => {
  assert.deepEqual(siteCandidates(html, page), {
    profile: { name: '', subject: '', description: '' },
    logo: ['https://cdn.example/brand.svg', 'https://autoplus.example/logo.webp', 'https://autoplus.example/icon.png'],
    brand: ['https://cdn.example/brand.svg', 'https://autoplus.example/logo.webp'],
    embeddedLogos: [],
    creative: ['https://autoplus.example/cover.webp?one=1&two=2', 'https://autoplus.example/services/tire.png'],
  })
})

test('site discovery uses the final URL and keeps successful assets when one fails', async () => {
  const result = await discoverSiteAssets('https://example.test/', async (url, kind) => {
    if (kind === 'html') return { url: page, mime: 'text/html', body: Buffer.from(html) }
    if (!url.pathname.endsWith('brand.svg') && !url.pathname.endsWith('tire.png')) throw new Error('Not found')
    return { url, mime: url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'image/png', body: Buffer.from('fixture') }
  })
  assert.deepEqual(result.assets.map(asset => [asset.kind, asset.source, asset.type]), [['logo', 'brand', 'image/svg+xml'], ['creative', 'photo', 'image/png']])
})

test('site import admits public addresses and validates input without network access', async () => {
  assert.equal(publicSiteAddress('1.1.1.1'), true)
  for (const ip of ['127.0.0.1', '192.168.0.1', '169.254.169.254', '100.64.1.1', '::1', '::ffff:127.0.0.1']) {
    assert.equal(publicSiteAddress(ip), false)
  }
  const request = (website: string) => campaignSite.request('/site-assets', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ website }),
  })
  assert.equal((await request('file:///etc/hosts')).status, 400)
  assert.equal((await request('http://127.0.0.1')).status, 422)
})

test('an Ozon catalog homepage asks for a specific offer while product and store URLs can be imported', async () => {
  for (const website of ['ozon.ru','https://www.ozon.ru/?utm_source=partner']) {
    const response=await campaignSite.request('/site-assets',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({website,profileOnly:true})})
    assert.equal(response.status,422)
    assert.match((await response.json()).message,/главная страница Ozon/)
  }
  for (const url of ['https://ozon.ru/product/item-123/', 'https://www.ozon.ru/seller/store/', 'https://ozon.ru/t/123', 'https://shop.example/']) {
    assert.equal(offerSourceHint(new URL(url)), '')
  }
})

test('imports inline logos before icons and ignores commented or active SVG', async () => {
  const result = await discoverSiteAssets(page.href, async (url, kind) => ({
    url, mime: kind === 'image' ? 'image/png' : 'text/html',
    body: Buffer.from(kind === 'image' ? 'fixture' : `
      <link rel="icon" href="/icon.png">
      <!-- <svg class="logo" viewBox="0 0 20 20"><circle r="8"/></svg> -->
      <svg id="logo-script" viewBox="0 0 20 20"><path d="M1 1"/><script>x</script></svg>
      <svg class="header-logo" viewBox="0 0 100 24"><rect width="100" height="24"/></svg>`),
  }))
  assert.deepEqual(result.assets.map(asset => asset.source), ['brand', 'icon'])
  assert.match(Buffer.from(result.assets[0].base64, 'base64').toString(), /header-logo/)
})

test('uses the promoted page heading and brand metadata without treating scripts as content', async () => {
  const result = await discoverSiteAssets(page.href, async (url, kind) => {
    assert.equal(kind, 'html')
    return { url, mime: 'text/html', body: Buffer.from('<script>"<h1>Лишнее</h1>"</script><title>Главная</title><meta content="Зерно" property="og:site_name"><h1>Кофе <b>с собой</b></h1><meta name="description" content="Кофе &amp; завтраки">') }
  }, true)
  assert.deepEqual(result.profile, { name: 'Зерно', subject: 'Кофе с собой', description: 'Кофе & завтраки' })
  assert.deepEqual(result.assets, [])
})
