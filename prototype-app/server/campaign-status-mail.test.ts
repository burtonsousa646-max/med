import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import nodemailer from 'nodemailer'

process.env.DB_PATH=':memory:'
const {db}=await import('./db.ts')
const {deliverStatusMail}=await import('./campaign-status-mail.ts')

test('status mail survives a transport outage, keeps order and claims each message once',async()=>{
  const id=randomUUID(), recipient='client@example.test', now=Date.now()
  db.prepare('insert into v4_submissions(id,draft_id,digest,data,submitted_at,mail_next_at) values (?,?,?,?,?,?)').run(id,id,'test','{}',now,now)
  const insert=db.prepare(`insert into campaign_stage_events(submission_id,version,previous,stage,employee,recipient,title,created_at,next_at) values (?,?,?,?,?,?,?,?,?)`)
  insert.run(id,1,'authorization','contract','employee@example.test',recipient,'<Тестовый оффер>',now,now)
  insert.run(id,2,'contract','review','employee@example.test',recipient,'<Тестовый оффер>',now,now)
  let initialId=''
  const from='notices@example.test'
  await deliverStatusMail(from,async message=>{initialId=String(message.messageId);throw new Error('offline')},now)
  assert.ok(initialId)
  assert.equal(await deliverStatusMail(from,async()=>assert.fail('must not overtake first message'),now+1),false)
  const transport=nodemailer.createTransport({jsonTransport:true})
  const delivered:string[]=[]
  async function deliver(message:import('nodemailer').SendMailOptions){
    const sent=JSON.parse((await transport.sendMail(message)).message.toString())
    assert.deepEqual(sent.to,[{address:recipient,name:''}])
    assert.ok(sent.html.includes('&lt;Тестовый оффер&gt;'))
    assert.match(sent.text,delivered.length===0?/Авторизация → Договор/:/Договор → Модерация/)
    delivered.push(sent.messageId)
  }
  const results=await Promise.all([deliverStatusMail(from,deliver,now+60_001),deliverStatusMail(from,deliver,now+60_001)])
  assert.deepEqual(results.sort(),[false,true])
  assert.equal(await deliverStatusMail(from,deliver,now+60_002),true)
  assert.equal(await deliverStatusMail(from,deliver,now+60_003),false)
  assert.equal(delivered[0],initialId)
  assert.equal(new Set(delivered).size,2)
})
