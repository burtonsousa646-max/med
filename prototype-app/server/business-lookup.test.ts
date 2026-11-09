import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createBusinessLookup } from './business-lookup.ts'
import { innError, phoneError, formatPhone, offerSuggestion } from '../shared/campaign-business.ts'
const call = (app: ReturnType<typeof createBusinessLookup>, inn = '7707083893') => app.request('/lookup', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({inn})})

test('checks both INN lengths and control digits, phones and offer context',()=>{
  assert.equal(innError('7707083893'),'')
  assert.equal(innError('500100732259'),'')
  for(const value of ['','7707083894','500100732258','0000000000','123','abcdefghij']) assert.ok(innError(value),value)
  for(const value of ['+7 (999) 123-45-67','8 999 123 45 67','74951234567']) assert.equal(phoneError(value),'')
  for(const value of ['', '+1 999 123 4567','+7 999 123 45', '+7 000 000 0000','call 79991234567']) assert.ok(phoneError(value),value)
  assert.equal(formatPhone('89991234567'),'+7 (999) 123-45-67')
  assert.match(offerSuggestion({name:'Мой сервис',category:'автосервис'}),/^Мой сервис:.*сервис/)
  assert.doesNotMatch(offerSuggestion({name:'Школа',category:'обучение'}),/20%|кофе/)
})

test('invalid input and unavailable service never return invented profiles',async()=>{
  let calls=0
  const app=createBusinessLookup({token:()=>undefined,request:(async()=>{calls++;throw Error()}) as typeof fetch})
  assert.equal((await call(app,'7707083894')).status,400)
  assert.equal((await call(app)).status,503)
  assert.equal(calls,0)
  assert.equal((await app.request('/lookup',{method:'POST',body:'bad json'})).status,400)
})

test('lookup maps verified matching business and keeps registered address separate',async()=>{
  const app=createBusinessLookup({token:()=> 'test-key',request:(async(url,init)=>{
    assert.equal(url,'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party')
    assert.deepEqual(JSON.parse(init!.body as string),{query:'7707083893',branch_type:'MAIN',count:1})
    return Response.json({suggestions:[{data:{inn:'7707083893',name:{short_with_opf:'ООО Пример'},state:{status:'ACTIVE'},okved:'56.10',address:{value:'г Москва, ул Примерная, 1',data:{city:'Москва'}}}}]})
  }) as typeof fetch})
  const response=await call(app); assert.equal(response.status,200)
  const body=await response.json()
  assert.equal(body.profile.name,'ООО Пример');assert.equal(body.profile.category,'кафе и рестораны')
  assert.equal(body.profile.registeredAddress,'г Москва, ул Примерная, 1')
  assert.equal(body.profile.points,undefined);assert.equal(body.profile.phone,undefined)
})

test('no result, inactive business, wrong company and upstream failure are distinct from success',async()=>{
  for(const [body,status] of [
    [{suggestions:[]},404],
    [{suggestions:[{data:{inn:'7707083893',name:{short_with_opf:'Компания'},state:{status:'LIQUIDATED'}}}]},409],
    [{suggestions:[{data:{inn:'other',name:{short_with_opf:'Компания'}}}]},502],
    [{invalid:true},502],
  ] as const) {
    const app=createBusinessLookup({token:()=> 'test',request:(async()=>Response.json(body)) as typeof fetch})
    assert.equal((await call(app)).status,status)
  }
  const app=createBusinessLookup({token:()=> 'test',request:(async()=>{throw Error('timeout')}) as typeof fetch})
  assert.equal((await call(app)).status,502)
})
