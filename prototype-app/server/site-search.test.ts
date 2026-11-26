import {test} from 'node:test'
import assert from 'node:assert/strict'
import {siteSearch} from './site-search.ts'
import {siteActivityExcerpt} from '../shared/site-company.ts'

test('brand summaries end on a sentence or a word for new and previously clipped imports',()=>{
  const first='Помогаем вернуть клиентов.'
  const long=first+' Следим за визитами каждого клиента и подсказываем, когда стоит пригласить его на повторный приём.'
  assert.equal(siteActivityExcerpt(long),first)
  assert.equal(siteActivityExcerpt(long.slice(0,100),true),first)
  assert.equal(siteActivityExcerpt(long.slice(0,100)),long.slice(0,100))
  const list='Инструменты для загородного дома и строительной площадки с доставкой по городу и области каждый день недели'
  const excerpt=siteActivityExcerpt(list)
  assert.ok(excerpt.length<=100 && excerpt.endsWith('…') && list.startsWith(excerpt.slice(0,-1)+' '))
})

test('Yandex fallback accepts only the indexed page requested by the partner and returns brand context',async t=>{
  t.mock.method(globalThis,'fetch',async (input:RequestInfo|URL,init?:RequestInit)=>{
    assert.equal(input,'https://searchapi.api.cloud.yandex.net/v2/web/search')
    const body=JSON.parse(String(init?.body))
    assert.match(body.query.queryText,/vseinstrumenti\.ru/)
    assert.doesNotMatch(body.query.queryText,/tracking/)
    const xml='<response><doc><url>https://other.ru/</url><title>Другой бренд</title></doc>'+
      '<doc><url>https://www.vseinstrumenti.ru/product/</url><title>Другой товар</title></doc>'+
      '<doc><url>https://vseinstrumenti.ru/</url><title><hlword>ВсеИнструменты.ру</hlword> — Магазин</title><passages><passage>Инструменты и оборудование</passage></passages></doc></response>'
    return Response.json({rawData:Buffer.from(xml).toString('base64')})
  })
  const before=[process.env.YANDEX_SEARCH_API_KEY,process.env.YANDEX_SEARCH_FOLDER_ID]
  t.after(()=>{
    for(const [i,k] of ['YANDEX_SEARCH_API_KEY','YANDEX_SEARCH_FOLDER_ID'].entries()){
      if(before[i]===undefined)delete process.env[k];else process.env[k]=before[i]
    }
  })
  process.env.YANDEX_SEARCH_API_KEY='test'
  process.env.YANDEX_SEARCH_FOLDER_ID='test'
  const post=(website:string)=>siteSearch.request('/site-search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({website})})
  const found=await post('https://www.vseinstrumenti.ru/?utm_source=tracking')
  assert.deepEqual(await found.json(),{company:{brandName:'ВсеИнструменты.ру',activity:'Инструменты и оборудование'}})
  assert.equal((await post('https://ozon.ru/')).status,400)
  assert.equal((await post('https://www.vseinstrumenti.ru/?private=1')).status,400)
  assert.deepEqual(await (await post('https://www.vseinstrumenti.ru/promo')).json(),{company:null})
  delete process.env.YANDEX_SEARCH_API_KEY
  assert.deepEqual(await (await post('https://www.vseinstrumenti.ru/')).json(),{company:null})
})
