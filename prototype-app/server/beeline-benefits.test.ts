import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { beelineOffers, activeBeelineOffers, benefitText } from '../shared/beeline-benefits.ts'

process.env.DB_PATH = ':memory:'
process.env.ANTHROPIC_API_KEY = ''
const { market } = await import('./market.ts')
const { db } = await import('./db.ts')
after(()=>db.close())

test('snapshot keeps unique source IDs, original banners, conditions and safe links without invented codes', () => {
  assert.equal(beelineOffers.length,16)
  assert.equal(new Set(beelineOffers.map(o=>o.id)).size,16)
  for (const o of beelineOffers) {
    assert.ok(existsSync(new URL('../public'+o.image,import.meta.url)))
    assert.equal(o.offer.layout,'artwork')
    assert.equal(o.offer.promo,'')
    assert.equal(o.website,'')
    assert.match(o.source!.url,/^https:\/\/moskva\.beeline\.ru\/customers\/products\/services\/benefits\/offer\?id=\d+$/)
    assert.ok(o.source!.sections.length)
    for (const s of o.source!.sections) {
      assert.doesNotMatch(s.text,/<\/?(?:p|li|ul|ol|a)\b/)
      for (const link of s.links) assert.match(link.url,/^https:\/\//)
    }
  }
  assert.equal(benefitText('<ol><li>Первый &amp; второй</li><li>Третий</li></ol>\\n'),'• Первый & второй\n• Третий')
})

test('explicit expired offer stays in the snapshot but disappears from feed, detail and search', async () => {
  const expired = beelineOffers.find(o=>o.id.endsWith('2781'))!
  assert.equal(expired.offer.until,'2025-12-31')
  assert.equal(activeBeelineOffers('2026-11-22').length,15)
  const feed = await (await market.request('/offers')).json()
  assert.ok(feed.items.length > 0)
  assert.equal(feed.items.some((o:{id:string})=>o.id===expired.id),false)
  assert.equal((await market.request('/offers/'+expired.id)).status,404)
  const search = await market.request('/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'Флаувау'})})
  const results = (await search.json()).items
  assert.ok(results.some((o:{offer:{title:string}})=>o.offer.title.includes('Флаувау')))
  assert.equal(results.some((o:{id:string})=>o.id===expired.id),false)
})

test('category, offset and offer detail use the same imported catalogue', async () => {
  const all = (await (await market.request('/offers')).json()).items
  const {items:health,categories} = await (await market.request('/offers?category=health')).json()
  assert.equal(categories.health,health.length)
  assert.equal(categories.shopping,all.filter((o:{group:string})=>o.group==='shopping').length)
  assert.equal(Object.values<number>(categories).reduce((sum,n)=>sum+n,0),all.length)
  assert.ok(health.length)
  assert.ok(health.every((o:{group:string})=>o.group==='health'))
  assert.deepEqual((await (await market.request('/offers?offset=1')).json()).items,all.slice(1))
  const card = all.find((o:{offer:{title:string}})=>o.offer.title.includes('Флаувау'))
  assert.deepEqual(await (await market.request('/offers/'+card.id)).json(),card)
  assert.ok(card.source.sections.some((s:{text:string})=>s.text.includes('2 500 ₽')))
  assert.ok(beelineOffers.some(o=>o.source!.sections.some(s=>s.links.length>0)))
})

test('full text finds words across fields, amounts, aliases, misspellings and keyboard layouts',async()=>{
  const {searchMarket}=await import('./market-catalog.ts')
  for(const q of ['цветы 2 500 ₽','Flowwow','флаувуа','флаувау самовывозом']) {
    assert.equal(searchMarket(q,0).items[0]?.catalog?.brand,'Флаувау',q)
  }
  assert.equal(searchMarket('zyltrc',0).items[0]?.catalog?.brand,'Яндекс')
  for(const q of ['несуществующийастероид','OR (**)','...']) assert.equal(searchMarket(q,0).total,0)
})

test('search includes the whole catalogue, paginates without duplicates and processes withdrawals',async()=>{
  const {searchMarket}=await import('./market-catalog.ts')
  const insert=db.prepare('insert into market_imports values(?,?,?,?)')
  for(let i=0;i<76;i++) {
    const id='fulltext-test-'+i
    insert.run(id,i,'',JSON.stringify({...beelineOffers[0],id,catalog:{brand:'Студия линогравюры',benefit:'Урок '+i}}))
  }
  const first=searchMarket('линогравюра',0), second=searchMarket('линогравюра',48)
  assert.equal(first.total,76);assert.equal(first.items.length,48);assert.equal(first.more,true)
  assert.equal(second.total,76);assert.equal(second.more,false)
  assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,76)
  db.prepare("update market_imports set published_at=null where public_id like 'fulltext-test-%'").run()
  assert.equal(searchMarket('линогравюра',0).total,0)
})
